"""
URL Configuration for peerlearn project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from django.views.generic.base import RedirectView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('apps.core.urls')),
    path('users/', include('apps.users.urls')),
    path('sessions/', include('apps.learning_sessions.urls')),
    path('payments/', include('apps.payments.urls')),
    path('dashboard/admin/', include('apps.admin_panel.urls')),
    
    # API redirects (to support existing client-side code)
    path('api/sessions/status/', RedirectView.as_view(url='/sessions/api/status/', permanent=False)),
    path('api/bookings/<int:booking_id>/', RedirectView.as_view(url='/sessions/api/bookings/%(booking_id)s/', permanent=False)),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
