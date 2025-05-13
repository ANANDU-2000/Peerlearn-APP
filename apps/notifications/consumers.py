"""
WebSocket consumers for real-time notifications.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from .models import Notification

class NotificationConsumer(AsyncWebsocketConsumer):
    """
    Consumer for real-time user notifications.
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
        
        # Create a user-specific notification group
        self.notification_group_name = f'notifications:{user.id}'
        
        # Join room group
        await self.channel_layer.group_add(
            self.notification_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send all unread notifications on connect
        await self.send_unread_notifications()
    
    async def disconnect(self, close_code):
        """
        Called when the WebSocket closes.
        """
        # Leave room group
        await self.channel_layer.group_discard(
            self.notification_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """
        Called when we get a text frame from the client.
        """
        data = json.loads(text_data)
        action = data.get('action')
        
        if action == 'mark_read':
            notification_id = data.get('notification_id')
            if notification_id:
                result = await self.mark_notification_read(notification_id)
                if result:
                    await self.send(text_data=json.dumps({
                        'type': 'notification_read',
                        'notification_id': notification_id
                    }))
        
        elif action == 'mark_all_read':
            await self.mark_all_notifications_read()
            await self.send(text_data=json.dumps({
                'type': 'all_notifications_read'
            }))
    
    async def notification_message(self, event):
        """
        Called when a notification is sent to the group.
        """
        # Send the notification data to the WebSocket
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'notification': event['notification']
        }))
    
    @database_sync_to_async
    def mark_notification_read(self, notification_id):
        """Mark a notification as read."""
        try:
            notification = Notification.objects.get(id=notification_id, user=self.scope['user'])
            if not notification.read:
                notification.read = True
                notification.save()
            return True
        except Notification.DoesNotExist:
            return False
    
    @database_sync_to_async
    def mark_all_notifications_read(self):
        """Mark all notifications as read for the user."""
        Notification.objects.filter(user=self.scope['user'], read=False).update(read=True)
    
    async def send_unread_notifications(self):
        """Send all unread notifications to the client."""
        notifications = await self.get_unread_notifications()
        
        await self.send(text_data=json.dumps({
            'type': 'unread_notifications',
            'notifications': notifications
        }))
    
    @database_sync_to_async
    def get_unread_notifications(self):
        """Get all unread notifications for the user."""
        notifications = []
        for notification in Notification.objects.filter(user=self.scope['user'], read=False).order_by('-created_at'):
            notifications.append({
                'id': notification.id,
                'title': notification.title,
                'message': notification.message,
                'created_at': notification.created_at.isoformat(),
                'read': notification.read,
                'notification_type': notification.notification_type,
                'reference_id': notification.reference_id,
            })
        return notifications