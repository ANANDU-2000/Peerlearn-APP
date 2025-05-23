"""
Views for user authentication, registration and profile management.
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.views.generic import ListView, DetailView, UpdateView
from django.urls import reverse_lazy
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.contrib import messages
from django.http import HttpResponseRedirect, JsonResponse, HttpResponse
import json

from .models import CustomUser, UserRating
from apps.learning_sessions.models import Session, Booking
from .forms import (
    LearnerSignUpForm, MentorSignUpForm, 
    UserLoginForm, LearnerProfileForm, 
    MentorProfileForm, RatingForm
)

def logout_view(request):
    """
    Handle user logout and redirect to home page.
    """
    logout(request)
    messages.success(request, "You have been successfully logged out.")
    return redirect('home')


def auth_selector(request):
    """View to select between learner and mentor registration/login."""
    return render(request, 'auth/selector.html')

def learner_signup(request):
    """View for learner registration."""
    if request.method == 'POST':
        form = LearnerSignUpForm(request.POST, request.FILES)
        if form.is_valid():
            user = form.save(commit=False)
            user.role = CustomUser.LEARNER
            user.save()
            login(request, user)
            messages.success(request, 'Account created successfully!')
            return redirect('users:learner_dashboard')
    else:
        form = LearnerSignUpForm()
    
    return render(request, 'auth/signup_learner.html', {'form': form})

def mentor_signup(request):
    """View for mentor registration."""
    if request.method == 'POST':
        form = MentorSignUpForm(request.POST, request.FILES)
        if form.is_valid():
            user = form.save(commit=False)
            user.role = CustomUser.MENTOR
            user.save()
            login(request, user)
            messages.success(
                request, 
                'Mentor profile created successfully! ✅ You can now create sessions and start mentoring.'
            )
            return redirect('users:mentor_dashboard')
    else:
        form = MentorSignUpForm()
    
    return render(request, 'auth/signup_mentor.html', {'form': form})

def check_email_exists(request):
    """API endpoint to check if an email already exists in the database."""
    if request.method == 'GET':
        email = request.GET.get('email', '')
        exists = CustomUser.objects.filter(email=email).exists()
        
        # Also check if the email is valid with a simple format check
        is_valid = '@' in email and '.' in email.split('@')[1] if '@' in email else False
        
        return JsonResponse({
            'exists': exists,
            'is_valid': is_valid,
            'message': 'Email is already registered' if exists else '',
        })
    
    return JsonResponse({'error': 'Invalid request method'}, status=400)

def login_view(request):
    """View for user login."""
    if request.method == 'POST':
        form = UserLoginForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data.get('email')
            password = form.cleaned_data.get('password')
            
            # First, try to find the user by email
            try:
                user_obj = CustomUser.objects.get(email=email)
                # Then authenticate with their username
                user = authenticate(username=user_obj.username, password=password)
                
                if user is not None:
                    login(request, user)
                    messages.success(request, 'Logged in successfully!')
                    
                    # Redirect based on role
                    if user.is_mentor:
                        return redirect('users:mentor_dashboard')
                    elif user.is_learner:
                        return redirect('users:learner_dashboard')
                    else:
                        return redirect('home')
                else:
                    messages.error(request, 'Invalid password.')
            except CustomUser.DoesNotExist:
                messages.error(request, 'No account found with this email.')
        else:
            # Form validation failed
            messages.error(request, 'Please check your input and try again.')
    else:
        form = UserLoginForm()
    
    return render(request, 'auth/login.html', {'form': form})

@method_decorator(login_required, name='dispatch')
class MentorListView(ListView):
    """View to list all mentors."""
    model = CustomUser
    template_name = 'mentors/list.html'
    context_object_name = 'mentors'
    
    def get_queryset(self):
        """Filter to only show mentors."""
        return CustomUser.objects.filter(role=CustomUser.MENTOR)

@method_decorator(login_required, name='dispatch')
class MentorDetailView(DetailView):
    """View to show a mentor's profile."""
    model = CustomUser
    template_name = 'mentors/profile.html'
    context_object_name = 'mentor'
    
    def get_queryset(self):
        """Filter to only show mentors."""
        return CustomUser.objects.filter(role=CustomUser.MENTOR)
    
    def get_context_data(self, **kwargs):
        """Add rating form and other context data."""
        context = super().get_context_data(**kwargs)
        
        # Add rating form if user is a learner
        if self.request.user.is_learner:
            context['rating_form'] = RatingForm()
        
        # Add mentor's sessions
        mentor = self.get_object()
        context['upcoming_sessions'] = Session.objects.filter(
            mentor=mentor,
            status__in=['scheduled', 'live']
        ).order_by('schedule')
        
        # Add domains for the session request form
        from apps.learning_sessions.models import Domain
        context['domains'] = Domain.objects.all()
        
        return context

@login_required
def rate_mentor(request, pk):
    """View to rate a mentor."""
    mentor = get_object_or_404(CustomUser, pk=pk, role=CustomUser.MENTOR)
    
    if not request.user.is_learner:
        messages.error(request, 'Only learners can rate mentors.')
        return redirect('users:mentor_detail', pk=pk)
    
    if request.method == 'POST':
        form = RatingForm(request.POST)
        if form.is_valid():
            rating, created = UserRating.objects.update_or_create(
                mentor=mentor,
                learner=request.user,
                defaults={
                    'rating': form.cleaned_data.get('rating'),
                    'review': form.cleaned_data.get('review')
                }
            )
            if created:
                messages.success(request, 'Rating submitted successfully!')
            else:
                messages.success(request, 'Rating updated successfully!')
            return redirect('users:mentor_detail', pk=pk)
    
    messages.error(request, 'There was an error with your submission.')
    return redirect('users:mentor_detail', pk=pk)

