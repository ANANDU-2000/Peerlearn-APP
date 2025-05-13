"""
Admin configuration for the payments app.
"""

from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Payment, MentorPayout

class PaymentAdmin(admin.ModelAdmin):
    """Admin configuration for the Payment model."""
    list_display = ('id', 'booking', 'amount', 'status', 'created_at')
    list_filter = ('status', 'created_at', 'currency')
    search_fields = ('booking__session__title', 'booking__learner__username', 'razorpay_order_id', 'razorpay_payment_id')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        (None, {'fields': ('booking', 'amount', 'currency', 'status')}),
        (_('Razorpay Details'), {'fields': ('razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature')}),
        (_('Revenue Sharing'), {'fields': ('mentor_share', 'platform_fee')}),
        (_('Refund'), {'fields': ('refund_reason',)}),
        (_('Timestamps'), {'fields': ('created_at', 'updated_at')}),
    )

class MentorPayoutAdmin(admin.ModelAdmin):
    """Admin configuration for the MentorPayout model."""
    list_display = ('id', 'mentor', 'amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('mentor__username', 'mentor__email', 'payout_id')
    readonly_fields = ('created_at',)
    
    fieldsets = (
        (None, {'fields': ('mentor', 'amount', 'status')}),
        (_('Payments'), {'fields': ('payments',)}),
        (_('Processing'), {'fields': ('payout_id', 'processed_at', 'notes')}),
        (_('Timestamps'), {'fields': ('created_at',)}),
    )

admin.site.register(Payment, PaymentAdmin)
admin.site.register(MentorPayout, MentorPayoutAdmin)
