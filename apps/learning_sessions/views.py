"""
Views for session listing, creation, booking, and WebRTC room.
Also includes API endpoints for real-time updates.
"""
import json
import logging
from django.http import JsonResponse

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.generic import ListView, DetailView, CreateView, UpdateView
from django.contrib import messages
from django.utils import timezone
from django.contrib import messages
from django.urls import reverse_lazy, reverse
from django.utils.decorators import method_decorator
from django.http import JsonResponse, HttpResponseForbidden
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from decimal import Decimal

# Set up logging
logger = logging.getLogger(__name__)

from .models import Session, SessionRequest, Booking
from .forms import SessionForm, SessionRequestForm, FeedbackForm
from apps.users.models import CustomUser, UserRating
from apps.notifications.models import Notification
from apps.payments.models import Payment

class SessionListView(ListView):
    """View to list all public sessions."""
    model = Session
    template_name = 'sessions/list.html'
    context_object_name = 'sessions'
    paginate_by = 12
    
    def get_queryset(self):
        """Filter to show only scheduled or live sessions that haven't expired."""
        now = timezone.now()
        
        # Only show sessions that are scheduled or live and haven't passed their scheduled time
        queryset = Session.objects.filter(
            status__in=[Session.SCHEDULED, Session.LIVE],
            schedule__gte=now  # Only show current or future sessions
        )
        
        # Apply category filter if provided
        category = self.request.GET.get('category')
        if category:
            queryset = queryset.filter(topics__contains=[category])
        
        # Apply search filter if provided
        search = self.request.GET.get('search')
        if search:
            queryset = queryset.filter(title__icontains=search)
        
        return queryset.order_by('schedule')
    
    def get_context_data(self, **kwargs):
        """Add filters and search to context."""
        context = super().get_context_data(**kwargs)
        
        # Add categories for filter
        context['categories'] = self.get_categories()
        
        # Add current filters
        context['current_category'] = self.request.GET.get('category', '')
        context['current_search'] = self.request.GET.get('search', '')
        
        return context
    
    def get_categories(self):
        """Get list of all categories from session topics."""
        categories = set()
        sessions = Session.objects.all()
        for session in sessions:
            categories.update(session.topics)
        return sorted(list(categories))

class SessionDetailView(DetailView):
    """View to show details of a session."""
    model = Session
    template_name = 'sessions/detail.html'
    context_object_name = 'session'
    
    def get_context_data(self, **kwargs):
        """Add booking context if user is a learner."""
        context = super().get_context_data(**kwargs)
        
        if self.request.user.is_authenticated and self.request.user.is_learner:
            # Check if user has already booked this session
            try:
                booking = Booking.objects.get(
                    session=self.object,
                    learner=self.request.user
                )
                context['booking'] = booking
            except Booking.DoesNotExist:
                pass
        
        # Add WebRTC context for mentor/booked learner if session is live
        if self.object.status == Session.LIVE:
            if self.request.user.is_authenticated:
                if (self.request.user == self.object.mentor or 
                    (self.request.user.is_learner and 
                     Booking.objects.filter(
                         session=self.object,
                         learner=self.request.user,
                         status=Booking.CONFIRMED
                     ).exists())):
                    
                    context['can_join'] = True
        
        return context

@method_decorator(login_required, name='dispatch')
class SessionCreateView(CreateView):
    """View for mentors to create a new session."""
    model = Session
    form_class = SessionForm
    template_name = 'sessions/create.html'
    success_url = reverse_lazy('mentor_dashboard')
    
    def dispatch(self, request, *args, **kwargs):
        """Check if user is a mentor."""
        if not request.user.is_mentor:
            messages.error(request, 'Only mentors can create sessions.')
            return redirect('home')
        return super().dispatch(request, *args, **kwargs)
    
    def form_valid(self, form):
        """Set the mentor to the current user."""
        form.instance.mentor = self.request.user
        messages.success(self.request, 'Session created successfully!')
        return super().form_valid(form)

@method_decorator(login_required, name='dispatch')
class SessionUpdateView(UpdateView):
    """View for mentors to update their sessions."""
    model = Session
    form_class = SessionForm
    template_name = 'sessions/update.html'
    success_url = reverse_lazy('mentor_dashboard')
    
    def get_queryset(self):
        """Limit to sessions created by the current mentor."""
        return Session.objects.filter(mentor=self.request.user)
    
    def form_valid(self, form):
        """Update the session and notify booked learners."""
        messages.success(self.request, 'Session updated successfully!')
        
        # Notify learners who have booked this session
        session = self.get_object()
        for booking in session.bookings.filter(status=Booking.CONFIRMED):
            Notification.objects.create(
                user=booking.learner,
                message=f"Session '{session.title}' has been updated. Please check the new details.",
                link=session.get_absolute_url
            )
        
        return super().form_valid(form)

