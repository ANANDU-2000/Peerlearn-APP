"""
Views for session listing, creation, booking, and WebRTC room.
Also includes API endpoints for real-time updates.
"""
import json
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
        """Filter to show only scheduled or live sessions."""
        queryset = Session.objects.filter(status__in=[Session.SCHEDULED, Session.LIVE])
        
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
    
    if not request.user.is_learner:
        messages.error(request, 'Only learners can book sessions.')
        return redirect('sessions:detail', pk=session_id)
    
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
            
            if session.is_free:
                # Free session - confirm immediately
                messages.success(request, 'Session booked successfully!')
                
                # Notify the mentor
                Notification.objects.create(
                    user=session.mentor,
                    message=f"{request.user.get_full_name() or request.user.username} has booked your session '{session.title}'",
                    link=f"/dashboard/mentor/"
                )
                
                return redirect('sessions:detail', pk=session_id)
            else:
                # Paid session - redirect to payment
                return redirect('payment_create', booking_id=booking.id)
    
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
        
        # Notify the mentor
        Notification.objects.create(
            user=booking.session.mentor,
            message=f"Booking for '{booking.session.title}' has been cancelled.",
            link=f"/dashboard/mentor/"
        )
        
        messages.success(request, 'Booking cancelled successfully.')
        return redirect('users:learner_activity')
    
    return render(request, 'sessions/cancel_booking.html', {
        'booking': booking
    })

@login_required
def join_session_room(request, room_code):
    """View for joining a session room via /sessions/{room_code}/join/ URL."""
    session = get_object_or_404(Session, room_code=room_code)
    return redirect('sessions:room', room_code=room_code)
    
def session_room(request, room_code):
    """View for the WebRTC session room."""
    session = get_object_or_404(Session, room_code=room_code)
    
    # Check if user has permission to enter the room
    if session.mentor == request.user:
        # Mentor of the session
        user_role = 'mentor'
    elif request.user.is_learner and Booking.objects.filter(
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
    if session.status not in [Session.LIVE, Session.SCHEDULED]:
        messages.error(request, 'This session is not available for joining.')
        return redirect('sessions:detail', pk=session.id)
    
    # If mentor is joining and session is scheduled, make it live
    if user_role == 'mentor' and session.status == Session.SCHEDULED:
        session.status = Session.LIVE
        session.save()
        
        # Notify learners with confirmed bookings
        for booking in session.bookings.filter(status=Booking.CONFIRMED):
            Notification.objects.create(
                user=booking.learner,
                message=f"Session '{session.title}' is now live! Join now.",
                link=session.get_room_url
            )
    
    # Prepare WebRTC context
    context = {
        'session': session,
        'user_role': user_role,
        'STUN_SERVER': settings.STUN_SERVER,
        'TURN_SERVER': settings.TURN_SERVER,
        'TURN_USERNAME': settings.TURN_USERNAME,
        'TURN_CREDENTIAL': settings.TURN_CREDENTIAL,
        'room_name': str(session.room_code),
        'user_name': request.user.get_full_name() or request.user.username,
        'user_id': request.user.id,
    }
    
    return render(request, 'sessions/room.html', context)

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
    
    # Check if user is the mentor
    if session.mentor != request.user:
        messages.error(request, 'Only the mentor can make this session go live.')
        return redirect('users:mentor_dashboard')
    
    # Check if session is in scheduled status
    if session.status != Session.SCHEDULED:
        if session.status == Session.LIVE:
            # Session is already live, just redirect to the room
            messages.info(request, 'Session is already live. Joining now.')
        else:
            messages.error(request, f'Cannot go live with a session that is {session.get_status_display().lower()}.')
            return redirect('users:mentor_session_detail', session_id=session.id)
    
    # Calculate time until session
    time_until_session = session.schedule - timezone.now()
    
    # Check if it's too early to go live (more than 15 min before scheduled time)
    if time_until_session > timezone.timedelta(minutes=15):
        messages.error(
            request, 
            f'It\'s too early to go live. You can make the session live within 15 minutes of the scheduled time.'
        )
        return redirect('users:mentor_session_detail', session_id=session.id)
    
    # Check if it's too late (session has already ended)
    if time_until_session < timezone.timedelta(minutes=-session.duration):
        messages.error(
            request, 
            f'This session was scheduled to end {abs(time_until_session.total_seconds() // 60 + session.duration)} minutes ago.'
        )
        return redirect('users:mentor_session_detail', session_id=session.id)
    
    # Update session status to live
    session.status = Session.LIVE
    session.save()
    
    # Notify all confirmed learners
    from apps.notifications.models import Notification
    
    for booking in session.bookings.filter(status=Booking.CONFIRMED):
        Notification.objects.create(
            user=booking.learner,
            message=f"Session '{session.title}' is now live! Join now.",
            notification_type='session_live',
            reference_id=session.id,
            link=f"/sessions/room/{session.room_code}/"
        )
    
    messages.success(request, 'Session is now live. Joining room...')
    
    # Redirect to the session room
    return redirect('sessions:room', room_code=session.room_code)
