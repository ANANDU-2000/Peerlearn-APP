"""
Views for payment processing and tracking.
"""

import json
import razorpay
from decimal import Decimal

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.http import JsonResponse, HttpResponse
from django.conf import settings
from django.contrib import messages
from django.db import transaction
from django.utils import timezone

from .models import Payment, MentorPayout
from apps.learning_sessions.models import Booking, Session
from apps.notifications.models import Notification

# Initialize Razorpay client
client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

@login_required
def payment_create(request, booking_id):
    """View to create a payment for a booking."""
    booking = get_object_or_404(
        Booking,
        id=booking_id,
        learner=request.user,
        status=Booking.PENDING
    )
    
    # Check if payment already exists
    if hasattr(booking, 'payment'):
        return redirect('payment_detail', payment_id=booking.payment.id)
    
    # Create Razorpay order
    amount = int(booking.session.price * 100)  # Amount in paise
    currency = 'INR'
    
    try:
        order_data = {
            'amount': amount,
            'currency': currency,
            'receipt': f'booking_{booking.id}',
            'payment_capture': 1,  # Auto-capture
            'notes': {
                'booking_id': booking.id,
                'session_title': booking.session.title,
                'mentor': booking.session.mentor.username,
            }
        }
        
        order = client.order.create(data=order_data)
        
        # Create Payment object
        payment = Payment.objects.create(
            booking=booking,
            amount=booking.session.price,
            razorpay_order_id=order['id'],
            status=Payment.INITIATED,
            currency=currency
        )
        
        # Prepare context for payment page
        context = {
            'booking': booking,
            'payment': payment,
            'razorpay_key_id': settings.RAZORPAY_KEY_ID,
            'razorpay_order_id': order['id'],
            'amount': amount,
            'currency': currency,
            'callback_url': request.build_absolute_uri('/payments/webhook/'),
            'name': 'PeerLearn',
            'description': f'Payment for {booking.session.title}',
            'prefill': {
                'name': request.user.get_full_name() or request.user.username,
                'email': request.user.email,
                'contact': request.user.phone_number or '',
            }
        }
        
        return render(request, 'payments/checkout.html', context)
    
    except Exception as e:
        messages.error(request, f'Error creating payment: {str(e)}')
        return redirect('sessions:detail', pk=booking.session.id)

@login_required
def payment_detail(request, payment_id):
    """View to show payment details."""
    payment = get_object_or_404(Payment, id=payment_id)
    
    # Check if user is authorized to view this payment
    if payment.booking.learner != request.user and payment.booking.session.mentor != request.user:
        messages.error(request, 'You do not have permission to view this payment.')
        return redirect('home')
    
    return render(request, 'payments/detail.html', {
        'payment': payment
    })

@csrf_exempt
@require_POST
def payment_webhook(request):
    """Webhook endpoint for Razorpay payment events."""
    try:
        # Get webhook data
        webhook_data = json.loads(request.body)
        payment_id = webhook_data.get('payload', {}).get('payment', {}).get('entity', {}).get('id')
        order_id = webhook_data.get('payload', {}).get('payment', {}).get('entity', {}).get('order_id')
        
        if not payment_id or not order_id:
            return HttpResponse(status=400)
        
        # Get payment by order ID
        try:
            payment = Payment.objects.get(razorpay_order_id=order_id)
        except Payment.DoesNotExist:
            return HttpResponse(status=404)
        
        # Process webhook based on event
        event = webhook_data.get('event')
        
        if event == 'payment.authorized':
            # Payment successful, update status
            with transaction.atomic():
                payment.status = Payment.PAID
                payment.razorpay_payment_id = payment_id
                payment.save()
                
                # Update booking status
                booking = payment.booking
                booking.status = Booking.CONFIRMED
                booking.save()
                
                # Notify mentor
                Notification.objects.create(
                    user=booking.session.mentor,
                    message=f"New booking for '{booking.session.title}' has been confirmed!",
                    link=f"/dashboard/mentor/"
                )
        
        elif event == 'payment.failed':
            # Payment failed
            payment.status = Payment.FAILED
            payment.razorpay_payment_id = payment_id
            payment.save()
            
            # Notify learner
            Notification.objects.create(
                user=payment.booking.learner,
                message=f"Payment for '{payment.booking.session.title}' has failed. Please try again.",
                link=f"/sessions/{payment.booking.session.id}/"
            )
        
        return HttpResponse(status=200)
    
    except Exception as e:
        # Log the error
        print(f"Webhook error: {str(e)}")
        return HttpResponse(status=500)

