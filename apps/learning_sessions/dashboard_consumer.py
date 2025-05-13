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
        user = self.scope['user']
        
        if not user.is_authenticated:
            # Reject the connection if user is not authenticated
            await self.close()
            return
        
        # Get user ID from URL path
        user_id = self.scope['url_route']['kwargs']['user_id']
        
        # Ensure the user is connecting to their own dashboard
        if str(user.id) != user_id:
            await self.close()
            return
        
        # Create a user-specific dashboard group
        self.dashboard_group_name = f'dashboard_{user.id}'
        
        # Join room group
        await self.channel_layer.group_add(
            self.dashboard_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send initial dashboard data
        await self.send_dashboard_data()
    
    async def disconnect(self, close_code):
        """
        Called when the WebSocket closes.
        """
        # Leave room group
        await self.channel_layer.group_discard(
            self.dashboard_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """
        Called when we get a text frame from the client.
        """
        data = json.loads(text_data)
        action = data.get('action')
        
        if action == 'get_dashboard_data':
            await self.send_dashboard_data()
        
        elif action == 'mark_notification_read':
            notification_id = data.get('notification_id')
            await self.mark_notification_read(notification_id)
        
        elif action == 'mark_all_notifications_read':
            await self.mark_all_notifications_read()
    
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
            
            # Send confirmation to client
            return self.send(text_data=json.dumps({
                'type': 'notification_read',
                'notification_id': notification_id,
                'success': True
            }))
        except Notification.DoesNotExist:
            return self.send(text_data=json.dumps({
                'type': 'notification_read',
                'notification_id': notification_id,
                'success': False,
                'error': 'Notification not found'
            }))
    
    @database_sync_to_async
    def mark_all_notifications_read(self):
        """
        Mark all notifications as read for the user.
        """
        Notification.objects.filter(
            user=self.scope['user'],
            read=False
        ).update(read=True)
        
        # Send confirmation to client
        return self.send(text_data=json.dumps({
            'type': 'all_notifications_read',
            'success': True
        }))