"""
URL Configuration for peerlearn project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('apps.core.urls')),
    path('users/', include(('apps.users.urls', 'apps.users'), namespace='users')),
    path('sessions/', include(('apps.learning_sessions.urls', 'apps.learning_sessions'), namespace='sessions')),
    path('payments/', include(('apps.payments.urls', 'apps.payments'), namespace='payments')),
    path('dashboard/admin/', include('apps.admin_panel.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