def get_top_mentors(user, limit=6):
    """Get top rated mentors for recommendation."""
    from apps.users.models import CustomUser
    from django.db.models import Avg, Count, Q, F, Case, When, Value, IntegerField
    from apps.learning_sessions.models import Session
    import logging
    from django.utils import timezone
    
    # Set up logger for debugging
    logger = logging.getLogger(__name__)
    
    # Get current time to filter out mentors with no upcoming sessions
    now = timezone.now()
    
    # First, get only valid mentors with proper profiles and upcoming sessions
    # This ensures we only show mentors who are active and have sessions
    all_active_mentors = CustomUser.objects.filter(
        role=CustomUser.MENTOR,
        is_active=True,
        # Ensure mentors have properly configured profiles
        first_name__isnull=False,
        last_name__isnull=False
    ).filter(
        # Only include mentors who have at least one upcoming session
        # Use the correct related_name from Session model to CustomUser
        Q(session__schedule__gte=now, session__status='scheduled') |
        Q(session__status='live')
    ).distinct().annotate(
        # Calculate ratings properly
        avg_rating=Avg('ratings_received__rating'),
        rating_count=Count('ratings_received'),
        # Count valid upcoming sessions with correct related_name
        upcoming_sessions_count=Count(
            'session',
            filter=Q(session__schedule__gte=now) & Q(session__status='scheduled')
        ),
        # Count active sessions with correct related_name
        active_sessions_count=Count(
            'session',
            filter=Q(session__status='live')
        )
    )
    
    # Log how many valid mentors we have
    mentor_count = all_active_mentors.count()
    logger.info(f"Found {mentor_count} valid active mentors with upcoming/live sessions")
    
    # If we have no valid mentors at all, return an empty list
    if mentor_count == 0:
        return []
    
    # First try to get well-rated mentors with at least one session
    top_rated = all_active_mentors.filter(
        # Must have at least one rating and a good score
        Q(rating_count__gte=1, avg_rating__gte=4) |
        # OR at least have some upcoming or active sessions
        Q(upcoming_sessions_count__gte=1) |
        Q(active_sessions_count__gte=1)
    ).order_by('-avg_rating', '-upcoming_sessions_count', '-active_sessions_count')[:limit]
    
    # Log how many top rated mentors we found
    top_rated_count = top_rated.count()
    logger.info(f"Found {top_rated_count} top rated mentors")
    
    # If we don't have enough top rated mentors, include other active mentors
    if top_rated_count < limit:
        # Get the IDs of mentors we already have - use a list of IDs instead of mentor objects
        existing_ids = list(top_rated.values_list('id', flat=True))
        
        # How many more mentors we need
        additional_needed = limit - top_rated_count
        logger.info(f"Need {additional_needed} more mentors to fill quota")
        
        # Get additional mentors based on session count
        active_mentors = all_active_mentors.exclude(
            id__in=existing_ids
        ).annotate(
            session_count=Count('session')
        ).order_by('-session_count')[:additional_needed]
        
        # Log how many active mentors we found to supplement
        active_mentors_count = active_mentors.count()
        logger.info(f"Found {active_mentors_count} additional active mentors")
        
        # Combine the lists
        top_rated = list(top_rated) + list(active_mentors)
    
    # If we still don't have any mentors (unlikely, but possible with no ratings and no sessions)
    # Just get any mentors up to the limit
    if len(top_rated) == 0:
        logger.info("No rated or active mentors found, getting any available mentors")
        top_rated = list(all_active_mentors.order_by('?')[:limit])
    
    # Make sure all mentors have avg_rating and rating_count attributes
    for mentor in top_rated:
        if mentor.avg_rating is None:
            mentor.avg_rating = 0
        if mentor.rating_count is None:
            mentor.rating_count = 0
    
    # Log final count before returning
    logger.info(f"Returning {len(top_rated)} mentors")
    return top_rated

