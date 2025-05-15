"""
WebSocket consumers for learning sessions.
"""
import json
import logging
import asyncio
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer, AsyncJsonWebsocketConsumer
from channels.exceptions import StopConsumer
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import Session, Booking
from apps.users.models import CustomUser
from apps.notifications.models import Notification

logger = logging.getLogger(__name__)
User = get_user_model()

class SessionsConsumer(AsyncJsonWebsocketConsumer):
    """
    Consumer for general sessions list subscriptions.
    This handles real-time updates for the sessions list page.
    """
    
    async def connect(self):
        """
        Called when the websocket is handshaking.
        """
        # Log connection attempt with client info
        client_info = f"{self.scope['client'][0]}:{self.scope['client'][1]}"
        logger.info(f"WebSocket connection attempt to sessions list from {client_info}")
        
        # Add to the sessions group
        self.group_name = "sessions_list"
        
        # Accept the connection
        await self.accept()
        logger.info(f"WebSocket connection accepted for sessions list")
        
        # Set up channel layer if available
        if hasattr(self, 'channel_layer'):
            # Join the sessions group
            await self.channel_layer.group_add(
                self.group_name,
                self.channel_name
            )
        
        # Send welcome message
        await self.send_json({
            'type': 'welcome',
            'message': 'Connected to sessions WebSocket'
        })
    
    async def disconnect(self, code):
        """
        Called when the WebSocket closes.
        """
        logger.info(f"WebSocket disconnection from sessions list with code {code}")
        
        # Leave the sessions group if channel layer is available
        if hasattr(self, 'channel_layer'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
    
    async def receive_json(self, content, **kwargs):
        """
        Called when we receive a text frame from the client.
        """
        # Log the received message type
        message_type = content.get('type', 'unknown')
        logger.info(f"Received {message_type} message for sessions list")
        
        if message_type == 'get_sessions':
            # Handle request for sessions list
            await self.send_sessions_list()
            
        elif message_type == 'fetch_sessions':
            # Handle request for sessions list with optional filters
            filters = content.get('filters', {})
            await self.fetch_sessions(filters)
            
        elif message_type == 'subscribe':
            # Handle subscription to specific session channel
            channel = content.get('channel')
            if channel:
                await self.subscribe_to_channel(channel)
                
        elif message_type == 'unsubscribe':
            # Handle unsubscription from specific session channel
            channel = content.get('channel')
            if channel:
                await self.unsubscribe_from_channel(channel)
    
    async def send_sessions_list(self):
        """
        Send the current list of available sessions.
        """
        # Implement retrieving and sending sessions list
        await self.send_json({
            'type': 'sessions_list',
            'message': 'Sessions list would be sent here',
            'sessions': [] # Empty list for now, would be filled with actual sessions
        })
        
    async def fetch_sessions(self, filters=None):
        """
        Fetch and send sessions list with optional filters.
        """
        sessions = await self.get_filtered_sessions(filters)
        
        await self.send_json({
            'type': 'sessions_data',
            'sessions': sessions
        })
        
    async def subscribe_to_channel(self, channel):
        """
        Subscribe to a specific channel for receiving updates.
        """
        if not hasattr(self, 'subscribed_channels'):
            self.subscribed_channels = set()
            
        # Validate channel format (e.g., "sessions:123")
        if not channel.startswith(('sessions:', 'session:')):
            logger.warning(f"Invalid channel format: {channel}")
            await self.send_json({
                'type': 'error',
                'message': 'Invalid channel format'
            })
            return
            
        logger.info(f"Subscribing to channel: {channel}")
        
        # Add to the specific group
        await self.channel_layer.group_add(
            channel,
            self.channel_name
        )
        
        # Add to our tracked subscriptions
        self.subscribed_channels.add(channel)
        
        # Acknowledge subscription
        await self.send_json({
            'type': 'subscription_success',
            'channel': channel,
            'message': f'Subscribed to {channel}'
        })
        
    async def unsubscribe_from_channel(self, channel):
        """
        Unsubscribe from a specific channel.
        """
        if not hasattr(self, 'subscribed_channels') or channel not in self.subscribed_channels:
            await self.send_json({
                'type': 'error',
                'message': f'Not subscribed to {channel}'
            })
            return
            
        logger.info(f"Unsubscribing from channel: {channel}")
        
        # Remove from the specific group
        await self.channel_layer.group_discard(
            channel,
            self.channel_name
        )
        
        # Remove from our tracked subscriptions
        self.subscribed_channels.remove(channel)
        
        # Acknowledge unsubscription
        await self.send_json({
            'type': 'unsubscription_success',
            'channel': channel,
            'message': f'Unsubscribed from {channel}'
        })
        
    @sync_to_async
    def get_filtered_sessions(self, filters=None):
        """
        Get sessions with the given filters.
        """
        from django.forms.models import model_to_dict
        from django.db.models import Count, Q
        from datetime import datetime, timedelta
        
        if filters is None:
            filters = {}
            
        # Get base queryset - only include scheduled and live sessions
        queryset = Session.objects.filter(status__in=['scheduled', 'live'])
        
        # Apply status filter if provided
        status = filters.get('status')
        if status:
            queryset = queryset.filter(status=status)
            
        # Apply date filters if provided
        date_filter = filters.get('date')
        if date_filter == 'today':
            today = datetime.now().date()
            queryset = queryset.filter(
                schedule__date=today
            )
        elif date_filter == 'upcoming':
            now = datetime.now()
            queryset = queryset.filter(
                schedule__gt=now,
                status='scheduled'
            )
        elif date_filter == 'past':
            now = datetime.now()
            queryset = queryset.filter(
                Q(schedule__lt=now) | Q(status='completed')
            )
            
        # Apply mentor filter if provided
        mentor_id = filters.get('mentor_id')
        if mentor_id:
            queryset = queryset.filter(mentor_id=mentor_id)
            
        # Count bookings
        queryset = queryset.annotate(
            booking_count=Count('bookings', filter=Q(bookings__status='confirmed'))
        )
        
        # Limit results
        limit = int(filters.get('limit', 20))
        queryset = queryset.order_by('-schedule')[:limit]
        
        # Convert to dicts for JSON serialization
        result = []
        for session in queryset:
            session_dict = model_to_dict(
                session, 
                fields=['id', 'title', 'description', 'status', 'room_code']
            )
            
            # Add additional computed fields
            session_dict.update({
                'mentor_name': session.mentor.get_full_name() or session.mentor.username,
                'mentor_id': session.mentor.id,
                'schedule': session.schedule.isoformat() if session.schedule else None,
                'duration': session.duration,
                'price': float(session.price) if session.price else 0,
                'confirmed_bookings_count': session.booking_count,
                'max_participants': session.max_participants,
                'can_book': session.status == 'scheduled' and session.booking_count < session.max_participants,
                'can_go_live': session.can_go_live(),
                'can_edit': session.can_edit(),
                'image_url': session.image.url if session.image else None,
            })
            
            result.append(session_dict)
            
        return result
    
    async def session_update(self, event):
        """
        Called when a session is updated.
        """
        # Forward the update to the client
        await self.send_json(event)

class SessionConsumer(AsyncWebsocketConsumer):
    """
    Consumer for session WebRTC signaling and real-time chat.
    Handles WebRTC offer/answer exchange and ICE candidates.
    """
    
    async def connect(self):
        """
        Called when the websocket is handshaking.
        """
        try:
            self.room_code = self.scope['url_route']['kwargs']['room_code']
            # Create a simple alphanumeric group name
            import hashlib
            # Create a hash of the room code to ensure we get valid characters
            hashed_code = hashlib.md5(self.room_code.encode()).hexdigest()[:8]
            self.room_group_name = f'room_{hashed_code}'
            
            # Log connection attempt
            logger.info(f"WebSocket connection attempt to room {self.room_code} with group {self.room_group_name}")
            
            # Get the session and check permissions
            session = await self.get_session()
            if not session:
                # Session doesn't exist
                logger.warning(f"Session {self.room_code} not found")
                await self.close()
                return
        except Exception as e:
            logger.error(f"Error in WebSocket connect: {str(e)}")
            await self.close()
            return
            await self.close()
            return
        
        user = self.scope['user']
        if not user.is_authenticated:
            # User not authenticated
            logger.warning(f"Unauthenticated user attempted to join room {self.room_code}")
            await self.close()
            return
        
        # Check if user has permission to join
        can_join = await self.can_join_session(session, user)
        if not can_join:
            # User doesn't have permission
            logger.warning(f"User {user.id} ({user.username}) attempted to join room {self.room_code} without permission")
            await self.close()
            return
        
        # Join room group safely with error handling
        try:
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            logger.info(f"Successfully added to group {self.room_group_name}")
        except Exception as e:
            logger.error(f"Error joining room group: {str(e)}")
            await self.close()
            return
        
        logger.info(f"User {user.id} ({user.username}) connected to room {self.room_code}")
        
        # Accept the connection
        await self.accept()
        
        # Store user data
        self.user_id = user.id
        self.username = user.get_full_name() or user.username
        
        # Send user_join message to group as a welcome message
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_join',
                'user_id': self.user_id,
                'username': self.username,
                'timestamp': timezone.now().isoformat(),
            }
        )
        
        # Send ping to keep connection alive
        await self.start_ping()
    
    async def disconnect(self, code):
        """
        Called when the WebSocket closes for any reason.
        """
        user = self.scope['user']
        logger.info(f"User {user.id} ({user.username}) disconnected from room {self.room_code}")
        
        # Send user_leave message to group
        if hasattr(self, 'room_group_name') and hasattr(self, 'channel_layer'):
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_leave',
                    'user_id': user.id,
                    'username': user.get_full_name() or user.username,
                    'timestamp': timezone.now().isoformat(),
                }
            )
            
            # Leave room group
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data=None, bytes_data=None):
        """
        Called when the consumer receives data from WebSocket.
        """
        if not text_data:
            logger.warning(f"Received empty message from user {self.user_id} in room {self.room_code}")
            return
            
        text_data_json = json.loads(text_data)
        message_type = text_data_json.get('type')
        
        if message_type == 'pong':
            # Received pong response to our ping
            return
        
        # Log the message type
        logger.debug(f"Received message type: {message_type} from user {self.user_id}")
        
        # Handle different message types
        if message_type == 'offer':
            # WebRTC offer message
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'signaling_message',
                    'message': text_data_json,
                    'user_id': self.user_id,
                    'username': self.username,
                }
            )
        
        elif message_type == 'answer':
            # WebRTC answer message
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'signaling_message',
                    'message': text_data_json,
                    'user_id': self.user_id,
                    'username': self.username,
                }
            )
        
        elif message_type == 'ice_candidate':
            # ICE candidate message
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'signaling_message',
                    'message': text_data_json,
                    'user_id': self.user_id,
                    'username': self.username,
                }
            )
        
        elif message_type == 'join':
            # Join message (new participant entering)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_join',
                    'user_id': text_data_json.get('user_id'),
                    'username': text_data_json.get('username'),
                    'timestamp': timezone.now().isoformat(),
                }
            )
        
        elif message_type == 'chat_message':
            # Chat message
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'user_id': text_data_json.get('user_id'),
                    'username': text_data_json.get('username'),
                    'content': text_data_json.get('content'),
                    'timestamp': timezone.now().isoformat(),
                }
            )
        
        elif message_type == 'media_status':
            # Media status update from a participant
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'media_status',
                    'user_id': text_data_json.get('user_id'),
                    'username': text_data_json.get('username'),
                    'audioEnabled': text_data_json.get('audioEnabled'),
                    'videoEnabled': text_data_json.get('videoEnabled'),
                    'timestamp': timezone.now().isoformat(),
                }
            )
        
        elif message_type == 'session_ended':
            # Session ended by mentor
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'session_ended',
                    'user_id': text_data_json.get('user_id'),
                    'username': text_data_json.get('username'),
                    'timestamp': timezone.now().isoformat(),
                }
            )
            
            # Update session status in database
            await self.end_session()
    
    async def signaling_message(self, event):
        """
        Forward WebRTC signaling messages to clients.
        """
        message = event['message']
        
        # Send message to WebSocket
        await self.send(text_data=json.dumps(message))
    
    async def media_status(self, event):
        """
        Forward media status updates to clients.
        """
        # Send media status update to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'media_status',
            'user_id': event['user_id'],
            'username': event['username'],
            'audioEnabled': event['audioEnabled'],
            'videoEnabled': event['videoEnabled'],
            'timestamp': event['timestamp'],
        }))
    
    async def user_join(self, event):
        """
        Send user_join notification to clients.
        """
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'user_join',
            'user_id': event['user_id'],
            'username': event['username'],
            'timestamp': event['timestamp'],
        }))
    
    async def user_leave(self, event):
        """
        Send user_leave notification to clients.
        """
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'user_leave',
            'user_id': event['user_id'],
            'username': event['username'],
            'timestamp': event['timestamp'],
        }))
    
    async def chat_message(self, event):
        """
        Send chat message to clients.
        """
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'user_id': event['user_id'],
            'username': event['username'],
            'content': event['content'],
            'timestamp': event['timestamp'],
        }))
    
    async def session_ended(self, event):
        """
        Notify clients that session was ended.
        """
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'session_ended',
            'user_id': event['user_id'],
            'username': event['username'],
            'timestamp': event['timestamp'],
        }))
        
    async def session_status_update(self, event):
        """
        Handle session status updates from the API.
        This is called when a status update comes from the API endpoint.
        """
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'session_status_update',
            'status': event['status'],
            'room_code': event['room_code'],
            'updated_by': event['updated_by'],
            'updated_by_name': event['updated_by_name'],
            'timestamp': timezone.now().isoformat(),
        }))
    
    async def start_ping(self):
        """
        Start periodic ping to keep connection alive.
        """
        while True:
            try:
                await self.send(text_data=json.dumps({
                    'type': 'ping',
                    'timestamp': timezone.now().isoformat(),
                }))
                
                # Wait for 30 seconds before sending another ping
                await asyncio.sleep(30)
            except Exception as e:
                logger.error(f"Error sending ping: {str(e)}")
                break
    
    @sync_to_async
    def get_session(self):
        """
        Get session by room code from the database.
        """
        try:
            return Session.objects.get(room_code=self.room_code)
        except Session.DoesNotExist:
            return None
    
    @sync_to_async
    def can_join_session(self, session, user):
        """
        Check if user has permission to join the session.
        """
        # Mentor can always join their own sessions
        if session.mentor == user:
            return True
        
        # Learners need a confirmed booking
        if user.is_learner:
            return Booking.objects.filter(
                session=session,
                learner=user,
                status=Booking.CONFIRMED
            ).exists()
        
        return False
    
    @sync_to_async
    def end_session(self):
        """
        Mark session as completed in the database.
        """
        try:
            session = Session.objects.get(room_code=self.room_code)
            
            # Only allow mentor to end session
            user = self.scope['user']
            if session.mentor != user:
                return
            
            # Update session status
            session.status = Session.COMPLETED
            session.save()
            
            # Log session completion
            logger.info(f"Session {self.room_code} marked as completed by {user.id} ({user.username})")
            
            return True
        except Session.DoesNotExist:
            logger.warning(f"Attempted to end non-existent session {self.room_code}")
            return False
        except Exception as e:
            logger.error(f"Error ending session {self.room_code}: {str(e)}")
            return False


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    """
    Consumer for dashboard real-time updates.
    This handles updates for sessions, requests, and other dashboard content.
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.user_id = None
        self.group_name = None
        self.subscribed_channels = set()
    
    async def connect(self):
        """
        Called when the websocket is handshaking.
        """
        # Get the user ID from the URL route
        self.user_id = self.scope['url_route']['kwargs']['user_id']
        client_info = f"{self.scope['client'][0]}:{self.scope['client'][1]}"
        
        logger.info(f"WebSocket connection attempt to dashboard for user {self.user_id} from {client_info}")
        
        # Create a group name for this user's dashboard
        self.group_name = f"dashboard_{self.user_id}"
        
        # Accept the connection
        await self.accept()
        logger.info(f"WebSocket connection accepted for dashboard of user {self.user_id}")
        
        # Join the user-specific dashboard group
        if hasattr(self, 'channel_layer'):
            await self.channel_layer.group_add(
                self.group_name,
                self.channel_name
            )
            
            # Log successful group join
            logger.info(f"Added to channel group: {self.group_name}")
        
        # Send welcome message with confirmation of connection
        await self.send_json({
            'type': 'welcome',
            'message': 'Connected to dashboard real-time updates',
            'user_id': self.user_id
        })
    
    async def disconnect(self, close_code):
        """
        Called when the WebSocket closes for any reason.
        """
        logger.info(f"WebSocket disconnected for dashboard of user {self.user_id} with code {close_code}")
        
        # Leave the group
        if hasattr(self, 'channel_layer'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
            
            # Log group leave
            logger.info(f"Removed from channel group: {self.group_name}")
    
    async def receive_json(self, content):
        """
        Called when we get a text frame from the client.
        """
        message_type = content.get('type', '')
        logger.info(f"Received dashboard message from user {self.user_id}: {message_type}")
        
        # Handle different message types
        if message_type == 'get_data':
            # Fetch and send dashboard data
            await self.send_dashboard_data()
        elif message_type == 'ping':
            # Respond to ping with pong
            await self.send_json({
                'type': 'pong',
                'timestamp': timezone.now().isoformat()
            })
        elif message_type == 'fetch_sessions':
            # Fetch sessions with filters
            filters = content.get('filters', {})
            
            # If user is mentor, always filter by mentor
            if self.scope['user'].is_mentor:
                filters['mentor_id'] = self.user_id
                
            await self.fetch_sessions(filters)
        elif message_type == 'subscribe':
            # Subscribe to a specific channel
            channel = content.get('channel')
            if channel:
                await self.subscribe_to_channel(channel)
            else:
                await self.send_json({
                    'type': 'error',
                    'message': 'No channel specified for subscription'
                })
        elif message_type == 'unsubscribe':
            # Unsubscribe from a specific channel
            channel = content.get('channel')
            if channel:
                await self.unsubscribe_from_channel(channel)
            else:
                await self.send_json({
                    'type': 'error',
                    'message': 'No channel specified for unsubscription'
                })
        elif message_type == 'mark_notification_read':
            # Mark a notification as read
            notification_id = content.get('notification_id')
            if notification_id:
                await self.mark_notification_read(notification_id)
            else:
                await self.send_json({
                    'type': 'error',
                    'message': 'No notification ID specified'
                })
        elif message_type == 'mark_all_notifications_read':
            # Mark all notifications as read
            await self.mark_all_notifications_read()
        else:
            logger.warning(f"Unknown message type received: {message_type}")
    
    async def send_dashboard_data(self):
        """
        Fetch and send dashboard data to the client.
        """
        user_role = 'mentor' if self.scope['user'].is_mentor else 'learner'
        
        # Different data based on user role
        if user_role == 'mentor':
            data = await self.get_mentor_dashboard_data()
        else:
            data = await self.get_learner_dashboard_data()
        
        await self.send_json({
            'type': 'dashboard_data',
            'user_role': user_role,
            'data': data,
            'timestamp': timezone.now().isoformat()
        })
        
    @sync_to_async
    def get_mentor_dashboard_data(self):
        """
        Get dashboard data for mentors.
        """
        from django.db.models import Count
        from django.forms.models import model_to_dict
        from .models import Session, SessionRequest
        from apps.payments.models import Payment
        
        mentor = self.scope['user']
        
        # Get recent sessions
        recent_sessions = Session.objects.filter(
            mentor=mentor
        ).order_by('-created_at')[:5]
        
        # Get upcoming sessions
        upcoming_sessions = Session.objects.filter(
            mentor=mentor, 
            status='scheduled'
        ).order_by('schedule')[:5]
        
        # Get session requests
        session_requests = SessionRequest.objects.filter(
            mentor=mentor,
            status='pending'
        ).order_by('-created_at')[:5]
        
        # Count metrics
        total_sessions = Session.objects.filter(mentor=mentor).count()
        active_sessions = Session.objects.filter(mentor=mentor, status__in=['scheduled', 'live']).count()
        completed_sessions = Session.objects.filter(mentor=mentor, status='completed').count()
        
        # Count payments
        total_earnings = Payment.objects.filter(
            booking__session__mentor=mentor,
            status='completed'
        ).aggregate(total=models.Sum('amount'))['total'] or 0
        
        # Format data
        formatted_recent_sessions = []
        for session in recent_sessions:
            session_dict = model_to_dict(session, fields=['id', 'title', 'status', 'room_code'])
            session_dict.update({
                'schedule': session.schedule.isoformat() if session.schedule else None,
                'schedule_formatted': session.schedule.strftime('%b %d, %Y %I:%M %p') if session.schedule else None,
                'price': float(session.price) if session.price else 0,
                'confirmed_bookings_count': session.bookings.filter(status='confirmed').count(),
                'can_go_live': session.can_go_live(),
                'learner_names': [b.learner.get_full_name() for b in session.bookings.filter(status='confirmed')],
            })
            formatted_recent_sessions.append(session_dict)
        
        formatted_upcoming_sessions = []
        for session in upcoming_sessions:
            session_dict = model_to_dict(session, fields=['id', 'title', 'status', 'room_code'])
            session_dict.update({
                'schedule': session.schedule.isoformat() if session.schedule else None,
                'schedule_formatted': session.schedule.strftime('%b %d, %Y %I:%M %p') if session.schedule else None,
                'price': float(session.price) if session.price else 0,
                'confirmed_bookings_count': session.bookings.filter(status='confirmed').count(),
                'can_go_live': session.can_go_live(),
                'countdown': session.get_time_until_start(),
                'learner_names': [b.learner.get_full_name() for b in session.bookings.filter(status='confirmed')],
            })
            formatted_upcoming_sessions.append(session_dict)
        
        formatted_requests = []
        for request in session_requests:
            request_dict = model_to_dict(request, fields=['id', 'title', 'description', 'status'])
            request_dict.update({
                'learner_name': request.learner.get_full_name(),
                'learner_id': request.learner.id,
                'created_at': request.created_at.isoformat(),
                'created_at_formatted': request.created_at.strftime('%b %d, %Y'),
            })
            formatted_requests.append(request_dict)
        
        return {
            'metrics': {
                'total_sessions': total_sessions,
                'active_sessions': active_sessions,
                'completed_sessions': completed_sessions,
                'pending_requests': session_requests.count(),
                'total_earnings': float(total_earnings),
            },
            'recent_sessions': formatted_recent_sessions,
            'upcoming_sessions': formatted_upcoming_sessions,
            'session_requests': formatted_requests,
        }
        
    @sync_to_async
    def get_learner_dashboard_data(self):
        """
        Get dashboard data for learners.
        """
        from django.db.models import Count
        from django.forms.models import model_to_dict
        from .models import Session, Booking
        
        learner = self.scope['user']
        
        # Get recent bookings
        recent_bookings = Booking.objects.filter(
            learner=learner
        ).order_by('-created_at')[:5]
        
        # Get upcoming bookings
        upcoming_bookings = Booking.objects.filter(
            learner=learner, 
            status='confirmed',
            session__status='scheduled'
        ).order_by('session__schedule')[:5]
        
        # Count metrics
        total_bookings = Booking.objects.filter(learner=learner).count()
        upcoming_count = Booking.objects.filter(
            learner=learner, 
            status='confirmed',
            session__status='scheduled'
        ).count()
        completed_count = Booking.objects.filter(
            learner=learner, 
            session__status='completed'
        ).count()
        
        # Format bookings
        formatted_recent_bookings = []
        for booking in recent_bookings:
            session = booking.session
            booking_dict = model_to_dict(booking, fields=['id', 'status'])
            booking_dict.update({
                'session_id': session.id,
                'session_title': session.title,
                'session_status': session.status,
                'mentor_name': session.mentor.get_full_name(),
                'mentor_id': session.mentor.id,
                'schedule': session.schedule.isoformat() if session.schedule else None,
                'schedule_formatted': session.schedule.strftime('%b %d, %Y %I:%M %p') if session.schedule else None,
                'price': float(session.price) if session.price else 0,
                'room_code': session.room_code,
            })
            formatted_recent_bookings.append(booking_dict)
        
        formatted_upcoming_bookings = []
        for booking in upcoming_bookings:
            session = booking.session
            booking_dict = model_to_dict(booking, fields=['id', 'status'])
            booking_dict.update({
                'session_id': session.id,
                'session_title': session.title,
                'session_status': session.status,
                'mentor_name': session.mentor.get_full_name(),
                'mentor_id': session.mentor.id,
                'schedule': session.schedule.isoformat() if session.schedule else None,
                'schedule_formatted': session.schedule.strftime('%b %d, %Y %I:%M %p') if session.schedule else None,
                'price': float(session.price) if session.price else 0,
                'countdown': session.get_time_until_start(),
                'room_code': session.room_code,
            })
            formatted_upcoming_bookings.append(booking_dict)
        
        return {
            'metrics': {
                'total_bookings': total_bookings,
                'upcoming_count': upcoming_count,
                'completed_count': completed_count,
            },
            'recent_bookings': formatted_recent_bookings,
            'upcoming_bookings': formatted_upcoming_bookings,
        }
    
    async def fetch_sessions(self, filters=None):
        """
        Fetch and send sessions list with optional filters.
        """
        if filters is None:
            filters = {}
            
        # Get sessions data with filters
        sessions = await self.get_filtered_sessions(filters)
        
        # Send data back to client
        await self.send_json({
            'type': 'sessions_data',
            'sessions': sessions,
            'filters': filters,
            'timestamp': timezone.now().isoformat()
        })
        
    @sync_to_async
    def get_filtered_sessions(self, filters=None):
        """
        Get sessions with the given filters.
        """
        from django.forms.models import model_to_dict
        from django.db.models import Count, Q
        from datetime import datetime, timedelta
        from .models import Session, Booking
        
        if filters is None:
            filters = {}
            
        user = self.scope['user']
        
        # Different filtering logic for mentors and learners
        if user.is_mentor:
            # For mentors, show only their sessions
            queryset = Session.objects.filter(mentor=user)
            
            # Apply status filter if provided
            status = filters.get('status')
            if status:
                queryset = queryset.filter(status=status)
                
            # Apply date filters if provided
            date_filter = filters.get('date')
            if date_filter == 'today':
                today = datetime.now().date()
                queryset = queryset.filter(
                    schedule__date=today
                )
            elif date_filter == 'upcoming':
                now = datetime.now()
                queryset = queryset.filter(
                    schedule__gt=now,
                    status='scheduled'
                )
            elif date_filter == 'past':
                now = datetime.now()
                queryset = queryset.filter(
                    Q(schedule__lt=now) | Q(status='completed')
                )
        else:
            # For learners, show their bookings
            booking_queryset = Booking.objects.filter(learner=user)
            
            # Apply status filter if provided
            status = filters.get('status')
            if status:
                booking_queryset = booking_queryset.filter(status=status)
                
            # Get session IDs from bookings
            session_ids = booking_queryset.values_list('session_id', flat=True)
            
            # Get the sessions
            queryset = Session.objects.filter(id__in=session_ids)
            
            # Apply date filters if provided
            date_filter = filters.get('date')
            if date_filter == 'today':
                today = datetime.now().date()
                queryset = queryset.filter(
                    schedule__date=today
                )
            elif date_filter == 'upcoming':
                now = datetime.now()
                queryset = queryset.filter(
                    schedule__gt=now,
                    status='scheduled'
                )
            elif date_filter == 'past':
                now = datetime.now()
                queryset = queryset.filter(
                    Q(schedule__lt=now) | Q(status='completed')
                )
                
        # Count bookings
        queryset = queryset.annotate(
            booking_count=Count('bookings', filter=Q(bookings__status='confirmed'))
        )
        
        # Limit and order results
        limit = int(filters.get('limit', 20))
        ordering = filters.get('ordering', '-schedule')
        queryset = queryset.order_by(ordering)[:limit]
        
        # Convert to dicts for JSON serialization
        result = []
        for session in queryset:
            session_dict = model_to_dict(
                session, 
                fields=['id', 'title', 'description', 'status', 'room_code']
            )
            
            # Add additional computed fields
            session_dict.update({
                'mentor_name': session.mentor.get_full_name() or session.mentor.username,
                'mentor_id': session.mentor.id,
                'schedule': session.schedule.isoformat() if session.schedule else None,
                'schedule_formatted': session.schedule.strftime('%b %d, %Y %I:%M %p') if session.schedule else None,
                'duration': session.duration,
                'price': float(session.price) if session.price else 0,
                'confirmed_bookings_count': session.booking_count,
                'max_participants': session.max_participants,
                'can_book': session.status == 'scheduled' and session.booking_count < session.max_participants,
                'can_go_live': session.can_go_live(),
                'can_edit': session.can_edit(),
                'countdown': session.get_time_until_start(),
                'image_url': session.image.url if session.image else None,
            })
            
            # Add booking information if available (for learners)
            if not user.is_mentor:
                try:
                    booking = Booking.objects.get(session=session, learner=user)
                    session_dict['booking'] = {
                        'id': booking.id,
                        'status': booking.status,
                        'created_at': booking.created_at.isoformat(),
                        'price': float(session.price) if session.price else 0,
                    }
                except Booking.DoesNotExist:
                    session_dict['booking'] = None
                    
            # Add learner names for mentors
            if user.is_mentor:
                session_dict['learner_names'] = [
                    b.learner.get_full_name() for b in 
                    session.bookings.filter(status='confirmed')
                ]
                
            result.append(session_dict)
            
        return result
            
    # Channel layer message handlers
    async def subscribe_to_channel(self, channel):
        """
        Subscribe to a specific channel for receiving updates.
        """
        if not hasattr(self, 'subscribed_channels'):
            self.subscribed_channels = set()
            
        # Validate channel format
        valid_prefixes = ('sessions:', 'session:', 'booking:')
        if not any(channel.startswith(prefix) for prefix in valid_prefixes):
            logger.warning(f"Invalid channel format: {channel}")
            await self.send_json({
                'type': 'error',
                'message': 'Invalid channel format'
            })
            return
            
        logger.info(f"Subscribing to channel: {channel}")
        
        # Add to the specific group
        await self.channel_layer.group_add(
            channel,
            self.channel_name
        )
        
        # Add to our tracked subscriptions
        self.subscribed_channels.add(channel)
        
        # Acknowledge subscription
        await self.send_json({
            'type': 'subscription_success',
            'channel': channel,
            'message': f'Subscribed to {channel}'
        })
        
    async def unsubscribe_from_channel(self, channel):
        """
        Unsubscribe from a specific channel.
        """
        if not hasattr(self, 'subscribed_channels') or channel not in self.subscribed_channels:
            await self.send_json({
                'type': 'error',
                'message': f'Not subscribed to {channel}'
            })
            return
            
        logger.info(f"Unsubscribing from channel: {channel}")
        
        # Remove from the specific group
        await self.channel_layer.group_discard(
            channel,
            self.channel_name
        )
        
        # Remove from our tracked subscriptions
        self.subscribed_channels.remove(channel)
        
        # Acknowledge unsubscription
        await self.send_json({
            'type': 'unsubscription_success',
            'channel': channel,
            'message': f'Unsubscribed from {channel}'
        })

    async def mark_notification_read(self, notification_id):
        """
        Mark notification as read.
        """
        from apps.notifications.models import Notification
        
        success = await self.mark_notification_read_in_db(notification_id)
        
        if success:
            # Send confirmation to client
            await self.send_json({
                'type': 'notification_marked_read',
                'notification_id': notification_id
            })
            
    @sync_to_async
    def mark_notification_read_in_db(self, notification_id):
        """
        Mark notification as read in the database.
        """
        from apps.notifications.models import Notification
        
        try:
            notification = Notification.objects.get(id=notification_id, recipient=self.scope['user'])
            if not notification.read:
                notification.read = True
                notification.read_at = timezone.now()
                notification.save()
            return True
        except Notification.DoesNotExist:
            logger.warning(f"Notification {notification_id} not found for user {self.user_id}")
            return False
            
    async def mark_all_notifications_read(self):
        """
        Mark all notifications as read.
        """
        count = await self.mark_all_notifications_read_in_db()
        
        # Send confirmation to client
        await self.send_json({
            'type': 'all_notifications_marked_read',
            'count': count
        })
        
    @sync_to_async
    def mark_all_notifications_read_in_db(self):
        """
        Mark all notifications as read in the database.
        """
        from apps.notifications.models import Notification
        
        count = Notification.objects.filter(
            recipient=self.scope['user'],
            read=False
        ).update(
            read=True,
            read_at=timezone.now()
        )
        
        return count
            
    async def session_update(self, event):
        """
        Handle session update messages from the channel layer.
        """
        logger.info(f"Received session_update event for user {self.user_id}: {event}")
        
        # Forward the update to the client
        await self.send_json({
            'type': 'session_update',
            'session_id': event.get('session_id'),
            'status': event.get('status'),
            'updated_by': event.get('updated_by'),
            'timestamp': event.get('timestamp', timezone.now().isoformat()),
            'message': event.get('message', 'Session status updated')
        })
        
        # Log the successful delivery
        logger.info(f"Sent session update to client for user {self.user_id}")
        
    async def booking_update(self, event):
        """
        Handle booking update messages from the channel layer.
        """
        logger.info(f"Received booking_update event for user {self.user_id}: {event}")
        
        # Forward the update to the client
        await self.send_json({
            'type': 'booking_update',
            'booking_id': event.get('booking_id'),
            'session_id': event.get('session_id'),
            'status': event.get('status'),
            'updated_by': event.get('updated_by'),
            'timestamp': event.get('timestamp', timezone.now().isoformat()),
            'message': event.get('message', 'Booking status updated')
        })
        
        # Log the successful delivery
        logger.info(f"Sent booking update to client for user {self.user_id}")
        
    async def session_request_update(self, event):
        """
        Handle session request update messages.
        """
        logger.info(f"Received session_request_update event for user {self.user_id}: {event}")
        
        # Forward the update to the client
        await self.send_json({
            'type': 'session_request_update',
            'request_id': event.get('request_id'),
            'status': event.get('status'),
            'updated_by': event.get('updated_by'),
            'timestamp': event.get('timestamp', timezone.now().isoformat()),
            'message': event.get('message', 'Session request status updated')
        })
        
        # Log the successful delivery
        logger.info(f"Sent session request update to client for user {self.user_id}")
        
    async def notification_update(self, event):
        """
        Handle notification update messages.
        """
        logger.info(f"Received notification_update event for user {self.user_id}: {event}")
        
        # Forward the update to the client
        await self.send_json({
            'type': 'notification_update',
            'notification': event.get('notification'),
            'timestamp': event.get('timestamp', timezone.now().isoformat())
        })
        
        # Log the successful delivery
        logger.info(f"Sent notification update to client for user {self.user_id}")