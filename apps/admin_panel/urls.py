"""
URL patterns for the admin panel app.
"""

from django.urls import path
from . import views

app_name = 'admin_panel'

urlpatterns = [
    # Dashboard overview
    path('', views.admin_overview, name='overview'),
    
    # User management
    path('users/', views.admin_users, name='users'),
    path('users/<int:user_id>/', views.admin_user_detail, name='user_detail'),
    path('users/<int:user_id>/toggle-status/', views.admin_toggle_user_status, name='toggle_user_status'),
    
    # Session management
    path('sessions/', views.admin_sessions, name='sessions'),
    path('sessions/<int:session_id>/', views.admin_session_detail, name='session_detail'),
    
    # Payment management
    path('payments/', views.admin_payments, name='payments'),
    path('payouts/create/', views.admin_create_payout, name='create_payout'),
    path('payouts/<int:payout_id>/complete/', views.admin_mark_payout_complete, name='mark_payout_complete'),
    
    # Feedback management
    path('feedback/', views.admin_feedback, name='feedback'),
    path('feedback/<int:rating_id>/delete/', views.admin_delete_rating, name='delete_rating'),
]
