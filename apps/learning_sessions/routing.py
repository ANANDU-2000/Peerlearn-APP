"""
WebSocket URL routing for the learning_sessions app.
"""

from django.urls import path, re_path

from . import consumers
from . import dashboard_consumer

websocket_urlpatterns = [
    # Session WebSocket routes
    re_path(r'^ws/session/(?P<room_code>\w+)/$', consumers.SessionConsumer.as_asgi()),
    
    # Dashboard WebSocket routes - use both formats for maximum compatibility
    re_path(r'^ws/dashboard/(?P<user_id>[0-9]+)/$', dashboard_consumer.DashboardConsumer.as_asgi()),
    path('ws/dashboard/<int:user_id>/', dashboard_consumer.DashboardConsumer.as_asgi()),
]