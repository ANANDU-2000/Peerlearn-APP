"""
Middleware for PeerLearn application.
"""
from django.urls import resolve, Resolver404


class DashboardDetectionMiddleware:
    """
    Middleware to detect if the current request is from a dashboard.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Default value
        request.is_dashboard = False
        
        # First check referer path if available
        referer = request.META.get('HTTP_REFERER', '')
        if 'dashboard' in referer:
            request.is_dashboard = True
        
        # Then check request path
        path = request.path
        if 'dashboard' in path:
            request.is_dashboard = True
            
        # Also check if the tab parameter is present (used in dashboard views)
        if 'tab' in request.GET:
            request.is_dashboard = True
            
        # Process request
        response = self.get_response(request)
        return response