def learner_dashboard(request):
    """View for learner dashboard with tab navigation support."""
    # Check if user is authenticated first
    if not request.user.is_authenticated:
        messages.error(request, 'You must be logged in to access the dashboard.')
        return redirect('users:login')
        
    # Then check if user is a learner
    if not request.user.is_learner:
        messages.error(request, 'Access denied. This dashboard is for learners only.')
        return redirect(request.user.get_dashboard_url())
    
    # Get active tab from query parameter, default to 'home'
    active_tab = request.GET.get('tab', 'home')
    
    # Validate active tab value
    valid_tabs = ['home', 'activity', 'sessions', 'mentors', 'notifications', 'profile']
    if active_tab not in valid_tabs:
        active_tab = 'home'
    
    # Get real ML-based recommendations (no fake data)
    from apps.learning_sessions.models import Session, Booking, SessionRequest
    from django.db.models import Q, Count, Avg, F, ExpressionWrapper, fields
    from django.utils import timezone
    import json
    import logging
    
    logger = logging.getLogger(__name__)
    now = timezone.now()
    
    # Recommended sessions based on the learner's interests and career goal
    recommended_sessions = []
    trending_sessions = []
    
    logger.info(f"Finding recommendations for user {request.user.id} with schedule after {now}")
    
    # Try to fetch personalized recommendations - strictly future sessions only
    if hasattr(request.user, 'interests') and request.user.interests:
        # Convert interests string to list if stored as JSON string
        user_interests = request.user.interests if isinstance(request.user.interests, list) else json.loads(request.user.interests or '[]')
        
        if user_interests:
            # Get ONLY future sessions or currently live sessions related to user interests
            interest_filter = Q(topics__overlap=user_interests)
            if hasattr(request.user, 'career_goal') and request.user.career_goal:
                interest_filter = interest_filter | Q(title__icontains=request.user.career_goal) | Q(description__icontains=request.user.career_goal)
            
            status_filter = Q(status='scheduled') | Q(status='live')
            time_filter = Q(schedule__gte=now)
            
            # Combined filter with strict time enforcement
            combined_filter = status_filter & time_filter & interest_filter
            
            # Select only sessions with valid mentors (properly configured)
            from apps.users.models import CustomUser
            recommended_sessions = Session.objects.filter(combined_filter).filter(
                mentor__role=CustomUser.MENTOR,
                mentor__is_active=True
            ).select_related('mentor').distinct().order_by('schedule')[:6]
            
            logger.info(f"Found {recommended_sessions.count()} personalized recommendations")
    
    # If no personalized recommendations, get trending sessions with strict time filters
    if not recommended_sessions or recommended_sessions.count() == 0:
        logger.info("No personalized recommendations found, getting trending sessions")
        # Get trending sessions by number of bookings - ONLY future or live sessions
        status_filter = Q(status='scheduled') | Q(status='live')
        time_filter = Q(schedule__gte=now)
        
        # Combined filter with strict time enforcement
        combined_filter = status_filter & time_filter
        
        # Get sessions with confirmed bookings and valid mentors only
        from apps.users.models import CustomUser
        trending_sessions = Session.objects.filter(combined_filter).filter(
            mentor__role=CustomUser.MENTOR,
            mentor__is_active=True
        ).select_related('mentor').annotate(
            booking_count=Count('bookings', filter=Q(bookings__status='confirmed'))
        ).order_by('-booking_count', 'schedule')[:6]
        
        logger.info(f"Found {trending_sessions.count()} trending sessions")
        
    # If still no sessions found, just get ANY upcoming sessions as a final fallback
    if (not recommended_sessions or recommended_sessions.count() == 0) and (not trending_sessions or trending_sessions.count() == 0):
        logger.info("No trending sessions found either, getting ANY upcoming sessions as fallback")
        from apps.users.models import CustomUser
        fallback_sessions = Session.objects.filter(
            Q(status='scheduled') | Q(status='live'),
            schedule__gte=now,
            mentor__role=CustomUser.MENTOR,
            mentor__is_active=True
        ).select_related('mentor').order_by('schedule')[:6]
        
        trending_sessions = fallback_sessions
        logger.info(f"Found {fallback_sessions.count()} fallback sessions")
    
    # Mark sessions that are already booked by this learner
    booked_session_ids = Booking.objects.filter(
        learner=request.user
    ).values_list('session_id', flat=True)
    
    # Add attendee_count to recommended sessions
    for session in recommended_sessions:
        session.attendee_count = Booking.objects.filter(session=session, status__in=['confirmed', 'completed']).count()
        session.is_booked = session.id in booked_session_ids
    
    # Add attendee_count to trending sessions
    for session in trending_sessions:
        session.attendee_count = Booking.objects.filter(session=session, status__in=['confirmed', 'completed']).count()
        session.is_booked = session.id in booked_session_ids
    
    # Get activities (consolidated from bookings and requests)
    activities = []
    
    # Add bookings to activities - filter out expired sessions
    now = timezone.now()
    
    # Get all bookings first
    all_bookings = Booking.objects.filter(
        learner=request.user
    ).select_related('session', 'session__mentor').order_by('-created_at')
    
    # Filter out expired sessions that are scheduled but past their end time (keep completed and live sessions)
    filtered_bookings = []
    for booking in all_bookings:
        # Keep all completed or cancelled sessions
        if booking.session.status in ['completed', 'cancelled']:
            filtered_bookings.append(booking)
        # Keep all live sessions
        elif booking.session.status == 'live':
            filtered_bookings.append(booking)
        # For scheduled sessions, only keep those that haven't expired
        elif booking.session.status == 'scheduled':
            session_end_time = booking.session.schedule + timezone.timedelta(minutes=booking.session.duration)
            if session_end_time > now - timezone.timedelta(minutes=30):
                filtered_bookings.append(booking)
        
        # Stop after 10 items
        if len(filtered_bookings) >= 10:
            break
    
    bookings = filtered_bookings
    
    for booking in bookings:
        activity = {
            'type': 'booking',
            'type_color': 'green',
            'title': booking.session.title,
            'mentor': booking.session.mentor,
            'timestamp': booking.created_at,
            'status': booking.get_status_display(),
            'status_color': 'green' if booking.status == 'confirmed' else 'gray' if booking.status == 'completed' else 'yellow' if booking.status == 'pending' else 'red',
            'description': booking.session.description,
            'schedule': booking.session.schedule,
            'duration': booking.session.duration,
            'topics': booking.session.topics,
            'price': booking.session.price,
            'payment_status': booking.payment.get_status_display() if hasattr(booking, 'payment') else None,
            'booking_id': booking.id,
            'joinable': booking.status == 'confirmed' and booking.session.status == 'live',
            'can_cancel': booking.status == 'confirmed' and booking.session.status == 'scheduled',
            'can_review': booking.status == 'completed',
            'has_feedback': booking.feedback_submitted,
            'room_code': booking.session.room_code,
        }
        activities.append(activity)
    
    # Add requests to activities
    session_requests = SessionRequest.objects.filter(
        learner=request.user
    ).select_related('mentor').order_by('-created_at')[:10]
    
    for session_req in session_requests:
        activity = {
            'type': 'request',
            'type_color': 'indigo',
            'title': session_req.title,
            'mentor': session_req.mentor,
            'timestamp': session_req.created_at,
            'status': session_req.get_status_display(),
            'status_color': 'green' if session_req.status == 'accepted' else 'blue' if session_req.status == 'counter_offer' else 'yellow' if session_req.status == 'pending' else 'red',
            'description': session_req.description,
            'schedule': session_req.proposed_time,
            'duration': session_req.duration,
            'price': session_req.budget,
            'request_id': session_req.id,
            'can_confirm': session_req.status == 'counter_offer'
        }
        activities.append(activity)

    # Sort activities by timestamp
    activities.sort(key=lambda x: x['timestamp'], reverse=True)
    
    # Get unread notifications count
    from apps.notifications.models import Notification
    unread_notifications_count = Notification.objects.filter(
        user=request.user,
        read=False
    ).count()
    
    # Get all active sessions for topic filtering
    from apps.learning_sessions.models import Session
    time_filter = now - timezone.timedelta(hours=1)
    all_sessions = Session.objects.filter(
        Q(status='scheduled') | Q(status='live'),
        schedule__gte=time_filter
    ).order_by('schedule')
    
    # Use the logger from the parent function
    # No need to re-import logging here
    
    # Get top mentors for recommendations
    top_mentors = get_top_mentors(request.user, 6)
    
    # Get all unique session topics for filtering
    all_topics = []
    for session in all_sessions:
        if session.topics:
            for topic in session.topics:
                if topic not in all_topics:
                    all_topics.append(topic)
    
    # Add has_feedback attribute to bookings
    for booking in bookings:
        try:
            from apps.learning_sessions.models import Feedback
            booking.has_feedback = Feedback.objects.filter(booking=booking).exists()
        except ImportError:
            # If Feedback model doesn't exist yet, set has_feedback to False
            booking.has_feedback = False
    
    context = {
        'recommended_sessions': recommended_sessions,
        'trending_sessions': trending_sessions,
        'activities': activities,
        'session_requests': session_requests,
        'bookings': bookings,
        'top_mentors': top_mentors,
        'active_tab': active_tab, 
        'unread_notifications_count': unread_notifications_count,
        'now': now,  # Pass current time for countdown timers
        'topics': all_topics  # For session filtering
    }
    
    return render(request, 'learners_dash/dashboard.html', context)

