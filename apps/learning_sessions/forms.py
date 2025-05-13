"""
Forms for the learning_sessions app.
"""

from django import forms
from django.utils.translation import gettext_lazy as _

from .models import Session, SessionRequest, Booking

class SessionForm(forms.ModelForm):
    """Form for creating and updating sessions."""
    
    class Meta:
        model = Session
        fields = [
            'title', 'description', 'topics', 'schedule', 
            'duration', 'price', 'max_participants'
        ]
        widgets = {
            'schedule': forms.DateTimeInput(
                attrs={'type': 'datetime-local'},
                format='%Y-%m-%dT%H:%M'
            ),
            'topics': forms.TextInput(
                attrs={'placeholder': 'Enter topics separated by commas'}
            ),
            'description': forms.Textarea(
                attrs={'rows': 5, 'placeholder': 'Describe what will be covered in this session...'}
            ),
        }
        
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add CSS classes and other attributes for styling
        for field in self.fields.values():
            field.widget.attrs.update({
                'class': 'mt-1 block w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600'
            })


class SessionRequestForm(forms.ModelForm):
    """Form for requesting a custom session from a mentor."""
    
    class Meta:
        model = SessionRequest
        fields = [
            'title', 'domain', 'description', 
            'proposed_time', 'duration', 'budget'
        ]
        widgets = {
            'proposed_time': forms.DateTimeInput(
                attrs={'type': 'datetime-local'},
                format='%Y-%m-%dT%H:%M'
            ),
            'description': forms.Textarea(
                attrs={'rows': 4, 'placeholder': 'Describe what you would like to learn...'}
            ),
        }
        
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add CSS classes and other attributes for styling
        for field in self.fields.values():
            field.widget.attrs.update({
                'class': 'mt-1 block w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600'
            })


class FeedbackForm(forms.ModelForm):
    """Form for submitting feedback after a session."""
    
    rating = forms.IntegerField(
        min_value=1, 
        max_value=5, 
        widget=forms.NumberInput(attrs={'class': 'hidden', 'id': 'rating-value'})
    )
    
    feedback = forms.CharField(
        widget=forms.Textarea(
            attrs={
                'rows': 4, 
                'placeholder': 'Share your experience with this session...',
                'class': 'mt-1 block w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600'
            }
        ),
        required=False
    )
    
    class Meta:
        model = Booking
        fields = ['rating', 'feedback']