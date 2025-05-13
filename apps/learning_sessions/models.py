"""
Models for managing sessions, session requests, and bookings.
"""

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone

from apps.users.models import CustomUser

class Domain(models.Model):
    """
    Model for domains/categories of sessions.
    """
    name = models.CharField(
        max_length=255,
        unique=True,
        help_text=_('Name of the domain/category.')
    )
    
    description = models.TextField(
        blank=True,
        null=True,
        help_text=_('Description of this domain/category.')
    )
    
    icon = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text=_('Icon name for this domain (e.g., "code" for programming).')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when this domain was created.')
    )
    
    class Meta:
        verbose_name = _('Domain')
        verbose_name_plural = _('Domains')
        ordering = ['name']
    
    def __str__(self):
        return self.name

class Session(models.Model):
    """
    Model for a session created by a mentor.
    """
    SCHEDULED = 'scheduled'
    LIVE = 'live'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'
    
    STATUS_CHOICES = [
        (SCHEDULED, _('Scheduled')),
        (LIVE, _('Live')),
        (COMPLETED, _('Completed')),
        (CANCELLED, _('Cancelled')),
    ]
    
    mentor = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        limit_choices_to={'role': CustomUser.MENTOR},
        help_text=_('The mentor hosting this session.')
    )
    
    title = models.CharField(
        max_length=255,
        help_text=_('Title of the session.')
    )
    
    description = models.TextField(
        help_text=_('Description of what will be covered in the session.')
    )
    
    topics = models.JSONField(
        default=list,
        help_text=_('List of topics that will be covered in this session.')
    )
    
    schedule = models.DateTimeField(
        help_text=_('Date and time when the session is scheduled.')
    )
    
    duration = models.PositiveIntegerField(
        default=60,
        help_text=_('Duration of the session in minutes.')
    )
    
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text=_('Price of the session (0 for free sessions).')
    )
    
    room_code = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True,
        help_text=_('Unique code for the session room.')
    )
    
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=SCHEDULED,
        help_text=_('Current status of the session.')
    )
    
    max_participants = models.PositiveIntegerField(
        default=1,
        help_text=_('Maximum number of participants allowed (1 for one-to-one).')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when the session was created.')
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text=_('Date and time when the session was last updated.')
    )
    
    class Meta:
        verbose_name = _('Session')
        verbose_name_plural = _('Sessions')
        ordering = ['-schedule']
    
    def __str__(self):
        return f"{self.title} by {self.mentor.username} on {self.schedule.strftime('%Y-%m-%d %H:%M')}"
    
    @property
    def is_free(self):
        """Check if the session is free."""
        return self.price == 0
    
    @property
    def is_upcoming(self):
        """Check if the session is in the future."""
        return self.schedule > timezone.now()
    
    @property
    def is_live_now(self):
        """Check if the session is currently live."""
        return (
            self.status == self.LIVE and 
            self.schedule <= timezone.now() <= 
            self.schedule + timezone.timedelta(minutes=self.duration)
        )
    
    @property
    def get_absolute_url(self):
        """Get the URL for the session detail page."""
        from django.urls import reverse
        return reverse('sessions:detail', kwargs={'pk': self.pk})
    
    @property
    def get_room_url(self):
        """Get the URL for the session room."""
        from django.urls import reverse
        return reverse('sessions:room', kwargs={'room_code': self.room_code})
    
    def save(self, *args, **kwargs):
        """Override save to ensure room_code is set."""
        if not self.room_code:
            self.room_code = uuid.uuid4()
        super().save(*args, **kwargs)