@login_required
def request_session(request, mentor_id):
    """View for learners to request a session from a mentor."""
    mentor = get_object_or_404(CustomUser, id=mentor_id, role=CustomUser.MENTOR)
    
    if not request.user.is_learner:
        messages.error(request, 'Only learners can request sessions.')
        return redirect('mentor_detail', pk=mentor_id)
    
    if request.method == 'POST':
        form = SessionRequestForm(request.POST)
        if form.is_valid():
            session_request = form.save(commit=False)
            session_request.learner = request.user
            session_request.mentor = mentor
            session_request.save()
            
            # Create notification for mentor
            Notification.objects.create(
                user=mentor,
                message=f"New session request from {request.user.get_full_name() or request.user.username}",
                link=f"/dashboard/mentor/requests/"
            )
            
            messages.success(request, 'Session request sent successfully!')
            return redirect('users:learner_activity')
    else:
        form = SessionRequestForm()
    
    return render(request, 'sessions/request.html', {
        'form': form,
        'mentor': mentor
    })


@login_required
def request_session_api(request):
    """API endpoint for learners to request a session from a mentor."""
    if not hasattr(request.user, 'role') or request.user.role != 'learner':
        return JsonResponse({'success': False, 'message': 'Only learners can request sessions.'})
    
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            mentor_id = data.get('mentor_id')
            title = data.get('title')
            domain_id = data.get('domain')
            description = data.get('description')
            proposed_time = data.get('proposed_time')
            duration = data.get('duration')
            budget = data.get('budget')
            
            # Basic validation
            if not all([mentor_id, title, domain_id, proposed_time, duration, budget]):
                return JsonResponse({'success': False, 'message': 'Missing required fields.'})
            
            # Get mentor
            try:
                mentor = CustomUser.objects.get(id=mentor_id, role='mentor')
            except CustomUser.DoesNotExist:
                return JsonResponse({'success': False, 'message': 'Mentor not found.'})
            
            # Create session request
            session_request = SessionRequest.objects.create(
                learner=request.user,
                mentor=mentor,
                title=title,
                domain_id=domain_id,
                description=description,
                proposed_time=proposed_time,
                duration=duration,
                budget=budget,
            )
            
            # Create notification for mentor
            Notification.objects.create(
                user=mentor,
                message=f"New session request from {request.user.get_full_name() or request.user.username}",
                link=f"/dashboard/mentor/requests/"
            )
            
            return JsonResponse({
                'success': True,
                'message': 'Session request sent successfully!',
                'request_id': session_request.id
            })
            
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'message': 'Invalid JSON data.'})
        except Exception as e:
            return JsonResponse({'success': False, 'message': str(e)})
    
    return JsonResponse({'success': False, 'message': 'Only POST method is allowed.'})

@login_required
def respond_to_request(request, request_id):
    """View for mentors to respond to session requests."""
    session_request = get_object_or_404(
        SessionRequest,
        id=request_id,
        mentor=request.user
    )
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'accept':
            # Accept the request as is
            with transaction.atomic():
                session_request.status = SessionRequest.ACCEPTED
                session_request.save()
                
                # Create a new session based on the request
                session = Session.objects.create(
                    mentor=request.user,
                    title=session_request.title,
                    description=session_request.description,
                    topics=[session_request.domain],
                    schedule=session_request.proposed_time,
                    duration=session_request.duration,
                    price=session_request.budget,
                    status=Session.SCHEDULED
                )
                
                # Create a booking for the learner
                Booking.objects.create(
                    session=session,
                    learner=session_request.learner,
                    status=Booking.CONFIRMED
                )
                
                # Notify the learner
                Notification.objects.create(
                    user=session_request.learner,
                    message=f"Your session request '{session_request.title}' has been accepted!",
                    link=session.get_absolute_url
                )
            
            messages.success(request, 'Request accepted and session created!')
            
        elif action == 'counter':
            # Send a counter offer
            price = request.POST.get('price')
            date = request.POST.get('date')
            time = request.POST.get('time')
            notes = request.POST.get('notes', '')
            
            if price and date and time:
                try:
                    # Parse the date and time
                    counter_time = timezone.datetime.strptime(
                        f"{date} {time}", "%Y-%m-%d %H:%M"
                    )
                    counter_time = timezone.make_aware(counter_time)
                    
                    # Update the request
                    session_request.status = SessionRequest.OFFERED
                    session_request.counter_offer = price
                    session_request.counter_time = counter_time
                    session_request.mentor_notes = notes
                    session_request.save()
                    
                    # Notify the learner
                    Notification.objects.create(
                        user=session_request.learner,
                        message=f"Your session request '{session_request.title}' has a counter offer!",
                        link="/dashboard/learner/activity/"
                    )
                    
                    messages.success(request, 'Counter offer sent!')
                    
                except ValueError:
                    messages.error(request, 'Invalid date or time format.')
            else:
                messages.error(request, 'Please provide all required information.')
                
        elif action == 'decline':
            # Decline the request
            session_request.status = SessionRequest.DECLINED
            session_request.mentor_notes = request.POST.get('notes', '')
            session_request.save()
            
            # Notify the learner
            Notification.objects.create(
                user=session_request.learner,
                message=f"Your session request '{session_request.title}' has been declined.",
                link="/dashboard/learner/activity/"
            )
            
            messages.success(request, 'Request declined.')
            
        else:
            messages.error(request, 'Invalid action.')
        
        return redirect('mentor_requests')
    
    return render(request, 'mentors_dash/request_detail.html', {
        'request': session_request
    })

