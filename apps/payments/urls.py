"""
URL patterns for the payments app.
"""

from django.urls import path
from . import views

app_name = 'payments'

urlpatterns = [
    # Payment creation and processing
    path('create/<int:booking_id>/', views.payment_create, name='payment_create'),
    path('detail/<int:payment_id>/', views.payment_detail, name='payment_detail'),
    path('success/<int:payment_id>/', views.payment_success, name='payment_success'),
    
    # Webhooks
    path('webhook/', views.payment_webhook, name='payment_webhook'),
    
    # Refunds
    path('refund/<int:payment_id>/', views.initiate_refund, name='initiate_refund'),
    
    # Earnings
    path('earnings/', views.mentor_earnings, name='mentor_earnings'),
    path('earnings/download/', views.download_earnings_csv, name='download_earnings_csv'),
]
