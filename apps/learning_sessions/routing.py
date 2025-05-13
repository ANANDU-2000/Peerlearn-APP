"""
WebSocket URL routing for the learning_sessions app.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/session/(?P<room_code>\w+)/$', consumers.SessionConsumer.as_asgi()),
    re_path(r'ws/sessions/$', consumers.SessionStatusConsumer.as_asgi()),
]