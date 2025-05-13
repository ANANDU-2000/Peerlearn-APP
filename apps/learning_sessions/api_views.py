"""
API Views for learning sessions.
"""
import json
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required

from .models import Session, Booking

@login_required
def session_status_api(request):
    """API endpoint to check status of a user's sessions."""
    if request.method == 'GET':
        if request.user.role == 'learner':
            # For learners, get their booked sessions
            bookings = Booking.objects.filter(
                learner=request.user, 
                status__in=['confirmed', 'in_progress']
            ).select_related('session')
            
            session_data = []
            for booking in bookings:
                session_data.append({
                    'id': booking.session.id,
                    'title': booking.session.title,
                    'status': booking.session.status,
                    'room_code': booking.session.room_code if booking.session.status == 'live' else None,
                    'booking_id': booking.id
                })
                
        elif request.user.role == 'mentor':
            # For mentors, get their sessions
            sessions = Session.objects.filter(
                mentor=request.user,
                status__in=['scheduled', 'live']
            )
            
            session_data = []
            for session in sessions:
                session_data.append({
                    'id': session.id,
                    'title': session.title,
                    'status': session.status,
                    'room_code': session.room_code if session.status == 'live' else None,
                    'participants': session.bookings.count()
                })
                
        else:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
            
        return JsonResponse({'sessions': session_data})
        
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