@login_required
def mentor_dashboard(request):
    """View for mentor dashboard."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    # Fetch summary data for the dashboard
    from apps.learning_sessions.models import Session, SessionRequest, Booking
    from apps.payments.models import Payment
    from django.db.models import Sum
    from django.utils import timezone
    
    context = {
        'active_tab': 'dashboard',
        'total_sessions': Session.objects.filter(mentor=request.user).count(),
        'upcoming_sessions': Session.objects.filter(
            mentor=request.user, 
            schedule__gt=timezone.now(),
            status='scheduled'
        ).count(),
        'pending_requests': SessionRequest.objects.filter(
            mentor=request.user, 
            status='pending'
        ).count(),
        'earnings': Payment.objects.filter(
            booking__session__mentor=request.user,
            status='completed'
        ).aggregate(Sum('amount'))['amount__sum'] or 0,
    }
    
    return render(request, 'mentors_dash/dashboard.html', context)

@method_decorator(login_required, name='dispatch')
class LearnerProfileUpdateView(UpdateView):
    """View to update learner profile."""
    model = CustomUser
    form_class = LearnerProfileForm
    template_name = 'learners_dash/profile_edit.html'
    success_url = reverse_lazy('learner_dashboard')
    
    def get_object(self):
        return self.request.user
    
    def form_valid(self, form):
        messages.success(self.request, 'Profile updated successfully!')
        return super().form_valid(form)

@method_decorator(login_required, name='dispatch')
class MentorProfileUpdateView(UpdateView):
    """View to update mentor profile."""
    model = CustomUser
    form_class = MentorProfileForm
    template_name = 'mentors_dash/profile_edit.html'
    success_url = reverse_lazy('mentor_dashboard')
    
    def get_object(self):
        return self.request.user
    
    def form_valid(self, form):
        messages.success(self.request, 'Profile updated successfully!')
        return super().form_valid(form)

@login_required
def learner_activity_partial(request):
    """Partial view for learner activity tab content to be loaded with AJAX."""
    if not request.user.is_learner:
        return render(request, 'error.html', {'message': 'Access denied'}, status=403)
    
    # Get bookings and requests for the learner
    from apps.learning_sessions.models import Booking, SessionRequest
    import logging
    from django.urls import reverse
    from django.utils import timezone
    import datetime
    
    # Set up logger for debugging
    logger = logging.getLogger(__name__)
    
    bookings = Booking.objects.filter(
        learner=request.user
    ).select_related('session', 'session__mentor').order_by('-created_at')
    
    session_requests = SessionRequest.objects.filter(
        learner=request.user
    ).select_related('mentor').order_by('-created_at')
    
    # Create activities list for the combined view
    activities = []
    
    # Add bookings to activities
    for booking in bookings:
        # Check if session is confirmed and has started (or is about to start in 15 minutes)
        now = timezone.now()
        is_joinable = False
        
        if booking.status == 'confirmed' and booking.session.schedule:
            time_diff = (booking.session.schedule - now).total_seconds() / 60
            
            # Session is joinable 15 minutes before start time and until session duration after start
            is_joinable = (time_diff <= 15 and time_diff > -booking.session.duration)
            
            # Always consider live sessions as joinable
            if booking.session.status == 'live':
                is_joinable = True
            
            # Is the session today?
            is_today = booking.session.schedule.date() == now.date()
            
            # Can go live checks (for mentors only)
            can_go_live = (booking.session.status == 'scheduled' and 
                          time_diff <= 15 and 
                          time_diff > -booking.session.duration)
            
            # Log session info for debugging
            logger.info(f"Session {booking.session.id} for booking {booking.id}: time_diff={time_diff}, is_joinable={is_joinable}, status={booking.session.status}")
        else:
            is_today = False
            can_go_live = False
            is_joinable = False
        
        # Get display values for prices
        price_display = f"${booking.session.price:.2f}" if booking.session.price else "Free"
        
        # Prepare mentor info
        mentor_name = f"{booking.session.mentor.first_name} {booking.session.mentor.last_name}"
        mentor_image = booking.session.mentor.profile_picture.url if booking.session.mentor.profile_picture else None
        mentor_initials = ''.join([n[0] for n in mentor_name.split() if n])[:2].upper()
        mentor_expertise = booking.session.mentor.expertise or "No expertise listed"
        
        # Set status display and class
        if booking.status == 'confirmed':
            if booking.session.status == 'live':
                status_display = "Live Now!"
                status_class = "bg-red-100 text-red-800"
            elif is_joinable:
                status_display = "Ready to Join"
                status_class = "bg-green-100 text-green-800"
            else:
                status_display = "Confirmed"
                status_class = "bg-blue-100 text-blue-800"
        else:
            status_display = booking.get_status_display()
            status_class = "bg-green-100 text-green-800" if booking.status == 'completed' else \
                          "bg-blue-100 text-blue-800" if booking.status == 'confirmed' else \
                          "bg-yellow-100 text-yellow-800" if booking.status == 'pending' else \
                          "bg-red-100 text-red-800"
        
        # Setup action buttons for the activity
        action_buttons = []
        
        # Join Room button - show for confirmed bookings that are joinable or live
        if booking.status == 'confirmed' and (is_joinable or booking.session.status == 'live'):
            action_buttons.append({
                'type': 'link',
                'url': reverse('sessions:room', kwargs={'room_code': booking.session.room_code}),
                'text': 'Join Room',
                'icon': 'video',
                'border_class': 'border-transparent',
                'bg_class': 'bg-red-600 hover:bg-red-700',
                'text_class': 'text-white',
                'ring_class': 'focus:ring-red-500'
            })
        
        # View Details button
        action_buttons.append({
            'type': 'link',
            'url': reverse('sessions:detail', kwargs={'pk': booking.session.id}),
            'text': 'View Details',
            'icon': 'info',
            'border_class': 'border-gray-300',
            'bg_class': 'bg-white hover:bg-gray-50',
            'text_class': 'text-gray-700',
            'ring_class': 'focus:ring-blue-500'
        })
        
        # Submit Feedback button - for completed sessions without feedback
        if booking.status == 'completed' and not booking.feedback_submitted:
            action_buttons.append({
                'type': 'link',
                'url': reverse('sessions:submit_feedback', kwargs={'booking_id': booking.id}),
                'text': 'Submit Feedback',
                'icon': 'star',
                'border_class': 'border-transparent',
                'bg_class': 'bg-blue-600 hover:bg-blue-700',
                'text_class': 'text-white',
                'ring_class': 'focus:ring-blue-500'
            })
        
        # Cancel Booking button - for confirmed future sessions
        if booking.status == 'confirmed' and booking.session.status == 'scheduled' and time_diff > 0:
            action_buttons.append({
                'type': 'link',
                'url': reverse('sessions:cancel_booking', kwargs={'booking_id': booking.id}),
                'text': 'Cancel',
                'icon': 'x',
                'border_class': 'border-transparent',
                'bg_class': 'bg-gray-600 hover:bg-gray-700',
                'text_class': 'text-white',
                'ring_class': 'focus:ring-gray-500'
            })
        
        activity = {
            'type': 'booking',
            'type_color': 'blue',
            'title': booking.session.title,
            'mentor_name': mentor_name,
            'mentor_image': mentor_image,
            'mentor_initials': mentor_initials,
            'mentor_expertise': mentor_expertise,
            'timestamp': booking.created_at,
            'status_display': status_display,
            'status_class': status_class,
            'description': booking.session.description,
            'can_review': booking.status == 'completed',
            'has_feedback': booking.feedback_submitted,
            'room_code': booking.session.room_code,
            'joinable': is_joinable,
            'is_today': is_today,
            'id': booking.id,
            'booking_id': booking.id,
            'schedule': booking.session.schedule,
            'duration': booking.session.duration,
            'price_label': 'Price',
            'price_display': price_display,
            'action_buttons': action_buttons,
            'upcoming': booking.session.schedule > now if booking.session.schedule else False
        }
        activities.append(activity)
    
    # Add requests to activities
    for session_req in session_requests:
        # Prepare mentor info
        mentor_name = f"{session_req.mentor.first_name} {session_req.mentor.last_name}"
        mentor_image = session_req.mentor.profile_picture.url if session_req.mentor.profile_picture else None
        mentor_initials = ''.join([n[0] for n in mentor_name.split() if n])[:2].upper()
        mentor_expertise = session_req.mentor.expertise or "No expertise listed"
        
        # Set status display and class
        status_display = session_req.get_status_display()
        status_class = "bg-green-100 text-green-800" if session_req.status == 'accepted' else \
                      "bg-blue-100 text-blue-800" if session_req.status == 'counter_offer' else \
                      "bg-yellow-100 text-yellow-800" if session_req.status == 'pending' else \
                      "bg-red-100 text-red-800"
        
        # Setup action buttons for the activity
        action_buttons = []
        
        # Accept Counter Offer button
        if session_req.status == 'counter_offer':
            action_buttons.append({
                'type': 'link',
                'url': reverse('sessions:accept_counter_offer', kwargs={'request_id': session_req.id}),
                'text': 'Accept Counter Offer',
                'icon': 'check',
                'border_class': 'border-transparent',
                'bg_class': 'bg-green-600 hover:bg-green-700',
                'text_class': 'text-white',
                'ring_class': 'focus:ring-green-500'
            })
        
        # Cancel Request button for pending requests
        if session_req.status == 'pending':
            action_buttons.append({
                'type': 'link',
                'url': reverse('sessions:cancel_session_request', kwargs={'request_id': session_req.id}),
                'text': 'Cancel Request',
                'icon': 'x',
                'border_class': 'border-transparent',
                'bg_class': 'bg-gray-600 hover:bg-gray-700',
                'text_class': 'text-white',
                'ring_class': 'focus:ring-gray-500'
            })
        
        price_display = f"${session_req.budget:.2f}" if session_req.budget else "No budget specified"
        
        activity = {
            'type': 'request',
            'type_color': 'indigo',
            'title': session_req.title,
            'mentor_name': mentor_name,
            'mentor_image': mentor_image,
            'mentor_initials': mentor_initials,
            'mentor_expertise': mentor_expertise,
            'timestamp': session_req.created_at,
            'status_display': status_display,
            'status_class': status_class,
            'description': session_req.description,
            'id': session_req.id,
            'price_label': 'Budget',
            'price_display': price_display,
            'action_buttons': action_buttons,
            'upcoming': False
        }
        activities.append(activity)
    
    # Sort activities by timestamp
    activities.sort(key=lambda x: x['timestamp'], reverse=True)
    
    return render(request, 'learners_dash/tabs/activity_partial.html', {
        'activities': activities,
    })

def learner_activity(request):
    """View for learner activity page."""
    if not request.user.is_learner:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    # Get bookings and requests for the learner
    from apps.learning_sessions.models import Booking, SessionRequest
    from django.utils import timezone
    import logging
    
    # Set up logging
    logger = logging.getLogger(__name__)
    
    # Get current time
    now = timezone.now()
    
    # Get all bookings but will filter out expired ones
    all_bookings = Booking.objects.filter(
        learner=request.user
    ).select_related('session', 'session__mentor').order_by('-created_at')
    
    # Filter out expired scheduled sessions (keep completed, cancelled, and active ones)
    valid_bookings = []
    for booking in all_bookings:
        if booking.session.status in ['completed', 'cancelled']:
            # Keep all completed or cancelled sessions
            valid_bookings.append(booking)
        elif booking.session.status == 'scheduled':
            # Check if session has not ended more than 30 minutes ago
            session_end_time = booking.session.schedule + timezone.timedelta(minutes=booking.session.duration)
            if session_end_time > now - timezone.timedelta(minutes=30):
                valid_bookings.append(booking)
        elif booking.session.status == 'live':
            # Keep all live sessions
            valid_bookings.append(booking)
    
    # Use the filtered bookings
    bookings = valid_bookings
    logger.info(f"Found {len(bookings)} valid bookings for learner {request.user.id}")
    
    # Get session requests, limiting to most recent 20
    session_requests = SessionRequest.objects.filter(
        learner=request.user
    ).select_related('mentor').order_by('-created_at')[:20]
    logger.info(f"Found {len(session_requests)} session requests for learner {request.user.id}")
    
    # Create activities list for the combined view
    activities = []
    
    # Add bookings to activities
    for booking in bookings:
        activity = {
            'type': 'booking',
            'type_color': 'green',
            'title': booking.session.title,
            'mentor': booking.session.mentor,
            'timestamp': booking.created_at,
            'status': booking.get_status_display(),
            'status_color': 'green' if booking.status == 'confirmed' else 'gray' if booking.status == 'completed' else 'yellow' if booking.status == 'pending' else 'red',
            'description': booking.session.description,
            'schedule': booking.session.schedule,
            'duration': booking.session.duration,
            'topics': booking.session.topics,
            'price': booking.session.price,
            'payment_status': booking.payment.get_status_display() if hasattr(booking, 'payment') else None,
            'booking_id': booking.id,
            'joinable': booking.status == 'confirmed' and booking.session.status == 'live',
            'can_cancel': booking.status == 'confirmed' and booking.session.status == 'scheduled',
            'can_review': booking.status == 'completed',
            'has_feedback': booking.feedback_submitted,
            'room_code': booking.session.room_code,
        }
        activities.append(activity)
    
    # Add requests to activities
    for session_req in session_requests:
        activity = {
            'type': 'request',
            'type_color': 'indigo',
            'title': session_req.title,
            'mentor': session_req.mentor,
            'timestamp': session_req.created_at,
            'status': session_req.get_status_display(),
            'status_color': 'green' if session_req.status == 'accepted' else 'blue' if session_req.status == 'counter_offer' else 'yellow' if session_req.status == 'pending' else 'red',
            'description': session_req.description,
            'schedule': session_req.proposed_time,
            'duration': session_req.duration,
            'price': session_req.budget,
            'request_id': session_req.id,
            'can_confirm': session_req.status == 'counter_offer'
        }
        activities.append(activity)
    
    # Sort activities by timestamp
    activities.sort(key=lambda x: x['timestamp'], reverse=True)
    
    context = {
        'activities': activities,
        'session_requests': session_requests,
        'bookings': bookings,
        'active_tab': 'activity'
    }
    
    # Use the dashboard template with the activity tab active
    return render(request, 'learners_dash/dashboard.html', context)

@login_required
def mentor_requests(request):
    """View for mentor requests tab."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.learning_sessions.models import SessionRequest
    
    # Get all session requests for this mentor
    requests = SessionRequest.objects.filter(mentor=request.user).order_by('-created_at')
    
    context = {
        'active_tab': 'requests',
        'requests': requests,
    }
    
    return render(request, 'mentors_dash/requests.html', context)

