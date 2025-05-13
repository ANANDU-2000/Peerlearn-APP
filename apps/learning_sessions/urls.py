"""
URL patterns for the sessions app.
"""

from django.urls import path
from . import views
from . import api_views

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
    path('request/', views.request_session_api, name='request_api'),
    path('request/<int:request_id>/respond/', views.respond_to_request, name='respond_to_request'),
    path('accept-request/<int:request_id>/', views.accept_session_request, name='accept_request'),
    path('reject-request/<int:request_id>/', views.reject_session_request, name='reject_request'),
    path('modify-request/<int:request_id>/', views.modify_session_request, name='modify_request'),
    path('requests/<int:request_id>/accept-counter/', views.accept_counter_offer, name='accept_counter_offer'),
    path('requests/<int:request_id>/cancel/', views.cancel_session_request, name='cancel_request'),
    
    # Bookings
    path('<int:session_id>/book/', views.book_session, name='book'),
    path('booking/<int:booking_id>/cancel/', views.cancel_booking, name='cancel_booking'),
    path('booking/<int:booking_id>/feedback/', views.submit_feedback, name='feedback'),
    
    # WebRTC room
    path('room/<uuid:room_code>/', views.session_room, name='room'),
    
    # API endpoints
    path('api/status/', api_views.session_status_api, name='status_api'),
    path('api/bookings/<int:booking_id>/', api_views.booking_detail_api, name='booking_api'),
]
