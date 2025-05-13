"""
WebSocket consumer for mentor and learner dashboards.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

from .models import Session, Booking, SessionRequest
from apps.notifications.models import Notification
from apps.users.models import CustomUser

class DashboardConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time updates in the dashboard.
    """
    
    async def connect(self):
        """
        Called when the websocket is handshaking.
        """
        try:
            # Get authenticated user
            user = self.scope.get('user')
            
            if not user or not user.is_authenticated:
                # Reject the connection if user is not authenticated
                print("WebSocket connection rejected: User not authenticated")
                await self.close(code=4001)
                return
            
            # Get user ID from URL path
            user_id = self.scope['url_route']['kwargs'].get('user_id')
            if not user_id:
                print("WebSocket connection rejected: No user_id in URL path")
                await self.close(code=4004)
                return
                
            # Ensure the user is connecting to their own dashboard
            if str(user.id) != str(user_id):
                print(f"WebSocket connection rejected: User ID mismatch. URL: {user_id}, Authenticated: {user.id}")
                await self.close(code=4003)
                return
                
            # Create a user-specific dashboard group
            self.dashboard_group_name = f'dashboard_{user.id}'
            self.user = user
            
            # Accept the WebSocket connection first
            await self.accept()
            print(f"WebSocket connection accepted for user {user.id}")
            
            # Join the dashboard group - make sure channel layer is available
            if not hasattr(self, 'channel_layer'):
                print("ERROR: No channel layer available!")
                await self.send(text_data=json.dumps({
                    'error': 'Channel layer not available',
                    'type': 'connection_error'
                }))
                await self.close(code=4002)
                return
                
            # Add to group
            try:
                await self.channel_layer.group_add(
                    self.dashboard_group_name,
                    self.channel_name
                )
                print(f"Added to group: {self.dashboard_group_name}")
            except Exception as e:
                print(f"Error adding to group: {str(e)}")
                await self.send(text_data=json.dumps({
                    'error': f'Failed to join dashboard group: {str(e)}',
                    'type': 'connection_error'
                }))
                await self.close(code=4005)
                return
                
            # Send initial dashboard data
            await self.send_dashboard_data()
            
        except Exception as e:
            print(f"Error in WebSocket connect: {str(e)}")
            # Try to send an error message before closing
            try:
                await self.send(text_data=json.dumps({
                    'error': f'Connection error: {str(e)}',
                    'type': 'connection_error'
                }))
            except:
                pass
            await self.close(code=4000)
    
    async def disconnect(self, code):
        """
        Called when the WebSocket closes.
        """
        try:
            # Only attempt to leave the group if we successfully joined it
            if hasattr(self, 'dashboard_group_name') and hasattr(self, 'channel_layer'):
                try:
                    # Leave room group
                    await self.channel_layer.group_discard(
                        self.dashboard_group_name,
                        self.channel_name
                    )
                    print(f"User disconnected from dashboard group: {self.dashboard_group_name}, code: {code}")
                except Exception as group_error:
                    print(f"Error leaving dashboard group: {str(group_error)}")
            else:
                print(f"Disconnected without group membership, code: {code}")
                
            if hasattr(self, 'user'):
                print(f"User {self.user.id} disconnected from dashboard WebSocket")
            else:
                print(f"Unknown user disconnected from dashboard WebSocket")
                
        except Exception as e:
            print(f"Error in dashboard consumer disconnect: {str(e)}")
    
    async def receive(self, text_data=None, bytes_data=None):
        """
        Called when we get data from the client.
        """
        if not text_data:
            return
            
        try:
            data = json.loads(text_data)
            action = data.get('action')
            print(f"Received WebSocket action: {action}")
            
            if action == 'get_dashboard_data':
                await self.send_dashboard_data()
                
            elif action == 'mark_notification_read':
                notification_id = data.get('notification_id')
                if notification_id:
                    try:
                        # Use await with database_sync_to_async functions - it now returns a result instead of sending directly
                        result = await self.mark_notification_read(notification_id)
                        
                        # Now send the result to the client
                        await self.send(text_data=json.dumps({
                            'type': 'notification_read',
                            'notification_id': result.get('notification_id'),
                            'success': result.get('success'),
                            'error': result.get('error', None)
                        }))
                        
                        # Also notify all clients if successful
                        if result.get('success'):
                            await self.channel_layer.send(self.channel_name, {
                                "type": "notification_update",
                                "action": "mark_read",
                                "notification_id": notification_id
                            })
                    except Exception as notify_error:
                        print(f"Error marking notification read: {str(notify_error)}")
                        await self.send(text_data=json.dumps({
                            'type': 'error',
                            'message': 'Failed to mark notification as read'
                        }))
                    
            elif action == 'mark_all_notifications_read':
                try:
                    # Use await with database_sync_to_async functions - it now returns a result instead of sending directly
                    result = await self.mark_all_notifications_read()
                    
                    # Now send the result to the client
                    await self.send(text_data=json.dumps({
                        'type': 'all_notifications_read',
                        'success': result.get('success'),
                        'count': result.get('count', 0)
                    }))
                    
                    # Also notify all clients if successful
                    if result.get('success'):
                        await self.channel_layer.send(self.channel_name, {
                            "type": "notification_update",
                            "action": "mark_all_read"
                        })
                except Exception as notify_error:
                    print(f"Error marking all notifications read: {str(notify_error)}")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Failed to mark notifications as read'
                    }))
            else:
                print(f"Unknown WebSocket action received: {action}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Unknown action: {action}'
                }))
                
        except json.JSONDecodeError:
            print("Invalid JSON received in WebSocket message")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid message format'
            }))
        except Exception as e:
            print(f"Error in dashboard consumer receive: {str(e)}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Error processing request'
            }))
    
    async def session_update(self, event):
        """
        Called when there's an update to a session.
        """
        # Forward the update to the client
        await self.send(text_data=json.dumps({
            'type': 'session_update',
            'session': event.get('session', {}),
            'action': event.get('action', 'updated'),
            'timestamp': timezone.now().isoformat()
        }))
    
    async def booking_update(self, event):
        """
        Called when there's an update to a booking.
        """
        # Forward the update to the client
        await self.send(text_data=json.dumps({
            'type': 'booking_update',
            'booking': event.get('booking', {}),
            'action': event.get('action', 'updated'),
            'timestamp': timezone.now().isoformat()
        }))
    
    async def notification_update(self, event):
        """
        Called when there's a new notification.
        """
        # Forward the notification to the client
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'notification': event.get('notification', {}),
            'timestamp': timezone.now().isoformat()
        }))
    
    async def session_request_update(self, event):
        """
        Called when there's an update to a session request.
        """
        # Forward the update to the client
        await self.send(text_data=json.dumps({
            'type': 'session_request_update',
            'request': event.get('request', {}),
            'action': event.get('action', 'updated'),
            'timestamp': timezone.now().isoformat()
        }))
    
    async def send_dashboard_data(self):
        """
        Send initial dashboard data to the client.
        """
        user = self.scope['user']
        
        # Get relevant data based on user type
        if user.is_mentor:
            data = await self.get_mentor_dashboard_data(user)
        else:
            data = await self.get_learner_dashboard_data(user)
        
        await self.send(text_data=json.dumps({
            'type': 'dashboard_data',
            'data': data,
            'timestamp': timezone.now().isoformat()
        }))
    
    @database_sync_to_async
    def get_mentor_dashboard_data(self, user):
        """
        Get dashboard data for mentors.
        """
        # Get upcoming sessions
        upcoming_sessions = []
        for session in Session.objects.filter(
            mentor=user,
            status='scheduled',
            schedule__gte=timezone.now()
        ).order_by('schedule')[:5]:
            upcoming_sessions.append({
                'id': session.id,
                'title': session.title,
                'schedule': session.schedule.isoformat(),
                'duration': session.duration,
                'bookings_count': session.bookings.filter(status='confirmed').count(),
                'max_participants': session.max_participants,
                'price': float(session.price),
                'status': session.status
            })
        
        # Get recent session requests
        session_requests = []
        for req in SessionRequest.objects.filter(
            mentor=user,
            status='pending'
        ).order_by('-created_at')[:5]:
            session_requests.append({
                'id': req.id,
                'title': req.title,
                'learner': {
                    'id': req.learner.id,
                    'username': req.learner.username,
                    'full_name': f"{req.learner.first_name} {req.learner.last_name}".strip()
                },
                'proposed_time': req.proposed_time.isoformat(),
                'duration': req.duration,
                'budget': float(req.budget),
                'status': req.status,
                'created_at': req.created_at.isoformat()
            })
        
        # Get unread notifications
        notifications = []
        for notification in Notification.objects.filter(
            user=user,
            read=False
        ).order_by('-created_at')[:10]:
            notifications.append({
                'id': notification.id,
                'title': notification.title,
                'message': notification.message,
                'created_at': notification.created_at.isoformat(),
                'notification_type': notification.notification_type,
                'reference_id': notification.reference_id,
                'read': notification.read
            })
        
        return {
            'upcoming_sessions': upcoming_sessions,
            'session_requests': session_requests,
            'notifications': notifications,
            'stats': {
                'total_sessions': Session.objects.filter(mentor=user).count(),
                'active_sessions': Session.objects.filter(mentor=user, status='scheduled').count(),
                'total_bookings': Booking.objects.filter(session__mentor=user).count(),
                'pending_requests': SessionRequest.objects.filter(mentor=user, status='pending').count()
            }
        }
    
    @database_sync_to_async
    def get_learner_dashboard_data(self, user):
        """
        Get dashboard data for learners.
        """
        # Get upcoming bookings
        upcoming_bookings = []
        for booking in Booking.objects.filter(
            learner=user,
            status='confirmed',
            session__schedule__gte=timezone.now()
        ).order_by('session__schedule')[:5]:
            upcoming_bookings.append({
                'id': booking.id,
                'session': {
                    'id': booking.session.id,
                    'title': booking.session.title,
                    'schedule': booking.session.schedule.isoformat(),
                    'duration': booking.session.duration,
                    'price': float(booking.session.price),
                    'mentor': {
                        'id': booking.session.mentor.id,
                        'username': booking.session.mentor.username,
                        'full_name': f"{booking.session.mentor.first_name} {booking.session.mentor.last_name}".strip()
                    }
                },
                'status': booking.status,
                'created_at': booking.created_at.isoformat()
            })
        
        # Get recent session requests
        session_requests = []
        for req in SessionRequest.objects.filter(
            learner=user
        ).order_by('-created_at')[:5]:
            session_requests.append({
                'id': req.id,
                'title': req.title,
                'mentor': {
                    'id': req.mentor.id,
                    'username': req.mentor.username,
                    'full_name': f"{req.mentor.first_name} {req.mentor.last_name}".strip()
                } if req.mentor else None,
                'proposed_time': req.proposed_time.isoformat(),
                'duration': req.duration,
                'budget': float(req.budget),
                'status': req.status,
                'created_at': req.created_at.isoformat(),
                'counter_offer': float(req.counter_offer) if req.counter_offer else None,
                'counter_time': req.counter_time.isoformat() if req.counter_time else None
            })
        
        # Get unread notifications
        notifications = []
        for notification in Notification.objects.filter(
            user=user,
            read=False
        ).order_by('-created_at')[:10]:
            notifications.append({
                'id': notification.id,
                'title': notification.title,
                'message': notification.message,
                'created_at': notification.created_at.isoformat(),
                'notification_type': notification.notification_type,
                'reference_id': notification.reference_id,
                'read': notification.read
            })
        
        return {
            'upcoming_bookings': upcoming_bookings,
            'session_requests': session_requests,
            'notifications': notifications,
            'stats': {
                'total_bookings': Booking.objects.filter(learner=user).count(),
                'active_bookings': Booking.objects.filter(
                    learner=user, 
                    status='confirmed',
                    session__schedule__gte=timezone.now()
                ).count(),
                'session_requests': SessionRequest.objects.filter(learner=user).count(),
                'pending_requests': SessionRequest.objects.filter(
                    learner=user, 
                    status__in=['pending', 'countered']
                ).count()
            }
        }
    
    @database_sync_to_async
    def mark_notification_read(self, notification_id):
        """
        Mark a notification as read.
        """
        try:
            notification = Notification.objects.get(
                id=notification_id,
                user=self.scope['user']
            )
            notification.read = True
            notification.save()
            
            # Return data for later sending - don't call send() directly in a database_sync_to_async method
            return {
                'success': True,
                'notification_id': notification_id
            }
        except Notification.DoesNotExist:
            # Return error information
            return {
                'success': False,
                'notification_id': notification_id,
                'error': 'Notification not found'
            }
    
    @database_sync_to_async
    def mark_all_notifications_read(self):
        """
        Mark all notifications as read for the user.
        """
        # Mark all notifications as read
        updated_count = Notification.objects.filter(
            user=self.scope['user'],
            read=False
        ).update(read=True)
        
        # Return data for later sending - don't call send() directly in a database_sync_to_async method
        return {
            'success': True,
            'count': updated_count
        }