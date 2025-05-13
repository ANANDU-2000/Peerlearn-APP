"""
Views for the users app.
"""

from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login
from django.contrib import messages

def login_view(request):
    """Login view."""
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('home')
        else:
            messages.error(request, 'Invalid username or password')
    return render(request, 'users/login.html')

def signup_view(request, user_type=None):
    """Signup view with user type selection."""
    context = {'user_type': user_type}
    return render(request, 'users/signup.html', context)

def auth_selector(request):
    """Authentication selector view."""
    return render(request, 'users/auth_selector.html')