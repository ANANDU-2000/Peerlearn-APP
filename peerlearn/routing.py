"""
ASGI routing configuration for peerlearn project.
"""

from django.urls import path, include
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator

# Import websocket patterns from all apps
from apps.learning_sessions.routing import websocket_urlpatterns as session_urlpatterns
from apps.notifications.routing import websocket_urlpatterns as notification_urlpatterns

# Get Django ASGI application for HTTP handling
django_asgi_app = get_asgi_application()

# Combine all websocket URL patterns
websocket_urlpatterns = [
    # Include app-specific websocket URL patterns
    *session_urlpatterns,
    *notification_urlpatterns,
]

# Define the ASGI application with both HTTP and WebSocket support
application = ProtocolTypeRouter({
    # Django's ASGI application for handling HTTP requests
    "http": django_asgi_app,
    
    # WebSocket handlers with authentication and origin validation
    'websocket': AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(
                websocket_urlpatterns
            )
        )
    ),
})