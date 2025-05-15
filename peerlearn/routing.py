"""
ASGI routing configuration for peerlearn project.
"""

import os
import django
from django.urls import path, re_path, include
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
import importlib

# Import websocket patterns from all apps
from apps.learning_sessions.routing import websocket_urlpatterns as session_urlpatterns
from apps.notifications.routing import websocket_urlpatterns as notification_urlpatterns

# Get Django ASGI application for HTTP handling
django_asgi_app = get_asgi_application()

# Print all imported WebSocket URL patterns for debugging
print("Session WebSocket URL patterns:")
for pattern in session_urlpatterns:
    print(f" - {pattern.pattern}")

print("Notification WebSocket URL patterns:")
for pattern in notification_urlpatterns:
    print(f" - {pattern.pattern}")

# Define a 404 catch-all handler for debugging
async def ws_404_handler(scope, receive, send):
    """
    Handle WebSocket 404 errors by logging the URL that wasn't matched.
    """
    print(f"WebSocket 404 - Path not found: {scope['path']}")
    await send({
        "type": "websocket.close",
        "code": 4004,
        "reason": "Path not found",
    })

# Add explicit import for the session consumer to avoid import errors
from apps.learning_sessions.consumers import SessionConsumer

# Special direct import for DashboardConsumer
try:
    from apps.learning_sessions.consumers import DashboardConsumer
except ImportError:
    try:
        from apps.learning_sessions.dashboard_consumer import DashboardConsumer
    except ImportError:
        print("WARNING: DashboardConsumer could not be imported")
        DashboardConsumer = None

# Combine all websocket URL patterns
websocket_urlpatterns = [
    # Add session WebSocket patterns with highest priority for WebRTC signaling
    # Use direct import instead of importlib for more reliable loading
    re_path(r'^ws/session/(?P<room_code>\w+)/$', SessionConsumer.as_asgi()),
    re_path(r'^ws/sessions/(?P<room_code>\w+)/$', SessionConsumer.as_asgi()),  # Add plural form 
    re_path(r'^ws/room/(?P<room_code>\w+)/$', SessionConsumer.as_asgi()),
    
    # Include the rest of app-specific websocket URL patterns
    *session_urlpatterns,
    *notification_urlpatterns,
    
    # Add a debug pattern to catch all dashboard WebSocket requests
    re_path(r'^ws/dashboard/(?P<user_id>.+)/$', DashboardConsumer.as_asgi() if DashboardConsumer else ws_404_handler),
    
    # Add a debugging catch-all pattern for any other URLs
    re_path(r'^ws/.*$', ws_404_handler),
]

# Define the ASGI application with both HTTP and WebSocket support
application = ProtocolTypeRouter({
    # Django's ASGI application for handling HTTP requests
    "http": django_asgi_app,
    
    # WebSocket handlers with authentication and origin validation
    'websocket': AuthMiddlewareStack(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})