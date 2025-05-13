"""
WebSocket consumers for real-time session features.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

from .models import Session, Booking

class SessionConsumer(AsyncWebsocketConsumer):
    """
    Consumer for session WebRTC signaling and real-time chat.
    """
    
    async def connect(self):
        """
        Called when the websocket is handshaking.
        """
        self.room_code = self.scope['url_route']['kwargs']['room_code']
        self.room_group_name = f'sessions:{self.room_code}'
        
        # Get the session and check permissions
        session = await self.get_session()
        if not session:
            # Session doesn't exist
            await self.close()
            return
        
        user = self.scope['user']
        if not user.is_authenticated:
            # User not authenticated
            await self.close()
            return
        
        # Check if user has permission to join
        can_join = await self.can_join_session(session, user)
        if not can_join:
            # User doesn't have permission
            await self.close()
            return
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send user joined message to the group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_join',
                'user_id': user.id,
                'username': user.get_full_name() or user.username,
                'timestamp': timezone.now().isoformat(),
            }
        )
    
    async def disconnect(self, close_code):
        """
        Called when the WebSocket closes.
        """
        user = self.scope['user']
        
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        
        if user.is_authenticated:
            # Send user left message to the group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_leave',
                    'user_id': user.id,
                    'username': user.get_full_name() or user.username,
                    'timestamp': timezone.now().isoformat(),
                }
            )
    
    async def receive(self, text_data):
        """
        Called when we get a text frame from the client.
        """
        user = self.scope['user']
        data = json.loads(text_data)
        message_type = data.get('type')
        
        # Add user info to all outgoing messages
        data['user_id'] = user.id
        data['username'] = user.get_full_name() or user.username
        data['timestamp'] = timezone.now().isoformat()
        
        # Handle different message types
        if message_type == 'chat':
            # Chat message
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'message': data['message'],
                    'user_id': data['user_id'],
                    'username': data['username'],
                    'timestamp': data['timestamp'],
                }
            )
        elif message_type in ['offer', 'answer', 'ice-candidate']:
            # WebRTC signaling
            target_id = data.get('target')
            if target_id:
                data['sender_id'] = user.id
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'signaling_message',
                        'message_type': message_type,
                        'content': data,
                        'target_id': target_id,
                    }
                )
        elif message_type == 'whiteboard':
            # Whiteboard update
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'whiteboard_update',
                    'content': data['content'],
                    'user_id': data['user_id'],
                }
            )
    
    async def chat_message(self, event):
        """
        Called when someone sends a message to the group.
        """
        await self.send(text_data=json.dumps({
            'type': 'chat',
            'message': event['message'],
            'user_id': event['user_id'],
            'username': event['username'],
            'timestamp': event['timestamp'],
        }))
    
    async def signaling_message(self, event):
        """
        Called when someone sends a WebRTC signaling message.
        """
        # Only forward to the intended recipient
        if str(self.scope['user'].id) == str(event['target_id']):
            await self.send(text_data=json.dumps({
                'type': event['message_type'],
                'content': event['content'],
            }))
    
    async def whiteboard_update(self, event):
        """
        Called when someone updates the whiteboard.
        """
        await self.send(text_data=json.dumps({
            'type': 'whiteboard',
            'content': event['content'],
            'user_id': event['user_id'],
        }))
    
    async def user_join(self, event):
        """
        Called when a user joins the session.
        """
        await self.send(text_data=json.dumps({
            'type': 'user-join',
            'user_id': event['user_id'],
            'username': event['username'],
            'timestamp': event['timestamp'],
        }))
    
    async def user_leave(self, event):
        """
        Called when a user leaves the session.
        """
        await self.send(text_data=json.dumps({
            'type': 'user-leave',
            'user_id': event['user_id'],
            'username': event['username'],
            'timestamp': event['timestamp'],
        }))
    
    @database_sync_to_async
    def get_session(self):
        """
        Get the session object from the database.
        """
        try:
            return Session.objects.get(room_code=self.room_code)
        except Session.DoesNotExist:
            return None
    
    @database_sync_to_async
    def can_join_session(self, session, user):
        """
        Check if a user has permission to join a session.
        """
        # Mentor of the session can always join
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