@login_required
def book_session(request, session_id):
    """View for learners to book a session."""
    session = get_object_or_404(Session, id=session_id)
    now = timezone.now()
    
    if not request.user.is_learner:
        messages.error(request, 'Only learners can book sessions.')
        return redirect('sessions:detail', pk=session_id)
    
    # Check if session is in the past
    if session.schedule < now:
        messages.error(request, 'This session has already started or expired and cannot be booked.')
        return redirect('sessions:list')
    
    # Check if already booked
    if Booking.objects.filter(session=session, learner=request.user).exists():
        messages.info(request, 'You have already booked this session.')
        return redirect('sessions:detail', pk=session_id)
    
    # Process the booking
    if request.method == 'POST':
        with transaction.atomic():
            # Create the booking
            booking = Booking.objects.create(
                session=session,
                learner=request.user,
                status=Booking.CONFIRMED if session.is_free else Booking.PENDING
            )
            
            # Get user's full name or username
            learner_name = request.user.get_full_name() or request.user.username
            
            if session.is_free:
                # Free session - confirm immediately
                messages.success(request, 'Session booked successfully!')
                
                # Notify the mentor about the booking with detailed information
                from apps.notifications.utils import send_notification_to_user
                
                # Create a notification with more context and a proper reference ID
                send_notification_to_user(
                    user_id=session.mentor.id,
                    title="New Session Booking",
                    message=f"{learner_name} has booked your session '{session.title}' scheduled for {session.schedule.strftime('%b %d, %Y at %I:%M %p')}",
                    notification_type="success",
                    reference_id=booking.id
                )
                
                # Also send a confirmation to the learner
                send_notification_to_user(
                    user_id=request.user.id,
                    title="Booking Confirmed",
                    message=f"Your booking for '{session.title}' with {session.mentor.get_full_name()} has been confirmed. The session is scheduled for {session.schedule.strftime('%b %d, %Y at %I:%M %p')}",
                    notification_type="success",
                    reference_id=booking.id
                )
                
                return redirect('sessions:detail', pk=session_id)
            else:
                # Paid session - redirect to payment
                # Add a pending notification for the booking
                from apps.notifications.utils import send_notification_to_user
                
                send_notification_to_user(
                    user_id=request.user.id,
                    title="Complete Your Booking",
                    message=f"Please complete payment to confirm your booking for '{session.title}' with {session.mentor.get_full_name()}",
                    notification_type="info",
                    reference_id=booking.id
                )
                
                return redirect('payments:process', booking_id=booking.id)
    
    return render(request, 'sessions/booking_confirm.html', {
        'session': session
    })

@login_required
def cancel_booking(request, booking_id):
    """View for learners to cancel a booking."""
    booking = get_object_or_404(
        Booking,
        id=booking_id,
        learner=request.user
    )
    
    if request.method == 'POST':
        reason = request.POST.get('reason', '')
        
        booking.status = Booking.CANCELLED
        booking.cancellation_reason = reason
        booking.save()
        
        # Import the improved notification utility
        from apps.notifications.utils import send_notification_to_user
        
        # Get more detailed information for notifications
        session_title = booking.session.title
        session_date = booking.session.schedule.strftime('%b %d, %Y at %I:%M %p')
        learner_name = request.user.get_full_name() or request.user.username
        mentor_name = booking.session.mentor.get_full_name() or booking.session.mentor.username
        
        # Send a more detailed and actionable notification to the mentor
        send_notification_to_user(
            user_id=booking.session.mentor.id,
            title="Session Booking Cancelled",
            message=f"{learner_name} has cancelled their booking for '{session_title}' scheduled on {session_date}. Reason: {reason if reason else 'No reason provided'}",
            notification_type="warning",
            reference_id=booking.id
        )
        
        # Also notify the learner with confirmation
        send_notification_to_user(
            user_id=request.user.id,
            title="Cancellation Confirmed",
            message=f"Your booking for '{session_title}' with {mentor_name} scheduled for {session_date} has been cancelled successfully.",
            notification_type="info",
            reference_id=booking.id
        )
        
        messages.success(request, 'Booking cancelled successfully.')
        return redirect('users:learner_activity')
    
    return render(request, 'sessions/cancel_booking.html', {
        'booking': booking
    })

@login_required
def join_session_room(request, room_code):
    """View for joining a session room via /sessions/{room_code}/join/ URL."""
    try:
        session = get_object_or_404(Session, room_code=room_code)
        
        # Check if the user is authorized to join this session
        is_authorized = False
        role = None
        
        # Check if user is the mentor or has a confirmed booking
        if request.user == session.mentor:
            is_authorized = True
            role = 'mentor'
        else:
            # Check if user has a confirmed booking for this session
            has_booking = session.bookings.filter(
                learner=request.user, 
                status='confirmed'
            ).exists()
            
            if has_booking:
                is_authorized = True
                role = 'learner'
        
        if not is_authorized:
            messages.error(request, "You don't have access to this session")
            return redirect('home')
        
        # If direct access to room is requested via query parameter
        if request.GET.get('direct') == 'true':
            # Force role from URL if specified
            role_param = request.GET.get('role')
            if role_param in ['mentor', 'learner']:
                role = role_param
                
            # If mentor is joining and session is scheduled, automatically make it live
            if request.user == session.mentor and session.status == 'scheduled':
                session.status = 'live'
                session.live_started_at = timezone.now()
                session.save()
                
                # Log this action
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"Session {session.id} marked as live by mentor {request.user.id}")
                
            # Redirect to room page
            return redirect('sessions:room', room_code=session.room_code)
        
        # For non-direct access, show session details
        return render(request, 'sessions/join.html', {
            'session': session,
            'role': role
        })
        
    except Exception as e:
        # Log the error for debugging
        print(f"Error in join_session_room: {e}")
        messages.error(request, f"Error accessing session: {str(e)}")
        return redirect('home')

