"""
URL patterns for the users app.
"""

from django.urls import path
from django.contrib.auth.views import LogoutView

from . import views

app_name = 'users'

urlpatterns = [
    # Authentication
    path('login/', views.login_view, name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('signup/selector/', views.auth_selector, name='auth_selector'),
    path('signup/learner/', views.learner_signup, name='learner_signup'),
    path('signup/mentor/', views.mentor_signup, name='mentor_signup'),
    
    # User profiles
    path('mentors/', views.MentorListView.as_view(), name='mentor_list'),
    path('mentors/<int:pk>/', views.MentorDetailView.as_view(), name='mentor_detail'),
    path('mentors/<int:pk>/rate/', views.rate_mentor, name='rate_mentor'),
    
    # Dashboards
    path('dashboard/learner/', views.learner_dashboard, name='learner_dashboard'),
    path('dashboard/mentor/', views.mentor_dashboard, name='mentor_dashboard'),
    path('dashboard/learner/activity/', views.learner_activity, name='learner_activity'),
    
    # Profile updates
    path('profile/learner/edit/', views.LearnerProfileUpdateView.as_view(), name='learner_profile_edit'),
    path('profile/mentor/edit/', views.MentorProfileUpdateView.as_view(), name='mentor_profile_edit'),
]
