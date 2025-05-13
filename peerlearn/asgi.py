"""
ASGI config for peerlearn project.
"""

import os
from django.core.asgi import get_asgi_application
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')

# Import after setting Django settings
from peerlearn.routing import application as channels_application

# Initialize Django ASGI application
django_asgi_app = get_asgi_application()

# Use the combined application from routing.py with HTTP support
application = channels_application
