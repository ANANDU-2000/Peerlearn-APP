"""
API endpoints for learning sessions with error handling and real-time updates.
"""

import json
from datetime import datetime

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_POST, require_GET
from django.contrib.auth.decorators import login_required
from django.urls import reverse
from django.utils import timezone
from django.db import transaction
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import Session, Booking, SessionRequest
from apps.notifications.models import Notification

@login_required
@require_POST
def create_session_api(request):
    """
    API endpoint to create a new session with proper error handling
    and real-time notification.
    """
    if not request.user.is_mentor:
        return JsonResponse({
            'success': False,
            'errors': {'__all__': ['Only mentors can create sessions']}
        }, status=403)
    
    # Get form data
    data = {}
    form_data = request.POST
    
    # Extract data from form
    data['title'] = form_data.get('title', '').strip()
    data['description'] = form_data.get('description', '').strip()
    data['topics'] = form_data.get('topics', '').strip()
    data['schedule'] = form_data.get('schedule')
    data['duration'] = form_data.get('duration', 60)
    data['price'] = form_data.get('price', 0)
    data['is_free'] = form_data.get('is_free') == 'true'
    data['max_participants'] = form_data.get('max_participants', 1)
    
    # Validate form data
    errors = {}
    
    if not data['title']:
        errors['title'] = ['Title is required']
    elif len(data['title']) < 5:
        errors['title'] = ['Title must be at least 5 characters']
    
    if not data['description']:
        errors['description'] = ['Description is required']
    elif len(data['description']) < 20:
        errors['description'] = ['Description must be at least 20 characters']
    
    if not data['topics']:
        errors['topics'] = ['At least one topic is required']
    
    if not data['schedule']:
        errors['schedule'] = ['Schedule is required']
    else:
        try:
            # Parse the datetime and ensure it's timezone-aware
            schedule_datetime = datetime.fromisoformat(data['schedule'].replace('Z', '+00:00'))
            if schedule_datetime.tzinfo is None:
                # If the datetime is naive, make it aware
                schedule_datetime = timezone.make_aware(schedule_datetime)
            
            # Check if the schedule is in the future
            if schedule_datetime <= timezone.now():
                errors['schedule'] = ['Schedule must be in the future']
        except ValueError:
            errors['schedule'] = ['Invalid schedule format']
    
    try:
        data['price'] = float(data['price'])
        if data['price'] < 0:
            errors['price'] = ['Price cannot be negative']
    except ValueError:
        errors['price'] = ['Price must be a number']
    
    # If there are errors, return them
    if errors:
        return JsonResponse({
            'success': False,
            'errors': errors
        }, status=400)
    
    # Set price to 0 if it's a free session
    if data['is_free']:
        data['price'] = 0
    
    # Create session
    try:
        session = Session(
            title=data['title'],
            description=data['description'],
            mentor=request.user,
            schedule=data['schedule'],
            duration=data['duration'],
            price=data['price'],
            max_participants=data['max_participants']
        )
        
        # Handle thumbnail if provided
        if 'thumbnail' in request.FILES:
            session.thumbnail = request.FILES['thumbnail']
        
        session.save()
        
        # Add topics
        if data['topics']:
            session.topics = data['topics']
            session.save()
        
        # Create notification for admin
        Notification.objects.create(
            user=request.user,
            title="New Session Created",
            message=f"You have created a new session: {session.title}",
            notification_type="session_created",
            reference_id=session.id
        )
        
        # Send real-time update via WebSocket
        channel_layer = get_channel_layer()
        
        # Format session data for WebSocket
        session_data = {
            'id': session.id,
            'title': session.title,
            'description': session.description,
            'schedule': session.schedule.isoformat(),
            'duration': session.duration,
            'price': float(session.price),
            'max_participants': session.max_participants,
            'status': session.status,
            'created_at': session.created_at.isoformat(),
            'topics': session.topics,
            'mentor': {
                'id': request.user.id,
                'username': request.user.username,
                'full_name': f"{request.user.first_name} {request.user.last_name}".strip()
            }
        }
        
        # Send to mentor's channel group
        async_to_sync(channel_layer.group_send)(
            f"dashboard_{request.user.id}",
            {
                'type': 'session_update',
                'session': session_data,
                'action': 'created'
            }
        )
        
        # Return success response
        return JsonResponse({
            'success': True,
            'session': {
                'id': session.id,
                'title': session.title,
                'redirect_url': reverse('users:mentor_session_detail', args=[session.id])
            }
        })
        
    except Exception as e:
        # Return error
        return JsonResponse({
            'success': False,
            'errors': {'__all__': [str(e)]}
        }, status=500)

