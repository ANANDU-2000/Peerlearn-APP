"""
API Views for learning sessions.
"""
import json
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required

from .models import Session, Booking

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
                        attendees = session.booking_set.filter(status='confirmed').count()
                        
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
                        booking__learner=request.user
                    ).select_related('mentor').order_by('schedule')[:5]
                    
                    for session in upcoming_sessions:
                        attendees = session.booking_set.filter(status='confirmed').count()
                        
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
                    ).prefetch_related('booking_set')
                    
                    for session in sessions:
                        attendees = session.booking_set.filter(status='confirmed').count()
                        
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
                        attendees = session.booking_set.filter(status='confirmed').count()
                        
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
                    attendees = session.booking_set.filter(status='confirmed').count()
                    
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