@login_required
def payment_success(request, payment_id):
    """View for successful payment callback."""
    payment = get_object_or_404(Payment, id=payment_id, booking__learner=request.user)
    
    # Verify the payment status
    try:
        razorpay_payment = client.payment.fetch(payment.razorpay_payment_id)
        
        if razorpay_payment['status'] == 'captured':
            # Payment successful, update status if not already updated by webhook
            if payment.status != Payment.PAID:
                with transaction.atomic():
                    payment.status = Payment.PAID
                    payment.save()
                    
                    # Update booking status
                    booking = payment.booking
                    booking.status = Booking.CONFIRMED
                    booking.save()
                    
                    # Import the improved notification utility
                    from apps.notifications.utils import send_notification_to_user, send_notification_to_multiple_users
                    
                    # Get more detailed session information for notifications
                    session_title = booking.session.title
                    session_date = booking.session.schedule.strftime('%b %d, %Y at %I:%M %p')
                    learner_name = booking.learner.get_full_name() or booking.learner.username
                    mentor_name = booking.session.mentor.get_full_name() or booking.session.mentor.username
                    
                    # Notify mentor with detailed information about the payment and booking
                    send_notification_to_user(
                        user_id=booking.session.mentor.id,
                        title="Payment Received for Booking",
                        message=f"{learner_name} has completed payment for your session '{session_title}' scheduled on {session_date}. The booking is now confirmed!",
                        notification_type="success",
                        reference_id=booking.id
                    )
                    
                    # Also send a confirmation to the learner with session details
                    send_notification_to_user(
                        user_id=booking.learner.id,
                        title="Payment Successful",
                        message=f"Your payment for '{session_title}' with {mentor_name} is successful. The session is confirmed for {session_date}. We've sent you a calendar invite to your email.",
                        notification_type="success",
                        reference_id=booking.id
                    )
            
            messages.success(request, 'Payment successful! Your booking is confirmed.')
            return redirect('sessions:detail', pk=payment.booking.session.id)
        else:
            messages.error(request, 'Payment was not completed. Please try again.')
            return redirect('payment_create', booking_id=payment.booking.id)
    
    except Exception as e:
        messages.error(request, f'Error verifying payment: {str(e)}')
        return redirect('payment_create', booking_id=payment.booking.id)

@login_required
def initiate_refund(request, payment_id):
    """View for admin to initiate a refund."""
    payment = get_object_or_404(Payment, id=payment_id)
    
    # Check if user is an admin
    if not request.user.is_admin_user and not request.user.is_staff:
        messages.error(request, 'Only administrators can initiate refunds.')
        return redirect('home')
    
    if request.method == 'POST':
        reason = request.POST.get('reason', '')
        
        if not reason:
            messages.error(request, 'Please provide a reason for the refund.')
            return redirect('payment_detail', payment_id=payment.id)
        
        try:
            # Initiate refund in Razorpay
            refund = client.payment.refund(payment.razorpay_payment_id, {
                'amount': int(payment.amount * 100),  # Amount in paise
                'notes': {
                    'reason': reason,
                    'refunded_by': request.user.username,
                }
            })
            
            # Update payment status
            payment.status = Payment.REFUNDED
            payment.refund_reason = reason
            payment.save()
            
            # Update booking status
            booking = payment.booking
            booking.status = Booking.CANCELLED
            booking.cancellation_reason = f"Refunded by admin: {reason}"
            booking.save()
            
            # Notify learner and mentor
            Notification.objects.create(
                user=booking.learner,
                message=f"Your payment for '{booking.session.title}' has been refunded.",
                link=f"/dashboard/learner/activity/"
            )
            
            Notification.objects.create(
                user=booking.session.mentor,
                message=f"Booking for '{booking.session.title}' has been refunded and cancelled.",
                link=f"/dashboard/mentor/"
            )
            
            messages.success(request, 'Refund initiated successfully.')
            return redirect('payment_detail', payment_id=payment.id)
        
        except Exception as e:
            messages.error(request, f'Error initiating refund: {str(e)}')
            return redirect('payment_detail', payment_id=payment.id)
    
    return render(request, 'payments/refund.html', {
        'payment': payment
    })

@login_required
def mentor_earnings(request):
    """View for mentors to see their earnings."""
    if not request.user.is_mentor:
        messages.error(request, 'Only mentors can view earnings.')
        return redirect('home')
    
    # Get all successful payments for the mentor's sessions
    payments = Payment.objects.filter(
        booking__session__mentor=request.user,
        status=Payment.PAID
    ).order_by('-created_at')
    
    # Calculate total earnings
    total_earnings = sum(payment.mentor_share or 0 for payment in payments)
    
    # Get payouts
    payouts = MentorPayout.objects.filter(mentor=request.user).order_by('-created_at')
    
    # Calculate pending amount (not yet paid out)
    paid_amount = sum(payout.amount for payout in payouts if payout.status == MentorPayout.COMPLETED)
    pending_amount = total_earnings - paid_amount
    
    return render(request, 'mentors_dash/earnings.html', {
        'payments': payments,
        'payouts': payouts,
        'total_earnings': total_earnings,
        'pending_amount': pending_amount,
        'paid_amount': paid_amount
    })

@login_required
def download_earnings_csv(request):
    """View for mentors to download earnings CSV."""
    if not request.user.is_mentor:
        messages.error(request, 'Only mentors can download earnings data.')
        return redirect('home')
    
    import csv
    from django.http import HttpResponse
    
    # Get all successful payments for the mentor's sessions
    payments = Payment.objects.filter(
        booking__session__mentor=request.user,
        status=Payment.PAID
    ).order_by('-created_at')
    
    # Create the HttpResponse object with CSV header
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="earnings.csv"'
    
    writer = csv.writer(response)
    writer.writerow(['Date', 'Session Title', 'Learner', 'Amount', 'Platform Fee', 'Your Earnings'])
    
    for payment in payments:
        writer.writerow([
            payment.created_at.strftime('%Y-%m-%d'),
            payment.booking.session.title,
            payment.booking.learner.get_full_name() or payment.booking.learner.username,
            payment.amount,
            payment.platform_fee or (payment.amount * Decimal('0.15')),
            payment.mentor_share or (payment.amount * Decimal('0.85')),
        ])
    
    return response
