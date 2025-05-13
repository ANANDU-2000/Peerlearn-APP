"""
ASGI config for peerlearn project.
"""

import os
import django

# Set the Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

# Import ASGI application
from peerlearn.routing import application
