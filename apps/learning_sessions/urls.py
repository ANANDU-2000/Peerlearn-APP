"""
URL patterns for the sessions app.
"""

from django.urls import path
from . import views
from . import api_views
from . import api_endpoints

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
    
    # WebRTC room and live functionality
    path('room/<uuid:room_code>/', views.session_room, name='room'),
    path('room/<uuid:room_code>/go-live/', views.go_live_session, name='go_live'),
    path('<uuid:room_code>/join/', views.join_session_room, name='join'),
    path('<uuid:room_code>/feedback/', views.session_feedback, name='session_feedback'),
    # Adding an alternative join route that matches the URL pattern in the error
    path('<str:room_code>/', views.session_by_room_code, name='session_by_room_code'),
    
    # API endpoints
    path('api/status/', api_views.session_status_api, name='status_api'),
    path('api/bookings/<int:booking_id>/', api_views.booking_detail_api, name='booking_api'),
    
    # New API endpoints with improved error handling and WebSocket integration
    path('api/create/', api_endpoints.create_session_api, name='create_api'),
    path('api/session/<int:session_id>/', api_endpoints.session_details_api, name='session_details_api'),
    path('api/sessions/<int:session_id>/cancel/', api_endpoints.cancel_session_api, name='cancel_session_api'),
    path('api/sessions/<int:session_id>/go_live/', api_endpoints.go_live_api, name='go_live_api'),
    
    # WebRTC and room status API endpoints
    path('api/sessions/<uuid:room_code>/status/', api_views.update_session_status, name='update_session_status'),
    path('api/sessions/<str:room_code>/status/', api_views.update_session_status, name='update_session_status_str'),
<<<<<<< HEAD
    
    # End session API endpoint
    path('api/sessions/<uuid:room_code>/end/', api_views.end_session, name='end_session_api'),
    path('api/sessions/<str:room_code>/end/', api_views.end_session, name='end_session_str_api'),
=======
>>>>>>> 75adc86c7564c69ceda84cbdd8be5b82ca9268f4
]
