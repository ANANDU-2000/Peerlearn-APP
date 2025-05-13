"""
Role-based access control middleware for the PeerLearn platform.
"""
from django.contrib import messages
from django.shortcuts import redirect
from django.urls import reverse

class RoleMiddleware:
    """
    Middleware to restrict access to certain views based on user role.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return response

class MentorRequiredMiddleware:
    """
    Middleware to restrict access to mentor-only views.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Check if the URL starts with /dashboard/mentor
        if request.path.startswith('/dashboard/mentor'):
            # If user is not authenticated, redirect to login
            if not request.user.is_authenticated:
                messages.error(request, 'Please log in to access the mentor dashboard.')
                return redirect(reverse('users:login') + f'?next={request.path}')
            
            # If user is authenticated but not a mentor, redirect to appropriate dashboard
            if not request.user.is_mentor:
                messages.error(request, 'You do not have access to the mentor dashboard.')
                return redirect(request.user.get_dashboard_url())
        
        response = self.get_response(request)
        return response

class LearnerRequiredMiddleware:
    """
    Middleware to restrict access to learner-only views.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Check if the URL starts with /dashboard/learner
        if request.path.startswith('/dashboard/learner'):
            # If user is not authenticated, redirect to login
            if not request.user.is_authenticated:
                messages.error(request, 'Please log in to access the learner dashboard.')
                return redirect(reverse('users:login') + f'?next={request.path}')
            
            # If user is authenticated but not a learner, redirect to appropriate dashboard
            if not request.user.is_learner:
                messages.error(request, 'You do not have access to the learner dashboard.')
                return redirect(request.user.get_dashboard_url())
        
        response = self.get_response(request)
        return response