@login_required
def session_by_room_code(request, room_code):
    """
    View for handling direct access to a session by room code.
    This handles the URL pattern that's being used when clicking 'Join Now'.
    """
    try:
        # Verify if this is a valid UUID
        try:
            # Try to parse the room_code as UUID to validate it
            import uuid
            uuid_obj = uuid.UUID(room_code)
            # If we get here, it's a valid UUID
        except ValueError:
            # Not a valid UUID, show error
            messages.error(request, "Invalid session code format")
            return redirect('sessions:list')
        
        # Find the session
        try:
            session = Session.objects.get(room_code=room_code)
        except Session.DoesNotExist:
            messages.error(request, "Session not found")
            return redirect('sessions:list')
        
        # Determine role and authorization
        role = None
        is_authorized = False
        
        if request.user == session.mentor:
            role = 'mentor'
            is_authorized = True
            # Log access
            logger.info(f"Mentor {request.user.username} (ID: {request.user.id}) accessing room {room_code}")
        else:
            # Check if user has a booking for this session
            has_booking = session.bookings.filter(
                learner=request.user,
                status__in=['confirmed', 'paid', 'active']  # Allow all valid booking statuses
            ).exists()
            
            if has_booking:
                role = 'learner'
                is_authorized = True
                # Log access
                logger.info(f"Learner {request.user.username} (ID: {request.user.id}) accessing room {room_code}")
            else:
                # Detailed logging for debugging access issues
                existing_bookings = list(session.bookings.all().values('learner_id', 'status'))
                logger.warning(f"Unauthorized access attempt: User {request.user.username} (ID: {request.user.id}) to room {room_code}. Session bookings: {existing_bookings}")
        
        if not is_authorized:
            messages.error(request, "You don't have permission to access this session. Only the booked learner and assigned mentor can join this session room.")
            return redirect('sessions:list')
        
        # Check if session is live or scheduled
        if session.status not in ['live', 'scheduled']:
            messages.error(request, f"This session is currently {session.status} and cannot be joined")
            return redirect('sessions:list')
        
        # Update session status if mentor is joining and session is scheduled
        if role == 'mentor' and session.status == 'scheduled':
            session.status = 'live'
            session.live_started_at = timezone.now()
            session.save()
            
            # Send notification to learners
            for booking in session.bookings.filter(status='confirmed'):
                Notification.objects.create(
                    recipient=booking.learner,
                    message=f"Your session '{session.title}' is now live! Join now.",
                    notification_type='session_live',
                    related_object_id=session.id,
                    related_object_type='session'
                )
        
        # Redirect to room
        return redirect('sessions:room', room_code=session.room_code)
    
    except Exception as e:
        print(f"Error in session_by_room_code: {e}")
        messages.error(request, "Error accessing session")
        return redirect('sessions:list')

