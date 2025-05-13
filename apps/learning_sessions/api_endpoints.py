"""
API endpoints for learning sessions with error handling and real-time updates.
"""

import json
import uuid
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import Session, Booking, SessionRequest
from .forms import SessionForm
from apps.notifications.models import Notification

@login_required
@require_http_methods(["POST"])
def create_session_api(request):
    """
    API endpoint to create a new session with proper error handling
    and real-time notification.
    """
    if not request.user.is_mentor:
        return JsonResponse({
            'success': False,
            'errors': {'__all__': ['Only mentors can create sessions.']}
        }, status=403)
    
    # Extract data from request
    form = SessionForm(request.POST, request.FILES)
    is_free = request.POST.get('is_free') == 'true'
    
    if not form.is_valid():
        return JsonResponse({
            'success': False,
            'errors': form.errors
        }, status=400)
    
    try:
        # Create the session but don't save it yet
        session = form.save(commit=False)
        session.mentor = request.user
        session.status = 'scheduled'
        session.room_code = str(uuid.uuid4())
        
        # Set price to 0 if marked as free
        if is_free:
            session.price = 0
        
        # Handle topics JSON field
        topics_str = form.cleaned_data.get('topics', '')
        session.topics = [topic.strip() for topic in topics_str.split(',') if topic.strip()]
        
        session.save()
        
        # Create notification for mentor
        notification = Notification.objects.create(
            user=request.user,
            title='Session Created',
            message=f'Your session "{session.title}" has been created successfully.',
            notification_type='session_created',
            reference_id=session.id
        )
        
        # Send real-time notification to connected clients
        channel_layer = get_channel_layer()
        
        # Notification to the mentor
        async_to_sync(channel_layer.group_send)(
            f'notifications:{request.user.id}',
            {
                'type': 'notification_message',
                'notification': {
                    'id': notification.id,
                    'title': notification.title,
                    'message': notification.message,
                    'created_at': notification.created_at.isoformat(),
                    'read': notification.read,
                    'notification_type': notification.notification_type,
                    'reference_id': notification.reference_id,
                }
            }
        )
        
        # Broadcast new session to all connected clients
        async_to_sync(channel_layer.group_send)(
            'session_updates',
            {
                'type': 'session_update',
                'session': {
                    'id': session.id,
                    'title': session.title,
                    'mentor_name': request.user.get_full_name() or request.user.username,
                    'mentor_id': request.user.id,
                    'schedule': session.schedule.isoformat() if session.schedule else None,
                    'duration': session.duration,
                    'price': float(session.price),
                    'status': session.status,
                    'created_at': session.created_at.isoformat(),
                    'topics': session.topics,
                    'max_participants': session.max_participants,
                    'description': session.description,
                    'attendees': 0,
                    'room_code': session.room_code,
                    'action': 'created'
                }
            }
        )
        
        # Return success response with session details
        return JsonResponse({
            'success': True,
            'session': {
                'id': session.id,
                'title': session.title,
                'redirect_url': f'/users/dashboard/mentor/sessions/?tab=upcoming'
            }
        }, status=201)
    
    except Exception as e:
        # Log the error
        import traceback
        print(f"Error creating session: {str(e)}")
        print(traceback.format_exc())
        
        # Return error response
        return JsonResponse({
            'success': False,
            'errors': {'__all__': [f'Error creating session: {str(e)}']}
        }, status=500)

@login_required
@require_http_methods(["GET"])
def session_details_api(request, session_id):
    """
    API endpoint to get session details.
    """
    try:
        session = Session.objects.get(id=session_id)
        
        # Check permissions
        if not request.user.is_staff:
            if request.user != session.mentor:
                # Check if user has booked this session
                if not Booking.objects.filter(session=session, learner=request.user).exists():
                    return JsonResponse({
                        'success': False,
                        'errors': {'__all__': ['You do not have permission to view this session.']}
                    }, status=403)
        
        # Get bookings
        bookings = Booking.objects.filter(session=session)
        booked_count = bookings.filter(status='confirmed').count()
        
        # Format session data
        session_data = {
            'id': session.id,
            'title': session.title,
            'description': session.description,
            'mentor': {
                'id': session.mentor.id,
                'name': session.mentor.get_full_name() or session.mentor.username,
                'avatar': session.mentor.avatar.url if session.mentor.avatar else None,
                'expertise': session.mentor.expertise,
                'bio': session.mentor.bio,
            },
            'schedule': session.schedule.isoformat() if session.schedule else None,
            'duration': session.duration,
            'price': float(session.price),
            'topics': session.topics,
            'status': session.status,
            'created_at': session.created_at.isoformat(),
            'updated_at': session.updated_at.isoformat(),
            'max_participants': session.max_participants,
            'booked_count': booked_count,
            'is_full': booked_count >= session.max_participants,
            'room_code': session.room_code if request.user.is_staff or request.user == session.mentor else None,
        }
        
        # Add thumbnail if exists
        if session.thumbnail:
            session_data['thumbnail'] = session.thumbnail.url
        
        return JsonResponse({
            'success': True,
            'session': session_data
        })
    
    except Session.DoesNotExist:
        return JsonResponse({
            'success': False,
            'errors': {'__all__': ['Session not found.']}
        }, status=404)
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'errors': {'__all__': [f'Error retrieving session: {str(e)}']}
        }, status=500)