"""
Models for user notifications.
"""

from django.db import models
from django.utils.translation import gettext_lazy as _
from django.conf import settings

class Notification(models.Model):
    """
    Model for user notifications.
    """
    NOTIFICATION_TYPES = (
        ('info', _('Information')),
        ('success', _('Success')),
        ('warning', _('Warning')),
        ('error', _('Error')),
    )
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        help_text=_('The user to whom the notification is sent.')
    )
    
    title = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('The notification title.')
    )
    
    message = models.TextField(
        help_text=_('The notification message.')
    )
    
    link = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('Link to redirect the user to when clicked.')
    )
    
    notification_type = models.CharField(
        max_length=20,
        choices=NOTIFICATION_TYPES,
        default='info',
        help_text=_('The type of notification.')
    )
    
    reference_id = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text=_('Optional reference ID for related object (session, booking, etc).')
    )
    
    read = models.BooleanField(
        default=False,
        help_text=_('Whether the notification has been read.')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when the notification was created.')
    )
    
    class Meta:
        verbose_name = _('Notification')
        verbose_name_plural = _('Notifications')
        ordering = ['-created_at']
    
    def __str__(self):
        title_display = self.title if self.title else self.message[:30]
        return f"Notification for {self.user.username}: {title_display}..."

    def mark_as_read(self):
        """Mark the notification as read."""
        self.read = True
        self.save()
