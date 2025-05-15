"""
API Views for learning sessions.
"""
import json
import logging
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone

from .models import Session, Booking

# Get logger
logger = logging.getLogger(__name__)

@login_required
@require_POST
def end_session(request, room_code):
    """API endpoint to end a session when a mentor or learner clicks 'End Session'"""
    try:
        # Get the session by room code
        session = get_object_or_404(Session, room_code=room_code)
        
        # Ensure the user has permission to end this session
        # Only mentor or a confirmed learner can end the session
        is_mentor = session.mentor == request.user
        is_learner = False
        
        if hasattr(request.user, 'is_learner') and request.user.is_learner:
            booking = Booking.objects.filter(
                session=session,
                learner=request.user,
                status__in=['confirmed', 'in_progress']
            ).first()
            is_learner = booking is not None
        
        if not (is_mentor or is_learner):
            return JsonResponse({
                'status': 'error',
                'message': 'You do not have permission to end this session.'
            }, status=403)
        
        # Mark the session as ended
        if session.status in [Session.LIVE, Session.IN_PROGRESS]:
            session.status = Session.COMPLETED
            session.ended_at = timezone.now()
            session.save()
            
            # Update any associated bookings
            bookings = Booking.objects.filter(session=session, status__in=['confirmed', 'in_progress'])
            for booking in bookings:
                booking.status = Booking.COMPLETED
                booking.save()
            
            # Send a message to the WebSocket channel if needed
            try:
                channel_layer = get_channel_layer()
                if channel_layer:
                    # Create a hash of the room code to ensure we get valid characters (same as in consumer)
                    import hashlib
                    hashed_code = hashlib.md5(room_code.encode()).hexdigest()[:8]
                    room_group_name = f'room_{hashed_code}'
                    
                    # Send message to room group
                    async_to_sync(channel_layer.group_send)(
                        room_group_name,
                        {
                            'type': 'session_ended',
                            'user_id': request.user.id,
                            'user_name': request.user.get_full_name() or request.user.username,
                            'user_role': 'mentor' if is_mentor else 'learner',
                            'session_id': session.id,
                            'timestamp': timezone.now().isoformat()
                        }
                    )
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {str(e)}")
            
            # Log the action
            logger.info(f"Session {room_code} ended by {request.user.username} (ID: {request.user.id})")
            
            return JsonResponse({
                'status': 'success',
                'message': 'Session ended successfully.'
            })
        else:
            return JsonResponse({
                'status': 'warning',
                'message': 'Session was not live or in progress.'
            })
            
    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        return JsonResponse({
            'status': 'error',
            'message': f'Error ending session: {str(e)}'
        }, status=500)

