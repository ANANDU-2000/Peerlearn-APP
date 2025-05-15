"""
User models for the PeerLearn platform.
"""

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _

class CustomUser(AbstractUser):
    """
    Custom user model that extends Django's AbstractUser to include additional fields.
    """
    LEARNER = 'learner'
    MENTOR = 'mentor'
    ADMIN = 'admin'
    
    ROLE_CHOICES = [
        (LEARNER, _('Learner')),
        (MENTOR, _('Mentor')),
        (ADMIN, _('Admin')),
    ]
    
    role = models.CharField(
        max_length=10,
        choices=ROLE_CHOICES,
        default=LEARNER,
        help_text=_('Designates the role of this user in the platform.')
    )
    
    # Profile fields
    profile_picture = models.ImageField(
        upload_to='profile_pictures/',
        blank=True,
        null=True
    )
    
    bio = models.TextField(
        blank=True,
        null=True,
        help_text=_('A brief description about the user.')
    )
    
    # Learner specific fields
    interests = models.JSONField(
        blank=True,
        null=True,
        help_text=_('Topics that the learner is interested in.')
    )
    
    career_goal = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('Career goal of the learner.')
    )
    
    # Mentor specific fields
    expertise = models.JSONField(
        blank=True,
        null=True,
        help_text=_('Areas of expertise for the mentor.')
    )
    
    skills = models.JSONField(
        blank=True,
        null=True,
        help_text=_('Skills that the mentor possesses.')
    )
    
    intro_video = models.URLField(
        blank=True,
        null=True,
        help_text=_('URL to an introduction video for the mentor.')
    )
    
    # Common fields
    phone_number = models.CharField(
        max_length=15,
        blank=True,
        null=True,
        help_text=_('Contact phone number.')
    )
    
    date_updated = models.DateTimeField(
        auto_now=True,
        help_text=_('Date and time when the user profile was last updated.')
    )
    
    class Meta:
        verbose_name = _('User')
        verbose_name_plural = _('Users')
    
    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
    
    @property
    def is_learner(self):
        """Check if the user is a learner."""
        return self.role == self.LEARNER
    
    @property
    def is_mentor(self):
        """Check if the user is a mentor."""
        return self.role == self.MENTOR
    
    @property
    def is_admin_user(self):
        """Check if the user is an admin."""
        return self.role == self.ADMIN
    
    def get_dashboard_url(self):
        """Get the dashboard URL based on user role."""
        if self.is_learner:
            return '/users/dashboard/learner/'
        elif self.is_mentor:
            return '/users/dashboard/mentor/'
        elif self.is_admin_user:
            return '/admin/'
        return '/'
        
    @property
    def rating_average(self):
        """Calculate the average rating for this user."""
        # Only applies to mentors
        if not self.is_mentor:
            return 0
            
        ratings = self.ratings_received.all()
        if not ratings.exists():
            return 0
            
        total_rating = sum(r.rating for r in ratings)
        return int(total_rating / ratings.count())
    
    @property
    def rating_count(self):
        """Get the number of ratings for this user."""
        if not self.is_mentor:
            return 0
            
        return self.ratings_received.count()

class UserRating(models.Model):
    """
    Model to store ratings given to mentors by learners.
    """
    mentor = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='ratings_received',
        help_text=_('The mentor who received the rating.')
    )
    
    learner = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='ratings_given',
        help_text=_('The learner who gave the rating.')
    )
    
    rating = models.PositiveSmallIntegerField(
        help_text=_('Rating from 1 to 5.')
    )
    
    review = models.TextField(
        blank=True,
        null=True,
        help_text=_('Optional review comments.')
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text=_('Date and time when the rating was created.')
    )
    
    class Meta:
        verbose_name = _('User Rating')
        verbose_name_plural = _('User Ratings')
        unique_together = ('mentor', 'learner')
    
    def __str__(self):
        return f"Rating for {self.mentor.username} by {self.learner.username}: {self.rating}/5"