@login_required
def session_room(request, room_code):
    """View for the WebRTC session room."""
    session = get_object_or_404(Session, room_code=room_code)
    
    # Check if user is authenticated
    if not request.user.is_authenticated:
        messages.error(request, 'You must be logged in to join a session.')
        return redirect('users:login')
    
    # Check if user has permission to enter the room
    if session.mentor == request.user:
        # Mentor of the session
        user_role = 'mentor'
    elif hasattr(request.user, 'is_learner') and request.user.is_learner and Booking.objects.filter(
            session=session,
            learner=request.user,
            status=Booking.CONFIRMED
        ).exists():
        # Learner with confirmed booking
        user_role = 'learner'
    else:
        messages.error(request, 'You do not have permission to join this session.')
        return redirect('home')
    
    # Check if session is live or scheduled
    # For mentors, allow joining regardless of status (they need to prepare)
    if session.status not in [Session.LIVE, Session.SCHEDULED] and user_role != 'mentor':
        messages.error(request, 'This session is not available for joining.')
        return redirect('sessions:detail', pk=session.id)
    
    # If mentor is joining and session is scheduled, make it live
    if user_role == 'mentor' and session.status == Session.SCHEDULED:
        # Set session to live and record when it started
        session.status = Session.LIVE
        session.live_started_at = timezone.now()
        session.save()
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Session {session.id} set to live by mentor {request.user.id} in session_room view")
        
        # Notify learners with confirmed bookings
        for booking in session.bookings.filter(status=Booking.CONFIRMED):
            try:
                # Create a notification
                notification = Notification.objects.create(
                    user=booking.learner,
                    title="Session is Live",
                    message=f"The session '{session.title}' is now live! Join to start learning.",
                    link=f"/sessions/{session.room_code}/join/?direct=true"
                )
                
                # Send WebSocket notification if channel layer is available
                try:
                    from channels.layers import get_channel_layer
                    from asgiref.sync import async_to_sync
                    
                    channel_layer = get_channel_layer()
                    if channel_layer:
                        # Send to user's notification group
                        async_to_sync(channel_layer.group_send)(
                            f"notifications_{booking.learner.id}",
                            {
                                "type": "notification_message",
                                "message": {
                                    "id": notification.id,
                                    "title": notification.title,
                                    "message": notification.message,
                                    "link": notification.link,
                                    "created_at": notification.created_at.isoformat(),
                                    "is_read": False
                                }
                            }
                        )
                        
                        # Send to user's dashboard group
                        async_to_sync(channel_layer.group_send)(
                            f"dashboard_{booking.learner.id}",
                            {
                                "type": "session_update",
                                "message": {
                                    "session_id": session.id,
                                    "status": "live",
                                    "room_code": str(session.room_code),
                                    "join_url": f"/sessions/{session.room_code}/join/?direct=true"
                                }
                            }
                        )
                except Exception as e:
                    logger.error(f"Error sending WebSocket notification: {str(e)}")
            except Exception as e:
                logger.error(f"Error creating notification: {str(e)}")
    
    # Check if this is a direct access request and what role was specified
    is_direct = request.GET.get('direct') == 'true'
    role_param = request.GET.get('role')
    
    # Override user_role if role parameter is provided and valid
    if role_param in ['mentor', 'learner'] and is_direct:
        # Only allow override if the user actually has this role
        if (role_param == 'mentor' and session.mentor == request.user) or \
           (role_param == 'learner' and user_role == 'learner'):
            user_role = role_param
    
    # Prepare WebRTC context with enhanced ICE server configuration
    # Create a proper ICE servers configuration list for WebRTC
    ice_servers = [
        {
            'urls': getattr(settings, 'STUN_SERVER', 'stun:stun.l.google.com:19302')
        }
    ]
    
    # Add TURN server if available
    turn_server = getattr(settings, 'TURN_SERVER', '')
    turn_username = getattr(settings, 'TURN_USERNAME', '')
    turn_credential = getattr(settings, 'TURN_CREDENTIAL', '')
    
    if turn_server:
        ice_servers.append({
            'urls': turn_server,
            'username': turn_username,
            'credential': turn_credential
        })
    
    # Add additional Google STUN servers for redundancy
    ice_servers.extend([
        {'urls': 'stun:stun1.l.google.com:19302'},
        {'urls': 'stun:stun2.l.google.com:19302'},
        {'urls': 'stun:stun3.l.google.com:19302'},
        {'urls': 'stun:stun4.l.google.com:19302'}
    ])
    
    context = {
        'session': session,
        'user_role': user_role,
        'ice_servers': json.dumps(ice_servers),  # Pass as JSON string to JS
        'room_code': str(session.room_code),
        'room_name': str(session.room_code),  # For backward compatibility
        'user_name': request.user.get_full_name() or request.user.username,
        'user_id': request.user.id,
        'is_direct': is_direct,
        'direct_role': role_param if is_direct else None,
    }
    
    # Use the pro room template that exactly matches your design reference
    return render(request, 'sessions/room_pro.html', context)

@login_required
def session_feedback(request, room_code):
    """Handle feedback submission after a session."""
    session = get_object_or_404(Session, room_code=room_code)
    
    # Check if user is authenticated
    if not request.user.is_authenticated:
        return JsonResponse({'status': 'error', 'message': 'Authentication required'}, status=401)
        
    # Check if user has permission to submit feedback
    if hasattr(request.user, 'is_learner') and request.user.is_learner:
        # Find the booking for this session and user
        booking = Booking.objects.filter(session=session, learner=request.user).first()
        if not booking:
            return JsonResponse({'status': 'error', 'message': 'No booking found for this session'}, status=403)
            
        if request.method == 'POST':
            try:
                data = json.loads(request.body)
                rating = data.get('rating', 0)
                feedback_text = data.get('feedback', '')
                
                # Create user rating
                from apps.users.models import UserRating
                
                # Create or update rating
                rating_obj, created = UserRating.objects.get_or_create(
                    from_user=request.user,
                    to_user=session.mentor,
                    session=session,
                    defaults={
                        'rating': rating,
                        'comments': feedback_text
                    }
                )
                
                if not created:
                    rating_obj.rating = rating
                    rating_obj.comments = feedback_text
                    rating_obj.save()
                    
                # Mark the booking as completed if not already
                if booking.status != Booking.COMPLETED:
                    booking.status = Booking.COMPLETED
                    booking.save()
                    
                # Create notification for mentor
                Notification.objects.create(
                    user=session.mentor,
                    title="New Feedback Received",
                    message=f"You've received a {rating}/5 rating for your session '{session.title}'.",
                    link=f"/users/dashboard/mentor/?tab=reviews"
                )
                
                return JsonResponse({'status': 'success'})
            except json.JSONDecodeError:
                return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)
            except Exception as e:
                return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
        else:
            return JsonResponse({'status': 'error', 'message': 'POST method required'}, status=405)
    else:
        return JsonResponse({'status': 'error', 'message': 'Only learners can submit feedback'}, status=403)

