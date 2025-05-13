"""
Views for the admin panel.
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils.decorators import method_decorator
from django.views.generic import ListView, DetailView, UpdateView, DeleteView
from django.http import JsonResponse, HttpResponseForbidden
from django.db.models import Count, Sum, Avg, Q
from django.utils import timezone
from django.urls import reverse_lazy
from django.core.paginator import Paginator

from apps.users.models import CustomUser, UserRating
from apps.learning_sessions.models import Session, Booking, SessionRequest
from apps.payments.models import Payment, MentorPayout
from apps.notifications.models import Notification

def admin_required(view_func):
    """
    Decorator for views that checks if the user is an admin.
    """
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            messages.error(request, "Please log in to access this page.")
            return redirect('users:login')
        
        if not request.user.is_admin_user and not request.user.is_staff:
            messages.error(request, "You don't have permission to access this page.")
            return redirect('home')
        
        return view_func(request, *args, **kwargs)
    
    return wrapper

@admin_required
def admin_overview(request):
    """Admin dashboard overview."""
    # User statistics
    total_users = CustomUser.objects.count()
    total_learners = CustomUser.objects.filter(role=CustomUser.LEARNER).count()
    total_mentors = CustomUser.objects.filter(role=CustomUser.MENTOR).count()
    
    # Session statistics
    total_sessions = Session.objects.count()
    live_sessions = Session.objects.filter(status=Session.LIVE).count()
    completed_sessions = Session.objects.filter(status=Session.COMPLETED).count()
    
    # Booking statistics
    total_bookings = Booking.objects.count()
    confirmed_bookings = Booking.objects.filter(status=Booking.CONFIRMED).count()
    
    # Payment statistics
    total_payments = Payment.objects.filter(status=Payment.PAID).count()
    total_revenue = Payment.objects.filter(status=Payment.PAID).aggregate(Sum('amount'))['amount__sum'] or 0
    platform_revenue = Payment.objects.filter(status=Payment.PAID).aggregate(Sum('platform_fee'))['platform_fee__sum'] or 0
    
    # Recent activities
    recent_sessions = Session.objects.order_by('-created_at')[:5]
    recent_bookings = Booking.objects.order_by('-created_at')[:5]
    recent_payments = Payment.objects.order_by('-created_at')[:5]
    
    # Online users (approximation based on last login in the past hour)
    hour_ago = timezone.now() - timezone.timedelta(hours=1)
    online_users = CustomUser.objects.filter(last_login__gte=hour_ago).count()
    
    context = {
        'total_users': total_users,
        'total_learners': total_learners,
        'total_mentors': total_mentors,
        'total_sessions': total_sessions,
        'live_sessions': live_sessions,
        'completed_sessions': completed_sessions,
        'total_bookings': total_bookings,
        'confirmed_bookings': confirmed_bookings,
        'total_payments': total_payments,
        'total_revenue': total_revenue,
        'platform_revenue': platform_revenue,
        'recent_sessions': recent_sessions,
        'recent_bookings': recent_bookings,
        'recent_payments': recent_payments,
        'online_users': online_users,
    }
    
    return render(request, 'admin_dash/overview.html', context)

@admin_required
def admin_users(request):
    """Admin users management."""
    # Get filter parameters
    role = request.GET.get('role', '')
    status = request.GET.get('status', '')
    search = request.GET.get('search', '')
    
    # Filter users
    users = CustomUser.objects.all()
    
    if role:
        users = users.filter(role=role)
    
    if status == 'active':
        users = users.filter(is_active=True)
    elif status == 'inactive':
        users = users.filter(is_active=False)
    
    if search:
        users = users.filter(
            Q(username__icontains=search) | 
            Q(first_name__icontains=search) | 
            Q(last_name__icontains=search) | 
            Q(email__icontains=search)
        )
    
    # Paginate results
    paginator = Paginator(users.order_by('-date_joined'), 20)
    page_number = request.GET.get('page', 1)
    users_page = paginator.get_page(page_number)
    
    context = {
        'users': users_page,
        'role': role,
        'status': status,
        'search': search,
    }
    
    return render(request, 'admin_dash/users.html', context)

@admin_required
def admin_user_detail(request, user_id):
    """Admin user detail view."""
    user = get_object_or_404(CustomUser, id=user_id)
    
    # Get user statistics
    if user.is_learner:
        bookings = Booking.objects.filter(learner=user)
        bookings_count = bookings.count()
        
        # Session requests
        requests = SessionRequest.objects.filter(learner=user)
        requests_count = requests.count()
        
        # Payments
        payments = Payment.objects.filter(booking__learner=user)
        total_spent = payments.filter(status=Payment.PAID).aggregate(Sum('amount'))['amount__sum'] or 0
        
        context = {
            'user': user,
            'bookings': bookings[:5],
            'bookings_count': bookings_count,
            'requests': requests[:5],
            'requests_count': requests_count,
            'total_spent': total_spent,
        }
    
    elif user.is_mentor:
        # Sessions
        sessions = Session.objects.filter(mentor=user)
        sessions_count = sessions.count()
        
        # Session requests
        requests = SessionRequest.objects.filter(mentor=user)
        requests_count = requests.count()
        
        # Bookings for sessions
        bookings = Booking.objects.filter(session__mentor=user)
        bookings_count = bookings.count()
        
        # Payments
        payments = Payment.objects.filter(booking__session__mentor=user)
        total_earned = payments.filter(status=Payment.PAID).aggregate(Sum('mentor_share'))['mentor_share__sum'] or 0
        
        # Ratings
        ratings = UserRating.objects.filter(mentor=user)
        avg_rating = ratings.aggregate(Avg('rating'))['rating__avg'] or 0
        
        context = {
            'user': user,
            'sessions': sessions[:5],
            'sessions_count': sessions_count,
            'requests': requests[:5],
            'requests_count': requests_count,
            'bookings': bookings[:5],
            'bookings_count': bookings_count,
            'total_earned': total_earned,
            'avg_rating': avg_rating,
            'ratings_count': ratings.count(),
        }
    
    else:  # Admin user
        context = {
            'user': user,
        }
    
    return render(request, 'admin_dash/user_detail.html', context)

@admin_required
def admin_toggle_user_status(request, user_id):
    """Toggle user active status."""
    if request.method == 'POST':
        user = get_object_or_404(CustomUser, id=user_id)
        
        # Don't allow deactivating the current admin
        if user == request.user:
            messages.error(request, "You cannot deactivate your own account.")
            return redirect('admin_panel:user_detail', user_id=user_id)
        
        user.is_active = not user.is_active
        user.save()
        
        status = "activated" if user.is_active else "deactivated"
        messages.success(request, f"User {user.username} has been {status}.")
        
        return redirect('admin_panel:user_detail', user_id=user_id)
    
    return redirect('admin_panel:users')

@admin_required
def admin_sessions(request):
    """Admin sessions management."""
    # Get filter parameters
    status = request.GET.get('status', '')
    search = request.GET.get('search', '')
    
    # Filter sessions
    sessions = Session.objects.all()
    
    if status:
        sessions = sessions.filter(status=status)
    
    if search:
        sessions = sessions.filter(
            Q(title__icontains=search) | 
            Q(description__icontains=search) | 
            Q(mentor__username__icontains=search)
        )
    
    # Paginate results
    paginator = Paginator(sessions.order_by('-created_at'), 20)
    page_number = request.GET.get('page', 1)
    sessions_page = paginator.get_page(page_number)
    
    context = {
        'sessions': sessions_page,
        'status': status,
        'search': search,
    }
    
    return render(request, 'admin_dash/sessions.html', context)

@admin_required
def admin_session_detail(request, session_id):
    """Admin session detail view."""
    session = get_object_or_404(Session, id=session_id)
    
    # Get bookings for this session
    bookings = Booking.objects.filter(session=session)
    
    # Get payments for these bookings
    payments = Payment.objects.filter(booking__in=bookings)
    
    context = {
        'session': session,
        'bookings': bookings,
        'payments': payments,
    }
    
    return render(request, 'admin_dash/session_detail.html', context)

@admin_required
def admin_payments(request):
    """Admin payments management."""
    # Get filter parameters
    status = request.GET.get('status', '')
    search = request.GET.get('search', '')
    
    # Filter payments
    payments = Payment.objects.all()
    
    if status:
        payments = payments.filter(status=status)
    
    if search:
        payments = payments.filter(
            Q(booking__session__title__icontains=search) | 
            Q(booking__learner__username__icontains=search) | 
            Q(booking__session__mentor__username__icontains=search) |
            Q(razorpay_order_id__icontains=search) |
            Q(razorpay_payment_id__icontains=search)
        )
    
    # Paginate results
    paginator = Paginator(payments.order_by('-created_at'), 20)
    page_number = request.GET.get('page', 1)
    payments_page = paginator.get_page(page_number)
    
    # Calculate totals
    total_paid = payments.filter(status=Payment.PAID).aggregate(Sum('amount'))['amount__sum'] or 0
    platform_revenue = payments.filter(status=Payment.PAID).aggregate(Sum('platform_fee'))['platform_fee__sum'] or 0
    mentor_revenue = payments.filter(status=Payment.PAID).aggregate(Sum('mentor_share'))['mentor_share__sum'] or 0
    
    context = {
        'payments': payments_page,
        'status': status,
        'search': search,
        'total_paid': total_paid,
        'platform_revenue': platform_revenue,
        'mentor_revenue': mentor_revenue,
    }
    
    return render(request, 'admin_dash/payments.html', context)

@admin_required
def admin_feedback(request):
    """Admin feedback management."""
    # Get filter parameters
    rating = request.GET.get('rating', '')
    search = request.GET.get('search', '')
    
    # Filter ratings
    ratings = UserRating.objects.all()
    
    if rating:
        try:
            rating_value = int(rating)
            ratings = ratings.filter(rating=rating_value)
        except ValueError:
            pass
    
    if search:
        ratings = ratings.filter(
            Q(mentor__username__icontains=search) | 
            Q(learner__username__icontains=search) | 
            Q(review__icontains=search)
        )
    
    # Paginate results
    paginator = Paginator(ratings.order_by('-created_at'), 20)
    page_number = request.GET.get('page', 1)
    ratings_page = paginator.get_page(page_number)
    
    # Calculate average rating
    avg_rating = ratings.aggregate(Avg('rating'))['rating__avg'] or 0
    
    context = {
        'ratings': ratings_page,
        'rating_filter': rating,
        'search': search,
        'avg_rating': avg_rating,
    }
    
    return render(request, 'admin_dash/feedback.html', context)

@admin_required
def admin_delete_rating(request, rating_id):
    """Admin delete inappropriate rating."""
    if request.method == 'POST':
        rating = get_object_or_404(UserRating, id=rating_id)
        rating.delete()
        messages.success(request, "Rating has been deleted successfully.")
        return redirect('admin_panel:feedback')
    
    return redirect('admin_panel:feedback')

@admin_required
def admin_create_payout(request):
    """Create mentor payouts."""
    if request.method == 'POST':
        mentor_ids = request.POST.getlist('mentor_ids')
        
        for mentor_id in mentor_ids:
            try:
                mentor = CustomUser.objects.get(id=mentor_id, role=CustomUser.MENTOR)
                
                # Get unpaid payments
                payments = Payment.objects.filter(
                    booking__session__mentor=mentor,
                    status=Payment.PAID
                ).exclude(
                    payouts__isnull=False
                )
                
                # Calculate total amount
                total_amount = payments.aggregate(Sum('mentor_share'))['mentor_share__sum'] or 0
                
                if total_amount > 0:
                    # Create payout
                    payout = MentorPayout.objects.create(
                        mentor=mentor,
                        amount=total_amount,
                        status=MentorPayout.PENDING,
                        notes=f"Created by admin {request.user.username}"
                    )
                    
                    # Associate payments with this payout
                    payout.payments.set(payments)
                    
                    # Notify mentor
                    Notification.objects.create(
                        user=mentor,
                        message=f"A payout of {total_amount} has been initiated.",
                        link="/dashboard/mentor/earnings/"
                    )
                    
                    messages.success(request, f"Payout created for {mentor.username} with amount {total_amount}.")
                else:
                    messages.warning(request, f"No pending payments for {mentor.username}.")
            
            except CustomUser.DoesNotExist:
                messages.error(request, f"Mentor with ID {mentor_id} not found.")
        
        return redirect('admin_panel:payments')
    
    # Get mentors with pending payments
    mentors_with_payments = CustomUser.objects.filter(
        role=CustomUser.MENTOR,
        session__booking__payment__status=Payment.PAID
    ).exclude(
        session__booking__payment__payouts__isnull=False
    ).distinct()
    
    mentor_data = []
    for mentor in mentors_with_payments:
        # Calculate pending amount
        pending_payments = Payment.objects.filter(
            booking__session__mentor=mentor,
            status=Payment.PAID
        ).exclude(
            payouts__isnull=False
        )
        
        pending_amount = pending_payments.aggregate(Sum('mentor_share'))['mentor_share__sum'] or 0
        
        if pending_amount > 0:
            mentor_data.append({
                'mentor': mentor,
                'pending_amount': pending_amount,
                'payments_count': pending_payments.count()
            })
    
    context = {
        'mentor_data': mentor_data
    }
    
    return render(request, 'admin_dash/create_payout.html', context)

@admin_required
def admin_mark_payout_complete(request, payout_id):
    """Mark a payout as completed."""
    if request.method == 'POST':
        payout = get_object_or_404(MentorPayout, id=payout_id)
        
        payout.status = MentorPayout.COMPLETED
        payout.processed_at = timezone.now()
        payout.notes = f"{payout.notes}\nCompleted by admin {request.user.username} on {timezone.now().strftime('%Y-%m-%d %H:%M')}"
        payout.save()
        
        # Notify mentor
        Notification.objects.create(
            user=payout.mentor,
            message=f"Your payout of {payout.amount} has been completed.",
            link="/dashboard/mentor/earnings/"
        )
        
        messages.success(request, f"Payout for {payout.mentor.username} marked as completed.")
        return redirect('admin_panel:payments')
    
    return redirect('admin_panel:payments')
