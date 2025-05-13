"""
Views for user authentication, registration and profile management.
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.views.generic import ListView, DetailView, UpdateView
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.contrib import messages
from django.http import HttpResponseRedirect, JsonResponse, HttpResponse
import json

from .models import CustomUser, UserRating
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
        context['upcoming_sessions'] = mentor.session_set.filter(
            status__in=['scheduled', 'live']
        ).order_by('schedule')
        
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
    from django.db.models import Avg, Count, Q
    
    # Get all mentors with high ratings (4+ stars)
    top_rated = CustomUser.objects.filter(
        is_mentor=True,
        is_active=True,
        ratings__rating__gte=4  # Only consider high ratings
    ).annotate(
        avg_rating=Avg('ratings__rating'),
        rating_count=Count('ratings')
    ).filter(
        rating_count__gte=3  # At least 3 ratings
    ).order_by('-avg_rating')[:limit]
    
    # If we don't have enough top rated mentors, fill with recently active mentors
    if top_rated.count() < limit:
        additional_needed = limit - top_rated.count()
        
        # Get mentors who aren't already in top_rated
        existing_ids = [mentor.id for mentor in top_rated]
        active_mentors = CustomUser.objects.filter(
            is_mentor=True, 
            is_active=True
        ).exclude(
            id__in=existing_ids
        ).annotate(
            session_count=Count('session')
        ).order_by('-session_count')[:additional_needed]
        
        # Combine both querysets
        top_rated = list(top_rated) + list(active_mentors)
    
    return top_rated

def learner_dashboard(request):
    """View for learner dashboard with tab navigation support."""
    if not request.user.is_learner:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    # Get active tab from query parameter, default to 'home'
    active_tab = request.GET.get('tab', 'home')
    
    # Validate active tab value
    valid_tabs = ['home', 'activity', 'mentors', 'notifications', 'profile']
    if active_tab not in valid_tabs:
        active_tab = 'home'
    
    # Get ML-based recommendations
    from apps.learning_sessions.models import Session, Booking, SessionRequest
    from django.db.models import Q, Count, Avg, F, ExpressionWrapper, fields
    from django.utils import timezone
    import json
    
    now = timezone.now()
    
    # Recommended sessions based on the learner's interests and career goal
    recommended_sessions = []
    trending_sessions = []
    
    # Try to fetch personalized recommendations
    if hasattr(request.user, 'interests') and request.user.interests:
        # Convert interests string to list if stored as JSON string
        user_interests = request.user.interests if isinstance(request.user.interests, list) else json.loads(request.user.interests or '[]')
        
        if user_interests:
            # Get upcoming sessions related to user interests or career goals
            time_filter = now - timezone.timedelta(hours=1)  # Include recently started sessions too
            interest_filter = Q(topics__overlap=user_interests) | Q(title__icontains=request.user.career_goal) | Q(description__icontains=request.user.career_goal)
            status_filter = Q(status='scheduled') | Q(status='live')
            
            # Combined filter to avoid positional/keyword argument mixing
            combined_filter = status_filter & Q(schedule__gte=time_filter) & interest_filter
            
            recommended_sessions = Session.objects.filter(combined_filter).distinct().order_by('schedule')[:6]
    
    # If no personalized recommendations, get trending sessions
    if not recommended_sessions:
        # Get trending sessions by number of bookings
        time_filter = now - timezone.timedelta(hours=1)
        status_filter = Q(status='scheduled') | Q(status='live')
        
        # Combined filter to avoid positional/keyword argument mixing
        combined_filter = status_filter & Q(schedule__gte=time_filter)
        
        trending_sessions = Session.objects.filter(combined_filter).annotate(
            booking_count=Count('bookings')
        ).order_by('-booking_count')[:6]
    
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
    
    # Add bookings to activities
    bookings = Booking.objects.filter(
        learner=request.user
    ).select_related('session', 'session__mentor').order_by('-created_at')[:10]
    
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
    
    for request in session_requests:
        activity = {
            'type': 'request',
            'type_color': 'indigo',
            'title': request.title,
            'mentor': request.mentor,
            'timestamp': request.created_at,
            'status': request.get_status_display(),
            'status_color': 'green' if request.status == 'accepted' else 'blue' if request.status == 'counter_offer' else 'yellow' if request.status == 'pending' else 'red',
            'description': request.description,
            'schedule': request.proposed_time,
            'duration': request.duration,
            'price': request.budget,
            'request_id': request.id,
            'can_confirm': request.status == 'counter_offer'
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
    
    # Get top mentors for recommendations
    top_mentors = get_top_mentors(request.user, 6)
    
    context = {
        'recommended_sessions': recommended_sessions,
        'trending_sessions': trending_sessions,
        'activities': activities,
        'session_requests': session_requests,
        'bookings': bookings,
        'top_mentors': top_mentors,
        'active_tab': active_tab, 
        'unread_notifications_count': unread_notifications_count,
        'now': now  # Pass current time for countdown timers
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
        activity = {
            'type': 'booking',
            'type_color': 'blue',
            'title': booking.session.title,
            'mentor': booking.session.mentor,
            'timestamp': booking.created_at,
            'status': booking.get_status_display(),
            'status_color': 'green' if booking.status == 'completed' else 'blue' if booking.status == 'confirmed' else 'yellow' if booking.status == 'pending' else 'red',
            'description': booking.session.description,
            'can_review': booking.status == 'completed',
            'has_feedback': booking.feedback_submitted,
            'room_code': booking.session.room_code,
            'id': booking.id
        }
        activities.append(activity)
    
    # Add requests to activities
    for request in session_requests:
        activity = {
            'type': 'request',
            'type_color': 'indigo',
            'title': request.title,
            'mentor': request.mentor,
            'timestamp': request.created_at,
            'status': request.get_status_display(),
            'status_color': 'green' if request.status == 'accepted' else 'blue' if request.status == 'counter_offer' else 'yellow' if request.status == 'pending' else 'red',
            'description': request.description,
            'id': request.id
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
    for request in session_requests:
        activity = {
            'type': 'request',
            'type_color': 'indigo',
            'title': request.title,
            'mentor': request.mentor,
            'timestamp': request.created_at,
            'status': request.get_status_display(),
            'status_color': 'green' if request.status == 'accepted' else 'blue' if request.status == 'counter_offer' else 'yellow' if request.status == 'pending' else 'red',
            'description': request.description,
            'schedule': request.proposed_time,
            'duration': request.duration,
            'price': request.budget,
            'request_id': request.id,
            'can_confirm': request.status == 'counter_offer'
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
    """View for mentor sessions tab."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.learning_sessions.models import Session
    from django.utils import timezone
    
    # Get today's date
    today = timezone.now().date()
    
    # Fetch all sessions by this mentor
    today_sessions = Session.objects.filter(
        mentor=request.user, 
        schedule__date=today
    ).order_by('schedule')
    
    upcoming_sessions = Session.objects.filter(
        mentor=request.user, 
        schedule__date__gt=today
    ).order_by('schedule')
    
    past_sessions = Session.objects.filter(
        mentor=request.user, 
        schedule__date__lt=today
    ).order_by('-schedule')
    
    context = {
        'active_tab': 'sessions',
        'sub_tab': request.GET.get('tab', 'today'),
        'today_sessions': today_sessions,
        'upcoming_sessions': upcoming_sessions,
        'past_sessions': past_sessions,
    }
    
    return render(request, 'mentors_dash/sessions.html', context)

@login_required
def mentor_create_session(request):
    """View for mentor create session tab."""
    if not request.user.is_mentor:
        messages.error(request, 'Access denied.')
        return redirect(request.user.get_dashboard_url())
    
    from apps.learning_sessions.forms import SessionForm
    from apps.learning_sessions.models import Session
    import uuid
    
    if request.method == 'POST':
        form = SessionForm(request.POST, request.FILES)
        if form.is_valid():
            # Create the session but don't save it yet
            session = form.save(commit=False)
            session.mentor = request.user
            session.status = 'scheduled'
            session.room_code = str(uuid.uuid4())
            
            # Handle topics JSON field
            topics_str = form.cleaned_data.get('topics', '')
            session.topics = [topic.strip() for topic in topics_str.split(',') if topic.strip()]
            
            session.save()
            
            messages.success(request, 'Session created successfully!')
            return redirect('users:mentor_sessions')
    else:
        form = SessionForm()
    
    context = {
        'active_tab': 'create_session',
        'form': form,
    }
    
    return render(request, 'mentors_dash/create_session.html', context)

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
