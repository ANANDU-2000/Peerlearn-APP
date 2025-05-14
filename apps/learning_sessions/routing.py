"""
WebSocket URL routing for the learning_sessions app.
"""

from django.urls import path, re_path

from . import consumers

websocket_urlpatterns = [
    # Session WebSocket routes - support all formats for maximum compatibility
    re_path(r'^ws/session/(?P<room_code>\w+)/$', consumers.SessionConsumer.as_asgi()),
    re_path(r'^ws/sessions/(?P<room_code>\w+)/$', consumers.SessionConsumer.as_asgi()),
    re_path(r'^ws/room/(?P<room_code>\w+)/$', consumers.SessionConsumer.as_asgi()),  # Additional format
    
    # General sessions WebSocket route for any session-related subscriptions
    re_path(r'^ws/sessions/$', consumers.SessionsConsumer.as_asgi()),
    
    # Dashboard WebSocket routes - use both formats for maximum compatibility
    re_path(r'^ws/dashboard/(?P<user_id>[0-9]+)/$', consumers.DashboardConsumer.as_asgi()),
    path('ws/dashboard/<int:user_id>/', consumers.DashboardConsumer.as_asgi()),
]