@login_required
def mentor_sessions(request):
    """View for mentor sessions tab with enhanced functionality."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.learning_sessions.models import Session, Booking
    from django.utils import timezone
    from django.db import models
    import logging
    
    # Set up logging
    logger = logging.getLogger(__name__)
    logger.info(f"Loading sessions for mentor: {request.user.username} (ID: {request.user.id})")
    
    # Get today's date and time
    now = timezone.now()
    today = now.date()
    
    # Get current tab from query parameter
    current_tab = request.GET.get('tab', 'today')
    logger.info(f"Current sessions tab: {current_tab}")
    
    try:
        # Fetch all sessions by this mentor with DISTINCT to eliminate duplicates
        # For today's sessions, filter out expired ones and only show active sessions
        now = timezone.now()
        today_sessions = Session.objects.filter(
            mentor=request.user, 
            schedule__date=today,
            schedule__gte=now - timezone.timedelta(minutes=120),
            status__in=['scheduled', 'live']  # Use string literals instead of constants
        ).distinct().order_by('schedule')
        
        # Remove sessions that are "scheduled" but have ended more than 30 minutes ago
        valid_today_sessions = []
        for session in today_sessions:
            session_end_time = session.schedule + timezone.timedelta(minutes=session.duration)
            if (session.status == 'live') or (session.status == 'scheduled' and session_end_time > now - timezone.timedelta(minutes=30)):
                valid_today_sessions.append(session)
        
        today_sessions = valid_today_sessions
        logger.info(f"Found {len(today_sessions)} valid sessions for today")
        
        # Get upcoming sessions
        upcoming_sessions = Session.objects.filter(
            mentor=request.user, 
            schedule__date__gt=today,
            status='scheduled'  # Use string literal
        ).distinct().order_by('schedule')
        logger.info(f"Found {upcoming_sessions.count()} upcoming sessions")
        
        # Get past sessions, but limit to most recent 20
        past_sessions = Session.objects.filter(
            models.Q(mentor=request.user, schedule__date__lt=today) |
            models.Q(mentor=request.user, status__in=['completed', 'cancelled'])  # Use string literals
        ).distinct().order_by('-schedule')[:20]  # Limit to most recent 20 past sessions
        logger.info(f"Found {len(past_sessions)} past sessions (limited to 20)")
        logger.info(f"Found {past_sessions.count()} past sessions")
    
        # Add booking count and go-live status to each session
        for session_list in [today_sessions, upcoming_sessions, past_sessions]:
            for session in session_list:
                # Get confirmed bookings count
                session.confirmed_bookings_count = Booking.objects.filter(
                    session=session, 
                    status='confirmed'  # Use string literal
                ).count()
                
                # We don't need to manually set can_go_live here as it's already a property in the Session model
                # Just ensure the session is loaded with proper related fields
                time_until_session = session.schedule - now
                session_end_time = session.schedule + timezone.timedelta(minutes=session.duration)
                
                # Log the session's can_go_live property for debugging
                logger.info(f"Session {session.id}: can_go_live={session.can_go_live}, is_near_start_time={session.is_near_start_time}")
                
                # Log session details for debugging
                logger.info(f"Session {session.id}: Title={session.title}, Status={session.status}")
                
                # Check if session is currently live
                session.is_live = (session.status == 'live')
                
                # Compute exact time difference for countdown displays
                if session.status == 'scheduled':
                    session.time_until_start = max(time_until_session, timezone.timedelta(0))
                    
                    # Format the remaining time as hours:minutes:seconds
                    total_seconds = int(session.time_until_start.total_seconds())
                    hours, remainder = divmod(total_seconds, 3600)
                    minutes, seconds = divmod(remainder, 60)
                    session.countdown_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                elif session.status == 'live':
                    session.time_since_start = now - session.schedule
                    session.time_remaining = max(timezone.timedelta(minutes=session.duration) - session.time_since_start, 
                                              timezone.timedelta(0))
                    
                    # Format the remaining time as hours:minutes:seconds
                    total_seconds = int(session.time_remaining.total_seconds())
                    hours, remainder = divmod(total_seconds, 3600)
                    minutes, seconds = divmod(remainder, 60)
                    session.countdown_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                
                # Check if session can be edited (more than 5 minutes before start)
                session.can_edit = (
                    session.status == 'scheduled' and 
                    (session.schedule - now) > timezone.timedelta(minutes=5)
                )
                
                # Ensure session has all needed fields for the template
                if not hasattr(session, 'countdown_str'):
                    session.countdown_str = "00:00:00"
                    
                # Session URL for Go Live and Join buttons
                if session.room_code:
                    session.room_url = f"/sessions/room/{session.room_code}/"
                
        # Debug data
        if current_tab == 'today':
            for i, session in enumerate(today_sessions):
                logger.info(f"Today session {i+1}: ID={session.id}, Title={session.title}, Status={session.status}, Can Go Live={session.can_go_live}")
                
    except Exception as e:
        logger.error(f"Error loading sessions: {str(e)}", exc_info=True)
        messages.error(request, f"Error loading sessions. Please try again later.")
        today_sessions = []
        upcoming_sessions = []
        past_sessions = []
    
    context = {
        'active_tab': 'sessions',
        'sub_tab': current_tab,
        'today_sessions': today_sessions,
        'upcoming_sessions': upcoming_sessions,
        'past_sessions': past_sessions,
        'current_time': now.strftime('%Y-%m-%dT%H:%M:%S'),
        'today_date': today.strftime('%Y-%m-%d'),
        'has_any_sessions': bool(today_sessions or upcoming_sessions or past_sessions),
    }
    
    return render(request, 'mentors_dash/sessions.html', context)


@login_required
def mentor_session_detail(request, session_id):
    """View for mentor session detail with enhanced management options."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.learning_sessions.models import Session, Booking
    from apps.notifications.models import Notification
    
    # Get the session
    session = get_object_or_404(Session, id=session_id, mentor=request.user)
    
    # Process actions if any
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'cancel':
            # Cancel the session
            if session.status == Session.SCHEDULED:
                session.status = Session.CANCELLED
                session.save()
                
                # Notify all learners with confirmed bookings
                for booking in session.bookings.filter(status=Booking.CONFIRMED):
                    booking.status = Booking.CANCELLED
                    booking.cancellation_reason = "Session cancelled by mentor"
                    booking.save()
                    
                    Notification.objects.create(
                        user=booking.learner,
                        message=f"Session '{session.title}' has been cancelled by the mentor.",
                        notification_type='session_cancelled',
                        reference_id=session.id,
                        link=f"/dashboard/learner/activity/"
                    )
                
                messages.success(request, 'Session cancelled successfully.')
                return redirect('users:mentor_sessions')
            else:
                messages.error(request, 'Only scheduled sessions can be cancelled.')
        
        elif action == 'publish':
            # Publish the session (make it visible to learners)
            if session.status == Session.SCHEDULED:
                # Make sure session is at least 15 minutes in the future
                if session.schedule > timezone.now() + timezone.timedelta(minutes=15):
                    # Send notifications to potential learners
                    from apps.users.models import CustomUser
                    
                    # In a real implementation, this should be filtered to relevant users
                    # and done through a background task for better performance
                    for learner in CustomUser.objects.filter(role=CustomUser.LEARNER)[:10]:  # Limit to 10 for demo
                        Notification.objects.create(
                            user=learner,
                            message=f"New session available: {session.title}",
                            notification_type='new_session',
                            reference_id=session.id,
                            link=f"/sessions/{session.id}/"
                        )
                    
                    messages.success(request, 'Session published successfully. Notifications sent to potential learners.')
                else:
                    messages.error(request, 'Session must be scheduled at least 15 minutes in the future to publish.')
            else:
                messages.error(request, 'Only scheduled sessions can be published.')
        
        elif action == 'go_live':
            # Go live now - check if it's within the window (≤ 15 minutes before scheduled time)
            time_until_session = session.schedule - timezone.now()
            if session.status == Session.SCHEDULED and time_until_session <= timezone.timedelta(minutes=15):
                session.status = Session.LIVE
                session.save()
                
                # Notify all confirmed attendees
                for booking in session.bookings.filter(status=Booking.CONFIRMED):
                    Notification.objects.create(
                        user=booking.learner,
                        message=f"Session '{session.title}' is now live! Join now.",
                        notification_type='session_live',
                        reference_id=session.id,
                        link=f"/session/{session.room_code}/"
                    )
                
                # Redirect to the session room
                return redirect('learning_sessions:room', room_code=session.room_code)
            else:
                messages.error(request, 'Session can only go live within 15 minutes of scheduled time.')
        
        # Refresh the session after actions
        session = Session.objects.get(id=session_id)
    
    # Get bookings for this session
    bookings = Booking.objects.filter(session=session).select_related('learner')
    
    # Determine if session can go live (≤ 15 minutes before scheduled time)
    can_go_live = (
        session.status == Session.SCHEDULED and 
        session.schedule - timezone.now() <= timezone.timedelta(minutes=15) and
        session.schedule - timezone.now() > timezone.timedelta(minutes=-session.duration)
    )
    
    context = {
        'active_tab': 'sessions',
        'session': session,
        'bookings': bookings,
        'can_go_live': can_go_live,
        'is_upcoming': session.schedule > timezone.now(),
    }
    
    return render(request, 'mentors_dash/session_detail.html', context)

