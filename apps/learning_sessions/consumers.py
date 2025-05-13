"""
WebSocket consumers for learning sessions.
"""
import json
import logging
import asyncio
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.exceptions import StopConsumer
from django.utils import timezone
from django.contrib.auth import get_user_model

from .models import Session, Booking

logger = logging.getLogger(__name__)
User = get_user_model()

class SessionConsumer(AsyncWebsocketConsumer):
    """
    Consumer for session WebRTC signaling and real-time chat.
    Handles WebRTC offer/answer exchange and ICE candidates.
    """
    
    async def connect(self):
        """
        Called when the websocket is handshaking.
        """
        self.room_code = self.scope['url_route']['kwargs']['room_code']
        self.room_group_name = f'sessions:{self.room_code}'
        
        # Log connection attempt
        logger.info(f"WebSocket connection attempt to room {self.room_code}")
        
        # Get the session and check permissions
        session = await self.get_session()
        if not session:
            # Session doesn't exist
            logger.warning(f"Session {self.room_code} not found")
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
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
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
    
    async def disconnect(self, close_code):
        """
        Called when the WebSocket closes for any reason.
        """
        user = self.scope['user']
        logger.info(f"User {user.id} ({user.username}) disconnected from room {self.room_code}")
        
        # Send user_leave message to group
        if hasattr(self, 'room_group_name'):
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
    
    async def receive(self, text_data):
        """
        Called when the consumer receives data from WebSocket.
        """
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