@login_required
def end_session(request, session_id):
    """View for mentors to end a session."""
    session = get_object_or_404(Session, id=session_id, mentor=request.user)
    
    if session.status != Session.LIVE:
        messages.error(request, 'Only live sessions can be ended.')
        return redirect('users:mentor_dashboard')
    
    if request.method == 'POST':
        session.status = Session.COMPLETED
        session.save()
        
        # Mark bookings as completed
        session.bookings.filter(status=Booking.CONFIRMED).update(status=Booking.COMPLETED)
        
        # Notify learners
        for booking in session.bookings.filter(status=Booking.COMPLETED):
            Notification.objects.create(
                user=booking.learner,
                message=f"Session '{session.title}' has ended. Please provide your feedback.",
                link=f"/dashboard/learner/activity/"
            )
        
        messages.success(request, 'Session ended successfully.')
        return redirect('users:mentor_dashboard')
    
    return render(request, 'sessions/end_session.html', {
        'session': session
    })

@login_required
def submit_feedback(request, booking_id):
    """View for learners to submit feedback for a completed session."""
    booking = get_object_or_404(
        Booking,
        id=booking_id,
        learner=request.user,
        status=Booking.COMPLETED,
        feedback_submitted=False
    )
    
    if request.method == 'POST':
        form = FeedbackForm(request.POST)
        if form.is_valid():
            # Save the rating
            from apps.users.models import UserRating
            
            UserRating.objects.update_or_create(
                mentor=booking.session.mentor,
                learner=request.user,
                defaults={
                    'rating': form.cleaned_data['rating'],
                    'review': form.cleaned_data['review']
                }
            )
            
            # Mark feedback as submitted
            booking.feedback_submitted = True
            booking.save()
            
            messages.success(request, 'Feedback submitted successfully!')
            return redirect('users:learner_activity')
    else:
        form = FeedbackForm()
    
    return render(request, 'sessions/feedback.html', {
        'form': form,
        'booking': booking
    })


@login_required
def accept_session_request(request, request_id):
    """View for mentors to accept a session request."""
    session_request = get_object_or_404(
        SessionRequest,
        id=request_id,
        mentor=request.user
    )
    
    if request.method == 'POST':
        with transaction.atomic():
            # Update request status to accepted
            session_request.status = SessionRequest.ACCEPTED
            session_request.save()
            
            # Create a new session based on the request
            session = Session.objects.create(
                mentor=request.user,
                title=session_request.title,
                description=session_request.description,
                topics=[session_request.domain.name], # Use domain name as topic
                schedule=session_request.proposed_time,
                duration=session_request.duration,
                price=session_request.budget,
                status=Session.SCHEDULED
            )
            
            # Create a booking for the learner
            booking = Booking.objects.create(
                session=session,
                learner=session_request.learner,
                status=Booking.PENDING # Will be confirmed after payment
            )
            
            # Notify the learner
            Notification.objects.create(
                user=session_request.learner,
                message=f"Your session request '{session_request.title}' has been accepted! Please complete the payment to confirm.",
                link=reverse('payments:process', kwargs={'booking_id': booking.id})
            )
        
        messages.success(request, 'Request accepted and session created!')
        return redirect('users:mentor_requests')
    
    # If not POST, redirect to the respond page
    return redirect('sessions:respond_to_request', request_id=request_id)


@login_required
def reject_session_request(request, request_id):
    """View for mentors to reject a session request."""
    session_request = get_object_or_404(
        SessionRequest,
        id=request_id,
        mentor=request.user
    )
    
    if request.method == 'POST':
        reason = request.POST.get('reason', '')
        
        # Update request status to declined
        session_request.status = SessionRequest.DECLINED
        session_request.mentor_notes = reason
        session_request.save()
        
        # Notify the learner
        Notification.objects.create(
            user=session_request.learner,
            message=f"Your session request '{session_request.title}' has been declined.",
            link=reverse('users:learner_activity')
        )
        
        messages.success(request, 'Request declined successfully.')
        return redirect('users:mentor_requests')
    
    # If not POST, redirect to the respond page
    return redirect('sessions:respond_to_request', request_id=request_id)


