"""
Forms for user authentication, registration and profile management.
"""

from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.core.validators import MaxValueValidator, MinValueValidator

from .models import CustomUser, UserRating

class UserLoginForm(forms.Form):
    """Form for user login."""
    email = forms.EmailField(widget=forms.EmailInput(attrs={
        'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600',
        'placeholder': 'Email'
    }))
    
    password = forms.CharField(widget=forms.PasswordInput(attrs={
        'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600',
        'placeholder': 'Password'
    }))

class LearnerSignUpForm(UserCreationForm):
    """Form for learner registration."""
    email = forms.EmailField(required=True)
    interests = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'placeholder': 'e.g. Programming, Mathematics, Science'
        }),
        help_text='Comma-separated list of interests'
    )
    career_goal = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'placeholder': 'e.g. Software Engineer, Data Scientist'
        })
    )
    profile_picture = forms.ImageField(required=False)
    
    class Meta:
        model = CustomUser
        fields = ['username', 'email', 'first_name', 'last_name', 
                 'password1', 'password2', 'interests', 'career_goal', 
                 'profile_picture', 'bio']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add Tailwind CSS classes to all widgets
        for field_name, field in self.fields.items():
            if isinstance(field.widget, forms.TextInput) or \
               isinstance(field.widget, forms.EmailInput) or \
               isinstance(field.widget, forms.PasswordInput):
                field.widget.attrs.update({
                    'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600'
                })
    
    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data['email']
        
        # Convert interests string to list
        interests_str = self.cleaned_data.get('interests', '')
        if interests_str:
            user.interests = [interest.strip() for interest in interests_str.split(',')]
        
        if commit:
            user.save()
        return user

class MentorSignUpForm(UserCreationForm):
    """Form for mentor registration."""
    email = forms.EmailField(required=True)
    expertise = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'placeholder': 'e.g. Python, Web Development, Machine Learning'
        }),
        help_text='Comma-separated list of expertise areas'
    )
    skills = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'placeholder': 'e.g. Django, React, TensorFlow'
        }),
        help_text='Comma-separated list of skills'
    )
    intro_video = forms.URLField(
        required=False,
        widget=forms.URLInput(attrs={
            'placeholder': 'YouTube, Vimeo or other video URL'
        })
    )
    phone_number = forms.CharField(
        required=False,
        max_length=15,
        widget=forms.TextInput(attrs={
            'placeholder': '+1 (555) 123-4567'
        }),
        help_text='Your contact number (will not be shared with learners)'
    )
    profile_picture = forms.ImageField(required=True)
    
    class Meta:
        model = CustomUser
        fields = ['username', 'email', 'first_name', 'last_name', 
                 'password1', 'password2', 'expertise', 'skills', 
                 'phone_number', 'intro_video', 'profile_picture', 'bio']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add Tailwind CSS classes to all widgets
        for field_name, field in self.fields.items():
            if isinstance(field.widget, forms.TextInput) or \
               isinstance(field.widget, forms.EmailInput) or \
               isinstance(field.widget, forms.PasswordInput) or \
               isinstance(field.widget, forms.URLInput):
                field.widget.attrs.update({
                    'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600'
                })
    
    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data['email']
        
        # Set the user role as mentor
        user.role = 'mentor'
        
        # Convert expertise and skills strings to lists
        expertise_str = self.cleaned_data.get('expertise', '')
        if expertise_str:
            user.expertise = [exp.strip() for exp in expertise_str.split(',') if exp.strip()]
        
        skills_str = self.cleaned_data.get('skills', '')
        if skills_str:
            user.skills = [skill.strip() for skill in skills_str.split(',') if skill.strip()]
        
        # Save phone number
        phone_number = self.cleaned_data.get('phone_number', '')
        if phone_number:
            user.phone_number = phone_number
        
        # Save intro video
        intro_video = self.cleaned_data.get('intro_video', '')
        if intro_video:
            user.intro_video = intro_video
            
        # Save bio
        bio = self.cleaned_data.get('bio', '')
        if bio:
            user.bio = bio
        
        if commit:
            user.save()
        return user

class LearnerProfileForm(forms.ModelForm):
    """Form for updating learner profile."""
    interests = forms.CharField(
        required=False,
        widget=forms.TextInput(),
        help_text='Comma-separated list of interests'
    )
    
    class Meta:
        model = CustomUser
        fields = ['first_name', 'last_name', 'bio', 'interests', 
                 'career_goal', 'profile_picture', 'phone_number']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Convert interests list to comma-separated string
        if self.instance.interests:
            self.initial['interests'] = ', '.join(self.instance.interests)
        
        # Add Tailwind CSS classes to all widgets
        for field_name, field in self.fields.items():
            if isinstance(field.widget, forms.TextInput) or \
               isinstance(field.widget, forms.EmailInput) or \
               isinstance(field.widget, forms.URLInput):
                field.widget.attrs.update({
                    'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600'
                })
            elif isinstance(field.widget, forms.Textarea):
                field.widget.attrs.update({
                    'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600',
                    'rows': 4
                })
    
    def save(self, commit=True):
        user = super().save(commit=False)
        
        # Convert interests string to list
        interests_str = self.cleaned_data.get('interests', '')
        if interests_str:
            user.interests = [interest.strip() for interest in interests_str.split(',')]
        else:
            user.interests = []
        
        if commit:
            user.save()
        return user

class MentorProfileForm(forms.ModelForm):
    """Form for updating mentor profile."""
    expertise = forms.CharField(
        required=False,
        widget=forms.TextInput(),
        help_text='Comma-separated list of expertise areas'
    )
    skills = forms.CharField(
        required=False,
        widget=forms.TextInput(),
        help_text='Comma-separated list of skills'
    )
    
    class Meta:
        model = CustomUser
        fields = ['first_name', 'last_name', 'bio', 'expertise', 
                 'skills', 'intro_video', 'profile_picture', 'phone_number']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Convert expertise and skills lists to comma-separated strings
        if self.instance.expertise:
            self.initial['expertise'] = ', '.join(self.instance.expertise)
        if self.instance.skills:
            self.initial['skills'] = ', '.join(self.instance.skills)
        
        # Add Tailwind CSS classes to all widgets
        for field_name, field in self.fields.items():
            if isinstance(field.widget, forms.TextInput) or \
               isinstance(field.widget, forms.EmailInput) or \
               isinstance(field.widget, forms.URLInput):
                field.widget.attrs.update({
                    'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600'
                })
            elif isinstance(field.widget, forms.Textarea):
                field.widget.attrs.update({
                    'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600',
                    'rows': 4
                })
    
    def save(self, commit=True):
        user = super().save(commit=False)
        
        # Convert expertise and skills strings to lists
        expertise_str = self.cleaned_data.get('expertise', '')
        if expertise_str:
            user.expertise = [exp.strip() for exp in expertise_str.split(',')]
        else:
            user.expertise = []
        
        skills_str = self.cleaned_data.get('skills', '')
        if skills_str:
            user.skills = [skill.strip() for skill in skills_str.split(',')]
        else:
            user.skills = []
        
        if commit:
            user.save()
        return user

class RatingForm(forms.ModelForm):
    """Form for rating mentors."""
    rating = forms.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        widget=forms.NumberInput(attrs={
            'class': 'w-20 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600',
            'min': 1,
            'max': 5
        })
    )
    
    class Meta:
        model = UserRating
        fields = ['rating', 'review']
        widgets = {
            'review': forms.Textarea(attrs={
                'class': 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600',
                'rows': 3,
                'placeholder': 'Share your experience with this mentor'
            })
        }
