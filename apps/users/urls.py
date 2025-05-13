"""
URL patterns for the users app.
"""

from django.urls import path
from django.contrib.auth import views as auth_views
from .views import login_view, signup_view, auth_selector

app_name = 'users'

urlpatterns = [
    path('login/', login_view, name='login'),
    path('signup/', signup_view, name='signup'),
    path('signup/learner/', signup_view, {'user_type': 'learner'}, name='signup_learner'),
    path('signup/mentor/', signup_view, {'user_type': 'mentor'}, name='signup_mentor'),
    path('signup-selector/', auth_selector, name='auth_selector'),
    path('mentors/', auth_selector, name='mentor_list'),  # Temporary stub for mentor list
]