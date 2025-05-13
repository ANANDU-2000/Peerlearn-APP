"""
Admin configuration for the sessions app.
"""

from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Session, SessionRequest, Booking

class BookingInline(admin.TabularInline):
    """Inline admin for bookings."""
    model = Booking
    extra = 0
    readonly_fields = ('created_at', 'updated_at')

class SessionAdmin(admin.ModelAdmin):
    """Admin configuration for the Session model."""
    list_display = ('title', 'mentor', 'schedule', 'price', 'status')
    list_filter = ('status', 'schedule', 'price')
    search_fields = ('title', 'description', 'mentor__username', 'mentor__email')
    readonly_fields = ('room_code', 'created_at', 'updated_at')
    inlines = [BookingInline]
    
    fieldsets = (
        (None, {'fields': ('title', 'mentor', 'description')}),
        (_('Schedule & Pricing'), {'fields': ('schedule', 'duration', 'price')}),
        (_('Topics & Categories'), {'fields': ('topics',)}),
        (_('Status'), {'fields': ('status', 'room_code')}),
        (_('Additional Info'), {'fields': ('max_participants', 'created_at', 'updated_at')}),
    )

class SessionRequestAdmin(admin.ModelAdmin):
    """Admin configuration for the SessionRequest model."""
    list_display = ('title', 'learner', 'mentor', 'proposed_time', 'budget', 'status')
    list_filter = ('status', 'proposed_time')
    search_fields = ('title', 'description', 'learner__username', 'mentor__username')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        (None, {'fields': ('title', 'learner', 'mentor', 'domain', 'description')}),
        (_('Schedule & Budget'), {'fields': ('proposed_time', 'duration', 'budget')}),
        (_('Status & Response'), {'fields': ('status', 'mentor_notes', 'counter_offer', 'counter_time')}),
        (_('Timestamps'), {'fields': ('created_at', 'updated_at')}),
    )

class BookingAdmin(admin.ModelAdmin):
    """Admin configuration for the Booking model."""
    list_display = ('session', 'learner', 'status', 'created_at')
    list_filter = ('status', 'created_at', 'feedback_submitted')
    search_fields = ('session__title', 'learner__username', 'learner__email')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        (None, {'fields': ('session', 'learner', 'status')}),
        (_('Feedback & Cancellation'), {'fields': ('feedback_submitted', 'cancellation_reason')}),
        (_('Timestamps'), {'fields': ('created_at', 'updated_at')}),
    )

admin.site.register(Session, SessionAdmin)
admin.site.register(SessionRequest, SessionRequestAdmin)
admin.site.register(Booking, BookingAdmin)
