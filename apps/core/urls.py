"""
URL patterns for the core app.
"""

from django.urls import path
from django.views.generic import TemplateView
from .views import HomeView

urlpatterns = [
    path('', HomeView.as_view(), name='home'),
    path('test-mentor-profiles/', TemplateView.as_view(template_name='test_mentor_profile.html'), name='test_mentor_profiles'),
]