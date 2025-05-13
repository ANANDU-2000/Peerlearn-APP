"""
API views for notifications.
"""

import json
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.contrib.auth.decorators import login_required
from django.db.models import Q

from .models import Notification


@login_required
@require_GET
def notifications_list(request):
    """
    Get a list of notifications for the current user.
    """
    # Get unread count first
    unread_count = Notification.objects.filter(
        user=request.user,
        read=False
    ).count()
    
    # Get the user's notifications
    notifications = Notification.objects.filter(
        user=request.user
    ).order_by('-created_at')[:50]  # Limit to 50 most recent notifications
    
    # Format the notifications for JSON response
    notifications_data = []
    for notification in notifications:
        notifications_data.append({
            'id': notification.id,
            'title': notification.title,
            'message': notification.message,
            'created_at': notification.created_at.isoformat(),
            'read': notification.read,
            'link': notification.link
        })
    
    # Return JSON response
    return JsonResponse({
        'notifications': notifications_data,
        'unread_count': unread_count
    })


@login_required
@require_POST
def mark_notification_read(request, notification_id):
    """
    Mark a notification as read.
    """
    # Get the notification
    notification = get_object_or_404(Notification, id=notification_id, user=request.user)
    
    # Mark as read
    notification.read = True
    notification.save()
    
    # Return success response
    return JsonResponse({'success': True})


@login_required
@require_POST
def mark_all_read(request):
    """
    Mark all notifications as read.
    """
    # Get unread notifications
    notifications = Notification.objects.filter(user=request.user, read=False)
    
    # Mark all as read
    notifications.update(read=True)
    
    # Return success response
    return JsonResponse({'success': True, 'count': notifications.count()})