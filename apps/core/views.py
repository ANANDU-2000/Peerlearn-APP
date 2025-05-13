"""
Core views for the PeerLearn platform.
"""

from django.views.generic import TemplateView
from django.utils import timezone
from django.db.models import Count, Avg

from apps.users.models import CustomUser, UserRating
from apps.learning_sessions.models import Session

class HomeView(TemplateView):
    """
    View for the home page with real-time data from the database.
    """
    template_name = 'landing.html'
    
    def get_context_data(self, **kwargs):
        """Add real data from database to context."""
        context = super().get_context_data(**kwargs)
        
        # Get featured mentors (top rated)
        mentors = CustomUser.objects.filter(
            role=CustomUser.MENTOR
        ).annotate(
            rating_avg=Avg('ratings_received__rating'),
            sessions_count=Count('session')
        ).filter(sessions_count__gt=0).order_by('-rating_avg')[:6]
        
        # Get upcoming sessions
        now = timezone.now()
        upcoming_sessions = Session.objects.filter(
            schedule__gt=now,
            status=Session.SCHEDULED
        ).select_related('mentor').order_by('schedule')[:6]
        
        # Get live sessions
        live_sessions = Session.objects.filter(
            status=Session.LIVE
        ).select_related('mentor').order_by('schedule')[:3]
        
        # Get categories from session topics
        all_topics = Session.objects.exclude(topics=[]).values_list('topics', flat=True)
        
        # Extract unique categories (flattening the list of lists)
        categories = set()
        for topics_list in all_topics:
            if isinstance(topics_list, list):
                for topic in topics_list:
                    categories.add(topic)
        
        # Sort categories alphabetically and take first 8
        categories = sorted(list(categories))[:8]
        
        context.update({
            'featured_mentors': mentors,
            'upcoming_sessions': upcoming_sessions,
            'live_sessions': live_sessions,
            'categories': categories
        })
        
        return context