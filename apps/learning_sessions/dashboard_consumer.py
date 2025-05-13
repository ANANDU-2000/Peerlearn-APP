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
            print(f"WebSocket connection attempt from {self.scope.get('client')}")
            
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
            
            # Send a welcome message immediately to ensure connection is working
            try:
                await self.send(text_data=json.dumps({
                    'type': 'connection_established',
                    'message': f'Connected to dashboard for user {user.id}',
                    'timestamp': timezone.now().isoformat()
                }))
                print(f"Sent welcome message to user {user.id}")
            except Exception as e:
                print(f"Error sending welcome message: {str(e)}")
            
            # Join the dashboard group - make sure channel layer is available
            try:
                from channels.layers import get_channel_layer
                if not hasattr(self, 'channel_layer') or self.channel_layer is None:
                    self.channel_layer = get_channel_layer()
                    print(f"Retrieved channel layer: {self.channel_layer.__class__.__name__}")
                
                if not self.channel_layer:
                    print("ERROR: Failed to get channel layer")
                    await self.send(text_data=json.dumps({
                        'error': 'Channel layer not available',
                        'type': 'connection_error'
                    }))
                    await self.close(code=4002)
                    return
            except Exception as e:
                print(f"ERROR getting channel layer: {str(e)}")
                await self.send(text_data=json.dumps({
                    'error': f'Failed to get channel layer: {str(e)}',
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
                
                # Send another confirmation after joining group
                await self.send(text_data=json.dumps({
                    'type': 'joined_group',
                    'group': self.dashboard_group_name,
                    'timestamp': timezone.now().isoformat()
                }))
            except Exception as e:
                print(f"Error joining group: {str(e)}")
                await self.send(text_data=json.dumps({
                    'error': f'Failed to join group: {str(e)}',
                    'type': 'connection_error'
                }))
                await self.close(code=4002)
                return
            
            # Send initial dashboard data
            try:
                await self.send_dashboard_data()
                print(f"Sent initial dashboard data to user {user.id}")
            except Exception as e:
                print(f"Error sending dashboard data: {str(e)}")
                await self.send(text_data=json.dumps({
                    'error': f'Error loading dashboard data: {str(e)}',
                    'type': 'data_error'
                }))
            
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
            # Log the disconnection with the close code
            user_id = "unknown"
            if hasattr(self, 'user') and self.user:
                user_id = self.user.id
                print(f"WebSocket disconnection: User {user_id} with code {code}")
            else:
                print(f"WebSocket disconnection: Unknown user with code {code}")
                
            # Get a better description of the close code
            code_descriptions = {
                1000: "Normal closure",
                1001: "Going away (page navigation)",
                1006: "Abnormal closure (connection lost)",
                1011: "Internal server error",
                4000: "Generic error",
                4001: "Not authenticated",
                4002: "Channel layer error",
                4003: "User ID mismatch",
                4004: "No user ID in URL"
            }
            close_reason = code_descriptions.get(code, "Unknown reason")
            print(f"Close reason: {close_reason}")
            
            # Leave dashboard group
            if hasattr(self, 'dashboard_group_name') and hasattr(self, 'channel_layer'):
                await self.channel_layer.group_discard(
                    self.dashboard_group_name,
                    self.channel_name
                )
                print(f"User {user_id} removed from dashboard group: {self.dashboard_group_name}")
        except Exception as e:
            print(f"Error in dashboard consumer disconnect: {str(e)}")
    
    async def receive(self, text_data=None, bytes_data=None):
        """
        Called when we get data from the client.
        """
        try:
            if not text_data:
                print("Received empty WebSocket message")
                return
                
            print(f"Received WebSocket message: {text_data[:100]}...")
            data = json.loads(text_data)
            action = data.get('action')
            
            print(f"Processing WebSocket action: {action}")
            
            # Handle message type if action is not specified
            message_type = data.get('type')
            if not action and message_type == 'get_data':
                await self.send_dashboard_data()
                return
            
            if action == 'get_dashboard_data':
                # Request dashboard data
                try:
                    await self.send_dashboard_data()
                    print(f"Sent dashboard data to user {self.user.id}")
                except Exception as e:
                    error_msg = f"Error sending dashboard data: {str(e)}"
                    print(error_msg)
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Error loading dashboard data',
                        'details': str(e)
                    }))
                
            elif action == 'mark_notification_read':
                # Mark notification as read
                notification_id = data.get('notification_id')
                if notification_id:
                    try:
                        result = await database_sync_to_async(self.mark_notification_read)(notification_id)
                        await self.send(text_data=json.dumps({
                            'type': 'notification_read',
                            'notification_id': notification_id,
                            'success': result,
                            'timestamp': timezone.now().isoformat()
                        }))
                    except Exception as notify_error:
                        error_msg = f"Error marking notification read: {str(notify_error)}"
                        print(error_msg)
                        await self.send(text_data=json.dumps({
                            'type': 'error',
                            'message': 'Failed to mark notification as read',
                            'details': str(notify_error)
                        }))
                else:
                    print("Missing notification_id in mark_notification_read action")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Missing notification ID'
                    }))
                    
            elif action == 'mark_all_notifications_read':
                # Mark all notifications as read
                try:
                    print(f"Marking all notifications read for user {self.user.id}")
                    # Use await with database_sync_to_async functions
                    result = await database_sync_to_async(self.mark_all_notifications_read)()
                    
                    # Send the result to the client
                    await self.send(text_data=json.dumps({
                        'type': 'all_notifications_read',
                        'success': result.get('success'),
                        'count': result.get('count', 0),
                        'timestamp': timezone.now().isoformat()
                    }))
                except Exception as notify_error:
                    error_msg = f"Error marking all notifications read: {str(notify_error)}"
                    print(error_msg)
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Failed to mark all notifications as read',
                        'details': str(notify_error)
                    }))
                    
            elif action == 'get_data':
                # Legacy action name for get_dashboard_data
                await self.send_dashboard_data()
                
            else:
                print(f"Unknown WebSocket action received: {action}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Unknown action: {action if action else "No action specified"}'
                }))
                
        except json.JSONDecodeError as json_err:
            print(f"Invalid JSON received in WebSocket message: {str(json_err)}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid message format',
                'details': 'Message is not valid JSON'
            }))
        except Exception as e:
            error_msg = f"Error in dashboard consumer receive: {str(e)}"
            print(error_msg)
            try:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Error processing request',
                    'details': str(e)
                }))
            except Exception as send_err:
                print(f"Error sending error response: {str(send_err)}")
    
    async def session_update(self, event):
        """
        Called when there's an update to a session.
        """
        try:
            print(f"Received session_update event: action={event.get('action')}, session_id={event.get('session', {}).get('id')}")
            
            # Forward the update to the client
            await self.send(text_data=json.dumps({
                'type': 'session_update',
                'session': event.get('session', {}),
                'action': event.get('action', 'updated'),
                'timestamp': timezone.now().isoformat()
            }))
            
            print(f"Sent session_update to client: action={event.get('action')}")
        except Exception as e:
            print(f"Error in session_update handler: {str(e)}")
    
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
            
        # Send data to client
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
            # Create title from the message for UI display
            short_message = notification.message[:30] + ("..." if len(notification.message) > 30 else "")
            notifications.append({
                'id': notification.id,
                'title': short_message,  # Use short message as title
                'message': notification.message,
                'created_at': notification.created_at.isoformat(),
                'link': notification.link,
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
                'created_at': req.created_at.isoformat()
            })
        
        # Get unread notifications
        notifications = []
        for notification in Notification.objects.filter(
            user=user,
            read=False
        ).order_by('-created_at')[:10]:
            # Create title from message for UI display
            short_message = notification.message[:30] + ("..." if len(notification.message) > 30 else "")
            notifications.append({
                'id': notification.id,
                'title': short_message,  # Use short message as title
                'message': notification.message,
                'created_at': notification.created_at.isoformat(),
                'link': notification.link,
                'read': notification.read
            })
        
        return {
            'upcoming_bookings': upcoming_bookings,
            'session_requests': session_requests,
            'notifications': notifications,
            'stats': {
                'total_bookings': Booking.objects.filter(learner=user).count(),
                'confirmed_bookings': Booking.objects.filter(learner=user, status='confirmed').count(),
                'upcoming_bookings': Booking.objects.filter(
                    learner=user, 
                    status='confirmed',
                    session__schedule__gte=timezone.now()
                ).count(),
                'total_requests': SessionRequest.objects.filter(learner=user).count()
            }
        }
    
    def mark_notification_read(self, notification_id):
        """
        Mark a notification as read.
        """
        try:
            # Find notification and ensure it belongs to the current user
            notification = Notification.objects.get(id=notification_id, user=self.user)
            notification.read = True
            notification.save()
            print(f"Marked notification {notification_id} as read for user {self.user.id}")
            return True
        except Notification.DoesNotExist:
            print(f"Notification {notification_id} not found for user {self.user.id}")
            return False
        except Exception as e:
            print(f"Error marking notification {notification_id} as read: {str(e)}")
            return False
    
    def mark_all_notifications_read(self):
        """
        Mark all notifications for the current user as read.
        """
        try:
            # Update all unread notifications for this user
            count = Notification.objects.filter(user=self.user, read=False).update(read=True)
            print(f"Marked {count} notifications as read for user {self.user.id}")
            return {
                'success': True,
                'count': count
            }
        except Exception as e:
            print(f"Error marking all notifications as read: {str(e)}")
            return {
                'success': False,
                'count': 0,
                'error': str(e)
            }