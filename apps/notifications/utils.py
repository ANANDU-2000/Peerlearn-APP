"""
Utility functions for notifications module
"""
import logging
import json

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model

from .models import Notification

logger = logging.getLogger(__name__)
User = get_user_model()

def send_notification_to_user(user_id, title, message, notification_type='info', reference_id=None):
    """
    Create a notification and send it to the user via WebSocket.
    
    Args:
        user_id (int): The ID of the user to send the notification to
        title (str): The notification title
        message (str): The notification message
        notification_type (str): The type of notification (info, warning, error, success)
        reference_id (int, optional): A reference ID to associate with the notification
    
    Returns:
        bool: True if the notification was sent successfully, False otherwise
    """
    try:
        # Get the user
        user = User.objects.get(id=user_id)
        
        # Create notification in database
        notification = Notification.objects.create(
            user=user,
            title=title,
            message=message,
            notification_type=notification_type,
            reference_id=reference_id
        )
        
        # Format notification data for sending
        notification_data = {
            'id': notification.id,
            'title': notification.title,
            'message': notification.message,
            'created_at': notification.created_at.isoformat(),
            'read': notification.read,
            'notification_type': notification.notification_type,
            'reference_id': notification.reference_id,
        }
        
        # Send to WebSocket group
        channel_layer = get_channel_layer()
        
        # Use the same group name format as in the consumer
        notification_group_name = f'notif_{user_id}'
        
        # Send the message to the group
        async_to_sync(channel_layer.group_send)(
            notification_group_name,
            {
                'type': 'notification_message',
                'notification': notification_data
            }
        )
        
        logger.info(f"Sent notification '{title}' to user {user_id}")
        return True
        
    except User.DoesNotExist:
        logger.error(f"Failed to send notification: User with ID {user_id} does not exist")
        return False
    except Exception as e:
        logger.exception(f"Error sending notification to user {user_id}: {str(e)}")
        return False

def send_notification_to_multiple_users(user_ids, title, message, notification_type='info', reference_id=None):
    """
    Send the same notification to multiple users.
    
    Args:
        user_ids (list): List of user IDs to send the notification to
        title (str): The notification title
        message (str): The notification message
        notification_type (str): The type of notification (info, warning, error, success)
        reference_id (int, optional): A reference ID to associate with the notification
        
    Returns:
        dict: Dictionary with user_id keys and boolean values indicating success
    """
    results = {}
    for user_id in user_ids:
        results[user_id] = send_notification_to_user(
            user_id, title, message, notification_type, reference_id
        )
    return results