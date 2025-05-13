"""
Admin configuration for the notifications app.
"""

from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Notification

class NotificationAdmin(admin.ModelAdmin):
    """Admin configuration for the Notification model."""
    list_display = ('id', 'user', 'message_short', 'read', 'created_at')
    list_filter = ('read', 'created_at')
    search_fields = ('message', 'user__username', 'user__email')
    readonly_fields = ('created_at',)
    
    def message_short(self, obj):
        """Display a shortened version of the message."""
        if len(obj.message) > 50:
            return f"{obj.message[:50]}..."
        return obj.message
    
    message_short.short_description = _('Message')

admin.site.register(Notification, NotificationAdmin)
