"""
URL patterns for the learning_sessions app.
"""

from django.urls import path
from .views import SessionListView, SessionDetailView

urlpatterns = [
    path('', SessionListView.as_view(), name='list'),
    path('<int:pk>/', SessionDetailView.as_view(), name='detail'),
    path('<int:pk>/book/', SessionDetailView.as_view(), name='book'),
]