@login_required
def modify_session_request(request, request_id):
    """View for mentors to modify a session request with a counter offer."""
    session_request = get_object_or_404(
        SessionRequest,
        id=request_id,
        mentor=request.user
    )
    
    if request.method == 'POST':
        counter_date = request.POST.get('counter_date')
        counter_time = request.POST.get('counter_time')
        notes = request.POST.get('notes', '')
        is_free_session = request.POST.get('is_free_session') == 'on'
        
        # If it's a free session, set counter_offer to 0, otherwise get from POST
        if is_free_session:
            counter_offer = '0'
        else:
            counter_offer = request.POST.get('counter_offer')
        
        if counter_date and counter_time:
            try:
                # Parse the counter date and time
                counter_datetime = f"{counter_date} {counter_time}"
                counter_datetime = timezone.datetime.strptime(counter_datetime, "%Y-%m-%d %H:%M")
                counter_datetime = timezone.make_aware(counter_datetime)
                
                # Update the request
                session_request.status = SessionRequest.COUNTERED
                session_request.counter_offer = Decimal(counter_offer)
                session_request.counter_time = counter_datetime
                session_request.mentor_notes = notes
                session_request.is_free = is_free_session
                session_request.save()
                
                # Notify the learner
                Notification.objects.create(
                    user=session_request.learner,
                    message=f"Your session request '{session_request.title}' has received a counter offer.",
                    link=reverse('users:learner_activity')
                )
                
                messages.success(request, 'Counter offer sent successfully.')
                return redirect('users:mentor_requests')
            except ValueError:
                messages.error(request, 'Invalid date, time, or price format.')
        else:
            messages.error(request, 'Please provide all required information.')
    
    # If not POST or validation failed, redirect to the respond page
    return redirect('sessions:respond_to_request', request_id=request_id)


@login_required
def accept_counter_offer(request, request_id):
    """View for learners to accept a counter offer from a mentor."""
    session_request = get_object_or_404(
        SessionRequest,
        id=request_id,
        learner=request.user,
        status=SessionRequest.COUNTERED
    )
    
    if request.method == 'POST':
        # Create a session based on the counter offer
        session = Session.objects.create(
            mentor=session_request.mentor,
            title=session_request.title,
            description=session_request.description,
            topics=[session_request.domain.name] if session_request.domain else [],
            schedule=session_request.counter_time,
            duration=session_request.duration,
            price=session_request.counter_offer,
            max_participants=1,  # One-to-one session by default
            status=Session.SCHEDULED
        )
        
        # Check if the session is free (either from is_free flag or price is 0)
        is_free_session = session_request.is_free or session_request.counter_offer == 0
        
        # Create a booking for the learner
        booking = Booking.objects.create(
            session=session,
            learner=request.user,
            status=Booking.CONFIRMED if is_free_session else Booking.PENDING
        )
        
        # Update the request status
        session_request.status = SessionRequest.ACCEPTED
        session_request.save()
        
        # Notify the mentor
        Notification.objects.create(
            user=session_request.mentor,
            message=f"Your counter offer for session '{session_request.title}' has been accepted by {request.user.get_full_name()}.",
            link=reverse('users:mentor_dashboard')
        )
        
        # Check if the session is free (either from is_free flag or price is 0)
        if is_free_session:
            messages.success(request, 'You have successfully booked this free session.')
            return redirect('users:learner_dashboard')
        else:
            # Redirect to payment process
            messages.success(request, 'Counter offer accepted. Please complete the payment to confirm your booking.')
            return redirect('payments:process', booking_id=booking.id)
    
    # If not POST, redirect to dashboard
    return redirect('users:learner_dashboard')


@login_required
def cancel_session_request(request, request_id):
    """View for learners to cancel a session request."""
    session_request = get_object_or_404(
        SessionRequest,
        id=request_id,
        learner=request.user
    )
    
    if request.method == 'POST':
        # Add a note about cancellation
        cancellation_reason = request.POST.get('reason', 'Cancelled by learner')
        session_request.mentor_notes = f"{session_request.mentor_notes or ''}\n\nCancelled: {cancellation_reason}"
        session_request.status = SessionRequest.DECLINED
        session_request.save()
        
        # Notify the mentor
        Notification.objects.create(
            user=session_request.mentor,
            message=f"A session request '{session_request.title}' has been cancelled by {request.user.get_full_name()}.",
            link=reverse('users:mentor_requests')
        )
        
        messages.success(request, 'Session request cancelled successfully.')
    
    return redirect('users:learner_dashboard')