def session_status_api(request):
    """API endpoint to check status of a user's sessions."""
    from django.utils import timezone
    
    if request.method == 'GET':
        try:
            session_data = []
            
            if request.user.is_authenticated:
                if hasattr(request.user, 'role') and request.user.role == 'learner':
                    # For learners, get their booked sessions
                    bookings = Booking.objects.filter(
                        learner=request.user, 
                        status__in=['confirmed', 'in_progress']
                    ).select_related('session', 'session__mentor')
                    
                    for booking in bookings:
                        session = booking.session
                        attendees = session.bookings.filter(status='confirmed').count()
                        
                        session_data.append({
                            'id': session.id,
                            'title': session.title,
                            'status': session.status,
                            'room_code': session.room_code if session.status == 'live' else None,
                            'booking_id': booking.id,
                            'schedule': session.schedule.isoformat() if session.schedule else None,
                            'duration': session.duration,
                            'price': float(session.price),
                            'attendees': attendees,
                            'max_participants': session.max_participants,
                            'mentor_name': session.mentor.get_full_name() or session.mentor.username,
                            'mentor_id': session.mentor.id
                        })
                        
                    # Also include upcoming available sessions for discovery
                    upcoming_sessions = Session.objects.filter(
                        status='scheduled',
                        schedule__gte=timezone.now()
                    ).exclude(
                        bookings__learner=request.user
                    ).select_related('mentor').order_by('schedule')[:5]
                    
                    for session in upcoming_sessions:
                        attendees = session.bookings.filter(status='confirmed').count()
                        
                        if attendees < session.max_participants:
                            session_data.append({
                                'id': session.id,
                                'title': session.title,
                                'status': session.status,
                                'schedule': session.schedule.isoformat() if session.schedule else None,
                                'duration': session.duration,
                                'price': float(session.price),
                                'attendees': attendees,
                                'max_participants': session.max_participants,
                                'mentor_name': session.mentor.get_full_name() or session.mentor.username,
                                'mentor_id': session.mentor.id,
                                'available': True
                            })
                    
                elif hasattr(request.user, 'role') and request.user.role == 'mentor':
                    # For mentors, get their sessions
                    sessions = Session.objects.filter(
                        mentor=request.user,
                        status__in=['scheduled', 'live']
                    ).prefetch_related('bookings')
                    
                    for session in sessions:
                        attendees = session.bookings.filter(status='confirmed').count()
                        
                        session_data.append({
                            'id': session.id,
                            'title': session.title,
                            'status': session.status,
                            'room_code': session.room_code if session.status == 'live' else None,
                            'schedule': session.schedule.isoformat() if session.schedule else None,
                            'duration': session.duration,
                            'price': float(session.price),
                            'attendees': attendees,
                            'max_participants': session.max_participants
                        })
                else:
                    # For admins or other roles, return public sessions
                    sessions = Session.objects.filter(
                        status__in=['scheduled', 'live'],
                        schedule__gte=timezone.now()
                    ).select_related('mentor').order_by('schedule')[:10]
                    
                    for session in sessions:
                        attendees = session.bookings.filter(status='confirmed').count()
                        
                        session_data.append({
                            'id': session.id,
                            'title': session.title,
                            'status': session.status,
                            'schedule': session.schedule.isoformat() if session.schedule else None,
                            'duration': session.duration,
                            'price': float(session.price),
                            'attendees': attendees,
                            'max_participants': session.max_participants,
                            'mentor_name': session.mentor.get_full_name() or session.mentor.username,
                            'mentor_id': session.mentor.id
                        })
            else:
                # For anonymous users, return a subset of public sessions
                sessions = Session.objects.filter(
                    status='scheduled',
                    schedule__gte=timezone.now()
                ).select_related('mentor').order_by('schedule')[:5]
                
                for session in sessions:
                    attendees = session.bookings.filter(status='confirmed').count()
                    
                    session_data.append({
                        'id': session.id,
                        'title': session.title,
                        'status': session.status,
                        'schedule': session.schedule.isoformat() if session.schedule else None,
                        'duration': session.duration,
                        'price': float(session.price),
                        'attendees': attendees,
                        'max_participants': session.max_participants,
                        'mentor_name': session.mentor.get_full_name() or session.mentor.username,
                        'mentor_id': session.mentor.id
                    })
            
            return JsonResponse({'sessions': session_data})
        except Exception as e:
            import traceback
            print(f"Error in session_status_api: {str(e)}")
            print(traceback.format_exc())
            return JsonResponse({'error': str(e)}, status=500)
        
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@login_required
def booking_detail_api(request, booking_id):
    """API endpoint to get details about a booking."""
    booking = get_object_or_404(Booking, id=booking_id)
    
    # Check permissions
    if booking.learner != request.user and booking.session.mentor != request.user:
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    # Format mentor data
    mentor_data = {
        'id': booking.session.mentor.id,
        'name': booking.session.mentor.get_full_name() or booking.session.mentor.username,
        'profile_picture': booking.session.mentor.profile_picture.url if booking.session.mentor.profile_picture else None
    }
    
    # Format session data
    session_data = {
        'id': booking.session.id,
        'title': booking.session.title,
        'description': booking.session.description,
        'schedule': booking.session.schedule.isoformat(),
        'duration': booking.session.duration,
        'status': booking.session.status,
        'room_code': booking.session.room_code if booking.session.status == 'live' else None,
        'mentor': mentor_data
    }
    
    # Format booking data
    booking_data = {
        'id': booking.id,
        'status': booking.status,
        'created_at': booking.created_at.isoformat(),
        'feedback_submitted': booking.feedback_submitted,
        'session': session_data
    }
    
    return JsonResponse(booking_data)


@csrf_exempt
@require_POST
@login_required
def update_session_status(request, room_code):
    """
    API endpoint to update a session's status and broadcast via WebSockets.
    Used by WebRTC room to communicate session state changes.
    """
    try:
        # Parse the request data
        data = json.loads(request.body)
        status = data.get('status')
        
        if not status:
            return JsonResponse({'error': 'Status is required'}, status=400)
        
        # Get the session
        session = get_object_or_404(Session, room_code=room_code)
        
        # Check permissions (only mentor can update session status)
        if session.mentor != request.user:
            return JsonResponse({'error': 'Only the mentor can update session status'}, status=403)
        
        # Update status based on request
        if status == 'live':
            session.status = Session.LIVE
            # Update any associated bookings
            bookings = Booking.objects.filter(session=session, status=Booking.CONFIRMED)
            bookings.update(status=Booking.IN_PROGRESS)
        elif status == 'ended' or status == 'completed':
            session.status = Session.COMPLETED
            # Update any associated bookings
            bookings = Booking.objects.filter(session=session, status=Booking.IN_PROGRESS)
            bookings.update(status=Booking.COMPLETED)
        else:
            return JsonResponse({'error': f'Invalid status: {status}'}, status=400)
        
        # Save session with updated status
        session.save()
        
        # Send update to WebSocket channel
        channel_layer = get_channel_layer()
        room_group_name = f'sessions:{room_code}'
        
        try:
            # Broadcast session status update
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'session_status_update',
                    'status': status,
                    'room_code': str(room_code),
                    'updated_by': request.user.id,
                    'updated_by_name': request.user.get_full_name() or request.user.username
                }
            )
            logger.info(f"WebSocket notification sent for session {room_code} status update to {status}")
        except Exception as e:
            logger.error(f"Error sending WebSocket notification: {e}")
        
        return JsonResponse({
            'success': True,
            'session_id': session.id,
            'status': status,
            'room_code': str(room_code)
        })
        
    except Session.DoesNotExist:
        return JsonResponse({'error': 'Session not found'}, status=404)
    except Exception as e:
        logger.error(f"Error updating session status: {e}")
        return JsonResponse({'error': str(e)}, status=500)