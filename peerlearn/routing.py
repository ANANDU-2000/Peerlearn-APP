"""
ASGI routing configuration for peerlearn project.
"""

from django.urls import path, include
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

# Import websocket patterns from all apps
from apps.learning_sessions.routing import websocket_urlpatterns as session_urlpatterns
from apps.notifications.routing import websocket_urlpatterns as notification_urlpatterns

# Combine all websocket URL patterns
websocket_urlpatterns = [
    # Include app-specific websocket URL patterns
    *session_urlpatterns,
    *notification_urlpatterns,
]

application = ProtocolTypeRouter({
    'websocket': AuthMiddlewareStack(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})