@login_required
@require_GET
def session_details_api(request, session_id):
    """
    API endpoint to get session details.
    """
    try:
        session = get_object_or_404(Session, id=session_id)
        
        # Check if user has access
        is_mentor = session.mentor == request.user
        is_participant = session.bookings.filter(learner=request.user, status='confirmed').exists()
        
        if not (is_mentor or is_participant):
            return JsonResponse({
                'success': False,
                'error': 'You do not have access to this session'
            }, status=403)
        
        # Get bookings if user is the mentor
        bookings = []
        if is_mentor:
            for booking in session.bookings.all():
                bookings.append({
                    'id': booking.id,
                    'learner': {
                        'id': booking.learner.id,
                        'username': booking.learner.username,
                        'full_name': f"{booking.learner.first_name} {booking.learner.last_name}".strip()
                    },
                    'status': booking.status,
                    'created_at': booking.created_at.isoformat()
                })
        
        # Format session data
        session_data = {
            'id': session.id,
            'title': session.title,
            'description': session.description,
            'schedule': session.schedule.isoformat(),
            'duration': session.duration,
            'price': float(session.price),
            'max_participants': session.max_participants,
            'status': session.status,
            'created_at': session.created_at.isoformat(),
            'topics': session.topics,
            'thumbnail_url': session.thumbnail.url if session.thumbnail else None,
            'room_code': session.room_code,
            'mentor': {
                'id': session.mentor.id,
                'username': session.mentor.username,
                'full_name': f"{session.mentor.first_name} {session.mentor.last_name}".strip()
            }
        }
        
        # Add bookings if user is mentor
        if is_mentor:
            session_data['bookings'] = bookings
        
        return JsonResponse({
            'success': True,
            'session': session_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required
@require_POST
def cancel_session_api(request, session_id):
    """
    API endpoint to cancel a session.
    This will cancel all bookings and notify all participants.
    Only the mentor who created the session can cancel it.
    """
    try:
        # Get session
        session = get_object_or_404(Session, id=session_id)
        
        # Check if user is the mentor
        if session.mentor != request.user:
            return JsonResponse({
                'success': False,
                'error': 'Only the mentor who created the session can cancel it'
            }, status=403)
        
        # Check if session can be cancelled (not already completed or cancelled)
        if session.status in ['completed', 'cancelled']:
            return JsonResponse({
                'success': False,
                'error': f'Cannot cancel a session that is already {session.status}'
            }, status=400)
        
        # Parse request data
        data = json.loads(request.body)
        cancellation_reason = data.get('reason', 'Cancelled by mentor')
        
        # Start a transaction to ensure all operations are atomic
        with transaction.atomic():
            # Update session status
            session.status = 'cancelled'
            session.save()
            
            # Get confirmed bookings
            bookings = Booking.objects.filter(session=session, status='confirmed')
            
            # Cancel all bookings and notify learners
            for booking in bookings:
                # Update booking status
                booking.status = 'cancelled'
                booking.cancellation_reason = cancellation_reason
                booking.save()
                
                # Create notification for learner
                Notification.objects.create(
                    user=booking.learner,
                    title="Session Cancelled",
                    message=f"The session '{session.title}' has been cancelled by the mentor. Reason: {cancellation_reason}",
                    notification_type="session_cancelled",
                    reference_id=session.id
                )
            
            # Create notification for mentor
            Notification.objects.create(
                user=request.user,
                title="Session Cancelled",
                message=f"You have cancelled the session: {session.title}",
                notification_type="session_cancelled",
                reference_id=session.id
            )
            
            # Send real-time updates via WebSocket
            channel_layer = get_channel_layer()
            
            # Format session data for WebSocket
            session_data = {
                'id': session.id,
                'title': session.title,
                'status': 'cancelled',
                'cancelled_at': timezone.now().isoformat()
            }
            
            # Send to mentor's channel group
            async_to_sync(channel_layer.group_send)(
                f"dashboard_{request.user.id}",
                {
                    'type': 'session_update',
                    'session': session_data,
                    'action': 'cancelled'
                }
            )
            
            # Send to each learner's channel group
            for booking in bookings:
                async_to_sync(channel_layer.group_send)(
                    f"dashboard_{booking.learner.id}",
                    {
                        'type': 'session_update',
                        'session': session_data,
                        'action': 'cancelled'
                    }
                )
        
        # Return success response
        return JsonResponse({
            'success': True,
            'message': 'Session cancelled successfully'
        })
        
    except Exception as e:
        # Return error
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)