@login_required
def mentor_create_session(request):
    """
    View for mentor create session tab.
    Now redirects to the advanced session creation page as per user request.
    """
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    # Always redirect to the advanced session creation page
    return redirect('users:mentor_create_advanced_session')


@login_required
def mentor_session_edit(request, session_id):
    """View for editing an existing session with enhanced UX."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.learning_sessions.models import Session
    from apps.learning_sessions.forms import SessionForm
    
    # Get the session
    session = get_object_or_404(Session, id=session_id, mentor=request.user)
    
    # Check if session is editable
    if session.status in [Session.LIVE, Session.COMPLETED, Session.CANCELLED]:
        messages.error(request, f'Sessions that are {session.get_status_display().lower()} cannot be edited.')
        return redirect('users:mentor_session_detail', session_id=session.id)
        
    if request.method == 'POST':
        form = SessionForm(request.POST, instance=session)
        if form.is_valid():
            # Save the form but don't commit yet
            updated_session = form.save(commit=False)
            
            # Any additional processing or validation can go here
            
            # Save the session
            updated_session.save()
            
            # For many-to-many fields like topics
            form.save_m2m()
            
            messages.success(request, 'Session updated successfully.')
            return redirect('users:mentor_session_detail', session_id=session.id)
    else:
        form = SessionForm(instance=session)
    
    context = {
        'active_tab': 'sessions',
        'form': form,
        'session': session,
        'is_edit_mode': True
    }
    
    return render(request, 'mentors_dash/session_edit.html', context)

@login_required
def mentor_create_advanced_session(request):
    """View for advanced mentor create session page with step-by-step UI."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.learning_sessions.forms import SessionForm
    from apps.learning_sessions.models import Session
    from apps.notifications.models import Notification
    import uuid
    
    if request.method == 'POST':
        form = SessionForm(request.POST, request.FILES)
        is_free = request.POST.get('is_free') == 'true'
        
        if form.is_valid():
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
            Notification.objects.create(
                user=request.user,
                title='Session Created',
                message=f'Your session "{session.title}" has been created successfully.',
                notification_type='session_created',
                reference_id=session.id
            )
            
            messages.success(request, 'Session created successfully!')
            return redirect('users:mentor_sessions')
    else:
        form = SessionForm()
    
    context = {
        'active_tab': 'create_session',
        'form': form,
    }
    
    return render(request, 'mentors_dash/advanced_create_session.html', context)

@login_required
def mentor_earnings(request):
    """View for mentor earnings tab."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.payments.models import Payment, MentorPayout
    from django.db.models import Sum
    from django.utils import timezone
    import datetime
    
    # Get start of current month
    today = timezone.now()
    month_start = datetime.date(today.year, today.month, 1)
    
    # Fetch payment data for charts
    monthly_earnings = Payment.objects.filter(
        booking__session__mentor=request.user,
        status='completed',
        created_at__gte=month_start
    ).aggregate(Sum('amount'))['amount__sum'] or 0
    
    # Get payment history
    payments = Payment.objects.filter(
        booking__session__mentor=request.user,
        status='completed'
    ).order_by('-created_at')
    
    # Get payout history
    payouts = MentorPayout.objects.filter(
        mentor=request.user
    ).order_by('-created_at')
    
    context = {
        'active_tab': 'earnings',
        'monthly_earnings': monthly_earnings,
        'payments': payments,
        'payouts': payouts,
    }
    
    return render(request, 'mentors_dash/earnings.html', context)

@login_required
def mentor_profile(request):
    """View for mentor profile tab."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    context = {
        'active_tab': 'profile',
        'user': request.user,
    }
    
    return render(request, 'mentors_dash/profile.html', context)
