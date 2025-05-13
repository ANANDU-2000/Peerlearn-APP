"""
ASGI config for peerlearn project.
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')

django_asgi_app = get_asgi_application()

# Import after setting Django settings
from apps.learning_sessions.routing import websocket_urlpatterns as session_websocket_urlpatterns
from apps.notifications.routing import websocket_urlpatterns as notification_websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(
                session_websocket_urlpatterns +
                notification_websocket_urlpatterns
            )
        )
    ),
})
