"""
URL patterns for the sessions app.
"""

from django.urls import path
from . import views

app_name = 'sessions'

urlpatterns = [
    # Public session routes
    path('', views.SessionListView.as_view(), name='list'),
    path('<int:pk>/', views.SessionDetailView.as_view(), name='detail'),
    
    # Session management for mentors
    path('create/', views.SessionCreateView.as_view(), name='create'),
    path('<int:pk>/update/', views.SessionUpdateView.as_view(), name='update'),
    path('<int:session_id>/end/', views.end_session, name='end'),
    
    # Session requests
    path('request/<int:mentor_id>/', views.request_session, name='request'),
    path('request/<int:request_id>/respond/', views.respond_to_request, name='respond_to_request'),
    
    # Bookings
    path('<int:session_id>/book/', views.book_session, name='book'),
    path('booking/<int:booking_id>/cancel/', views.cancel_booking, name='cancel_booking'),
    path('booking/<int:booking_id>/feedback/', views.submit_feedback, name='feedback'),
    
    # WebRTC room
    path('room/<uuid:room_code>/', views.session_room, name='room'),
]
