"""
ASGI routing configuration for peerlearn project.
"""

from django.urls import path
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

from apps.learning_sessions.consumers import SessionConsumer

websocket_urlpatterns = [
    path('ws/sessions/', SessionConsumer.as_asgi()),
]

application = ProtocolTypeRouter({
    'websocket': AuthMiddlewareStack(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})