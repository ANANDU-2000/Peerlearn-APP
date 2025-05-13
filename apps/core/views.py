"""
Core views for the PeerLearn platform.
"""

from django.views.generic import TemplateView
from django.db.models import Count, Avg, Q
from django.utils import timezone
from collections import defaultdict

from apps.learning_sessions.models import Session, Booking
from apps.users.models import CustomUser


class HomeView(TemplateView):
    """
    View for the home page with real-time data from the database.
    """
    template_name = 'landing.html'

    def get_context_data(self, **kwargs):
        """Add real data from database to context."""
        context = super().get_context_data(**kwargs)
        
        # Get live and upcoming sessions
        now = timezone.now()
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Live sessions - those currently in progress
        live_sessions = Session.objects.filter(
            schedule__lte=now,
            schedule__gte=today_start,  # Today
            status='active'
        ).select_related('mentor')[:3]
        
        # Upcoming sessions - those scheduled for future dates
        upcoming_sessions = Session.objects.filter(
            schedule__gt=now,
            status='scheduled'
        ).select_related('mentor').order_by('schedule')[:6]
        
        # All sessions for carousel
        all_sessions = list(live_sessions) + list(upcoming_sessions)
        
        # Get categories
        all_topics = []
        for session in Session.objects.all():
            all_topics.extend(session.topics)
        
        # Count sessions per category
        category_counts = defaultdict(int)
        for topic in all_topics:
            category_counts[topic] += 1
        
        # Create category objects
        categories = [
            {'name': topic, 'active': True} 
            for topic in sorted(set(all_topics))
            if category_counts[topic] > 0
        ]
        
        # Group sessions by category
        sessions_by_category = defaultdict(list)
        for session in all_sessions:
            for topic in session.topics:
                sessions_by_category[topic].append(session)
        
        # Get featured mentors (mentors with highest ratings)
        featured_mentors = CustomUser.objects.filter(
            role='mentor'
        ).annotate(
            session_count=Count('session'),
            rating_avg=Avg('ratings_received__rating')
        ).filter(
            session_count__gt=0
        ).order_by('-rating_avg')[:4]
        
        # Add to context
        context.update({
            'live_sessions': live_sessions,
            'upcoming_sessions': upcoming_sessions,
            'all_sessions': all_sessions,
            'categories': categories,
            'category_counts': dict(category_counts),
            'sessions_by_category': sessions_by_category,
            'featured_mentors': featured_mentors,
        })
        
        return context