class SessionRequest(models.Model):
    """
    Model for a session request from a learner to a mentor.
    """
    PENDING = 'pending'
    OFFERED = 'offered'
    ACCEPTED = 'accepted'
    DECLINED = 'declined'
    COUNTERED = 'countered'
    
    STATUS_CHOICES = [
        (PENDING, _('Pending')),
        (OFFERED, _('Offered')),
        (ACCEPTED, _('Accepted')),
        (DECLINED, _('Declined')),
        (COUNTERED, _('Countered')),
    ]
    
    learner = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='sent_requests',
        limit_choices_to={'role': CustomUser.LEARNER},
        help_text=_('The learner who sent the request.')
    )
    
    mentor = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='received_requests',
        limit_choices_to={'role': CustomUser.MENTOR},
        help_text=_('The mentor who received the request.')
    )
    
    title = models.CharField(
        max_length=255,
        help_text=_('Title or subject of the requested session.')
    )
    
    domain = models.ForeignKey(
        Domain,
        on_delete=models.SET_NULL,
        null=True,
        related_name='session_requests',
        help_text=_('Domain or category of the requested session.')
    )
    
    description = models.TextField(
        help_text=_('Detailed description of what the learner wants to learn.')
    )
    
    proposed_time = models.DateTimeField(
        help_text=_('Proposed date and time for the session.')
    )
    
    duration = models.PositiveIntegerField(
        default=60,
        help_text=_('Proposed duration of the session in minutes.')
    )
    
    budget = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text=_('Learner\'s budget for the session (0 for no budget specified).')
    )
    
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=PENDING,
        help_text=_('Current status of the request.')
    )
    
    mentor_notes = models.TextField(
        blank=True,
        null=True,
        help_text=_('Notes from the mentor in response to the request.')
    )
    
    counter_offer = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Counter offer price from the mentor.')
    )
    
    counter_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_('Counter proposed time from the mentor.')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when the request was created.')
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text=_('Date and time when the request was last updated.')
    )
    
    class Meta:
        verbose_name = _('Session Request')
        verbose_name_plural = _('Session Requests')
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Request from {self.learner.username} to {self.mentor.username}: {self.title}"
    
    @property
    def is_pending(self):
        """Check if the request is pending."""
        return self.status == self.PENDING
    
    @property
    def is_offered(self):
        """Check if the request has a counter offer."""
        return self.status == self.OFFERED
    
    @property
    def is_accepted(self):
        """Check if the request is accepted."""
        return self.status == self.ACCEPTED
    
    @property
    def is_declined(self):
        """Check if the request is declined."""
        return self.status == self.DECLINED

class Booking(models.Model):
    """
    Model for a booking of a session by a learner.
    """
    PENDING = 'pending'
    CONFIRMED = 'confirmed'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'
    
    STATUS_CHOICES = [
        (PENDING, _('Pending')),
        (CONFIRMED, _('Confirmed')),
        (CANCELLED, _('Cancelled')),
        (COMPLETED, _('Completed')),
    ]
    
    session = models.ForeignKey(
        Session,
        on_delete=models.CASCADE,
        related_name='bookings',
        help_text=_('The session that was booked.')
    )
    
    learner = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='bookings',
        limit_choices_to={'role': CustomUser.LEARNER},
        help_text=_('The learner who booked the session.')
    )
    
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=PENDING,
        help_text=_('Current status of the booking.')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when the booking was created.')
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text=_('Date and time when the booking was last updated.')
    )
    
    cancellation_reason = models.TextField(
        blank=True,
        null=True,
        help_text=_('Reason for cancellation if the booking was cancelled.')
    )
    
    feedback_submitted = models.BooleanField(
        default=False,
        help_text=_('Whether the learner has submitted feedback for this booking.')
    )
    
    class Meta:
        verbose_name = _('Booking')
        verbose_name_plural = _('Bookings')
        ordering = ['-created_at']
        unique_together = ('session', 'learner')
    
    def __str__(self):
        return f"Booking by {self.learner.username} for {self.session.title}"
    
    @property
    def can_join(self):
        """Check if the learner can join the session."""
        return (
            self.status == self.CONFIRMED and 
            self.session.status in [Session.SCHEDULED, Session.LIVE]
        )
    
    @property
    def is_past(self):
        """Check if the session is in the past."""
        return self.session.schedule < timezone.now()