@login_required
def go_live_session(request, room_code):
    """View to make a session go live and redirect to the room."""
    # Get the session
    session = get_object_or_404(Session, room_code=room_code)
    now = timezone.now()
    
    # Check if user is the mentor or a confirmed learner
    is_mentor = session.mentor == request.user
    is_learner = request.user.is_learner and session.bookings.filter(
        learner=request.user, status=Booking.CONFIRMED
    ).exists()
    
    if not (is_mentor or is_learner):
        messages.error(request, 'You do not have permission to access this session room.')
        if request.user.is_mentor:
            return redirect('users:mentor_dashboard')
        else:
            return redirect('users:learner_dashboard')
    
    # If the session is already live, just redirect to the room
    if session.status == Session.LIVE:
        messages.info(request, 'Joining the live session now...')
        # Redirect with direct=true parameter for auto-join
        return redirect(f'/sessions/{session.room_code}/?direct=true&role={"mentor" if is_mentor else "learner"}')
        
    # At this point, we're handling making a session live (mentor only)
    if not is_mentor:
        messages.error(request, 'Only the mentor can make this session go live.')
        return redirect('users:learner_dashboard')
    
    # Check if session is in scheduled status
    if session.status != Session.SCHEDULED:
        messages.error(request, f'Cannot go live with a session that is {session.get_status_display().lower()}.')
        return redirect('users:mentor_session_detail', session_id=session.id)
    
    # Calculate time until session
    time_until_session = session.schedule - now
    
    # Check if it's too early to go live (more than 15 min before scheduled time)
    # We're relaxing this restriction to 30 minutes to be more flexible
    if time_until_session > timezone.timedelta(minutes=30):
        messages.error(
            request, 
            f'It\'s too early to go live. You can make the session live within 30 minutes of the scheduled time.'
        )
        return redirect('users:mentor_session_detail', session_id=session.id)
    
    # Check if it's too late (session has already ended)
    if time_until_session < timezone.timedelta(minutes=-session.duration):
        messages.error(
            request, 
            f'This session was scheduled to end {abs(time_until_session.total_seconds() // 60 + session.duration)} minutes ago.'
        )
        return redirect('users:mentor_session_detail', session_id=session.id)
    
    # Update session status to live and record the start time
    session.status = Session.LIVE
    session.live_started_at = timezone.now()
    session.save()
    
    # Set up logging
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Session {session.id} set to live by mentor {request.user.id} in go_live_session view")
    
    # Import necessary modules
    from apps.notifications.models import Notification
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    
    # Get the channel layer for WebSocket communications
    channel_layer = get_channel_layer()
    
    # Import improved notification utility
    from apps.notifications.utils import send_notification_to_user
    import time
    
    # Get session details for notifications
    session_title = session.title
    mentor_name = session.mentor.get_full_name() or session.mentor.username
    join_url = f"/sessions/{session.room_code}/join/?direct=true"
    
    # Get all confirmed bookings for this session
    confirmed_bookings = session.bookings.filter(status=Booking.CONFIRMED)
    booking_count = confirmed_bookings.count()
    
    # Log the notification attempt with clear count
    logger.info(f"Sending 'Session is Live' notifications to {booking_count} learners for session {session.id}")
    
    # Notify all confirmed learners with improved notifications
    for booking in confirmed_bookings:
        try:
            learner = booking.learner
            learner_id = learner.id
            learner_name = learner.get_full_name() or learner.username
            
            # Create an urgent notification in the database with improved formatting and clearer call-to-action
            notification = Notification.objects.create(
                user=learner,
                title="🔴 Your Session is Live Now!",
                message=f"Your booked session '{session_title}' with {mentor_name} is now live! Click here to join immediately.",
                notification_type='success',  # Changed to success type for better visibility
                reference_id=session.id,
                link=join_url
            )
            
            logger.info(f"Created database notification {notification.id} for learner {learner_id}")
            
            # For redundancy, also use the notification utility which handles WebSocket communication
            send_notification_to_user(
                user_id=learner_id,
                title="🔴 Join Your Live Session Now",
                message=f"Your session '{session_title}' with {mentor_name} has started! Join now to avoid missing any content.",
                notification_type="success",
                reference_id=session.id
            )
            
            # Send real-time WebSocket notifications for immediate alerts (multiple channels for redundancy)
            if channel_layer:
                try:
                    # 1. Send to user's notification group with improved formatting
                    async_to_sync(channel_layer.group_send)(
                        f"notif_{learner_id}",  # Corrected group name format
                        {
                            "type": "notification_message",
                            "notification": {  # Correct key name for improved compatibility
                                "id": notification.id,
                                "title": "🔴 Session Started - Join Now!",
                                "message": notification.message,
                                "link": notification.link,
                                "created_at": notification.created_at.isoformat(),
                                "read": False,
                                "notification_type": "success"
                            }
                        }
                    )
                    
                    # 2. Send to user's dashboard group with enhanced data
                    async_to_sync(channel_layer.group_send)(
                        f"dashboard_{learner_id}",
                        {
                            "type": "session_update",
                            "message": {
                                "session_id": session.id,
                                "title": session_title,
                                "mentor_name": mentor_name,
                                "status": "live",
                                "room_code": str(session.room_code),
                                "join_url": join_url,
                                "timestamp": int(time.time())  # Add timestamp for easier frontend handling
                            }
                        }
                    )
                    
                    # 3. Also try the notifications group name format for maximum compatibility
                    async_to_sync(channel_layer.group_send)(
                        f"notifications_{learner_id}",
                        {
                            "type": "notification_message",
                            "message": {
                                "id": notification.id,
                                "title": "🔴 Session Started - Join Now!",
                                "message": notification.message,
                                "link": notification.link,
                                "created_at": notification.created_at.isoformat(),
                                "is_read": False
                            }
                        }
                    )
                    
                    logger.info(f"Successfully sent WebSocket notifications to learner {learner_id}")
                except Exception as e:
                    logger.error(f"Error sending WebSocket notification to learner {learner_id}: {str(e)}")
                    # Continue despite WebSocket errors - we have the database notification as backup
        except Exception as e:
            logger.error(f"Error processing notification for learner {booking.learner.id}: {str(e)}")
    
    messages.success(request, 'Session is now live. Joining room...')
    
    # Redirect to the join page with direct=true parameter to bypass the join screen
    # Also include mentor role parameter
    return redirect(f'/sessions/{session.room_code}/join/?direct=true&mentor=true')
