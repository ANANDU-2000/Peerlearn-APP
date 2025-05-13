"""
Views for the learning_sessions app.
"""

from django.views.generic import ListView, DetailView
from .models import Session

class SessionListView(ListView):
    """
    View for listing all sessions with filtering options.
    """
    model = Session
    template_name = 'sessions/list.html'
    context_object_name = 'sessions'
    paginate_by = 12

    def get_queryset(self):
        """Filter sessions based on query parameters."""
        queryset = super().get_queryset().filter(status='scheduled')
        
        # Filter by category/topic if provided
        category = self.request.GET.get('category')
        if category:
            queryset = queryset.filter(topics__contains=[category])
        
        return queryset.order_by('schedule')

class SessionDetailView(DetailView):
    """
    View for session details and booking.
    """
    model = Session
    template_name = 'sessions/detail.html'
    context_object_name = 'session'