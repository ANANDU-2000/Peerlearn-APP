"""
Models for payment processing and tracking.
"""

from django.db import models
from django.utils.translation import gettext_lazy as _
from django.conf import settings

from apps.learning_sessions.models import Booking

class Payment(models.Model):
    """
    Model for tracking payments for session bookings.
    """
    INITIATED = 'initiated'
    PAID = 'paid'
    FAILED = 'failed'
    REFUNDED = 'refunded'
    
    STATUS_CHOICES = [
        (INITIATED, _('Initiated')),
        (PAID, _('Paid')),
        (FAILED, _('Failed')),
        (REFUNDED, _('Refunded')),
    ]
    
    booking = models.OneToOneField(
        Booking,
        on_delete=models.CASCADE,
        related_name='payment',
        help_text=_('The booking this payment is for.')
    )
    
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_('Amount of the payment.')
    )
    
    razorpay_order_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('Razorpay order ID.')
    )
    
    razorpay_payment_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('Razorpay payment ID.')
    )
    
    razorpay_signature = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('Razorpay signature for verification.')
    )
    
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=INITIATED,
        help_text=_('Current status of the payment.')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when the payment was created.')
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text=_('Date and time when the payment was last updated.')
    )
    
    currency = models.CharField(
        max_length=3,
        default='INR',
        help_text=_('Currency of the payment.')
    )
    
    mentor_share = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Amount to be paid to the mentor.')
    )
    
    platform_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Platform fee amount.')
    )
    
    refund_reason = models.TextField(
        blank=True,
        null=True,
        help_text=_('Reason for refund if the payment was refunded.')
    )
    
    class Meta:
        verbose_name = _('Payment')
        verbose_name_plural = _('Payments')
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Payment for booking {self.booking.id} - {self.get_status_display()}"
    
    def save(self, *args, **kwargs):
        """Override save to calculate mentor_share and platform_fee."""
        if self.amount and not self.mentor_share:
            # Calculate mentor share (85% of the total amount)
            self.mentor_share = self.amount * 0.85
            
            # Calculate platform fee (15% of the total amount)
            self.platform_fee = self.amount * 0.15
        
        super().save(*args, **kwargs)

class MentorPayout(models.Model):
    """
    Model for tracking payouts to mentors.
    """
    PENDING = 'pending'
    COMPLETED = 'completed'
    FAILED = 'failed'
    
    STATUS_CHOICES = [
        (PENDING, _('Pending')),
        (COMPLETED, _('Completed')),
        (FAILED, _('Failed')),
    ]
    
    mentor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payouts',
        limit_choices_to={'role': 'mentor'},
        help_text=_('The mentor to whom the payout is made.')
    )
    
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_('Amount of the payout.')
    )
    
    payments = models.ManyToManyField(
        Payment,
        related_name='payouts',
        help_text=_('Payments included in this payout.')
    )
    
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=PENDING,
        help_text=_('Current status of the payout.')
    )
    
    payout_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('Payout ID from the payment processor.')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when the payout was created.')
    )
    
    processed_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text=_('Date and time when the payout was processed.')
    )
    
    notes = models.TextField(
        blank=True,
        null=True,
        help_text=_('Additional notes about the payout.')
    )
    
    class Meta:
        verbose_name = _('Mentor Payout')
        verbose_name_plural = _('Mentor Payouts')
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Payout of {self.amount} to {self.mentor.username} - {self.get_status_display()}"
