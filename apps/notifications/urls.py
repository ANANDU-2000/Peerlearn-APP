"""
URL patterns for notifications API.
"""

from django.urls import path
from . import views

app_name = 'notifications'

urlpatterns = [
    # API endpoints
    path('', views.notifications_list, name='list'),
    path('<int:notification_id>/read/', views.mark_notification_read, name='mark_read'),
    path('read-all/', views.mark_all_read, name='mark_all_read'),
]