import os
import django

from channels.routing import get_default_application  # or import your custom routing if needed

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

from peerlearn.routing import application  # ❗ This line should NOT have a `?`
