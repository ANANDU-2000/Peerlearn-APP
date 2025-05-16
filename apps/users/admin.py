"""
Admin configuration for the users app.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _

from .models import CustomUser, UserRating

class CustomUserAdmin(UserAdmin):
    """Admin configuration for the CustomUser model."""
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_staff')
    list_filter = ('role', 'is_staff', 'is_active', 'date_joined')
    
    fieldsets = (
    (None, {'fields': ('username', 'password')}),
    (_('Personal info'), {'fields': ('first_name', 'last_name', 'email', 'bio', 'profile_picture')}),
    (_('Role and permissions'), {
        'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
    }),
    (_('Important dates'), {'fields': ('last_login', 'date_joined')}),
    (_('Learner fields'), {'fields': ('interests', 'career_goal'), 'classes': ('collapse',)}),
    (_('Mentor fields'), {'fields': ('expertise', 'skills', 'intro_video'), 'classes': ('collapse',)}),
    (_('Contact info'), {'fields': ('phone_number',)}),
)
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2', 'role'),
        }),
    )
    
    search_fields = ('username', 'first_name', 'last_name', 'email')
    ordering = ('username',)

class UserRatingAdmin(admin.ModelAdmin):
    """Admin configuration for the UserRating model."""
    list_display = ('mentor', 'learner', 'rating', 'created_at')
    list_filter = ('rating', 'created_at')
    search_fields = ('mentor__username', 'learner__username', 'review')
    ordering = ('-created_at',)

admin.site.register(CustomUser, CustomUserAdmin)
admin.site.register(UserRating, UserRatingAdmin)
