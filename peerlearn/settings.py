"""
Django settings for peerlearn project.
"""

import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-peerlearn-default-key-change-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'

ALLOWED_HOSTS = ['https://peerlearn-app-2.onrender.com/']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'channels',
    'rest_framework',
    'crispy_forms',
    'crispy_bootstrap4',
    
    # Local apps
    'apps.core',
    'apps.users',
    'apps.learning_sessions',
    'apps.payments',
    'apps.notifications',
    'apps.admin_panel',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Custom middleware for role-based access control
    'apps.users.middleware.MentorRequiredMiddleware',
    'apps.users.middleware.LearnerRequiredMiddleware',
    # Dashboard detection middleware
    'apps.core.middleware.DashboardDetectionMiddleware',
]

ROOT_URLCONF = 'peerlearn.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'peerlearn.wsgi.application'
ASGI_APPLICATION = 'peerlearn.asgi.application'

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Channel Layers Configuration
# Use in-memory channel layer for simplicity and reliability during development
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}

# Redis channel layer configuration (commented out for now - enable when Redis is available)
# CHANNEL_LAYERS = {
#     'default': {
#         'BACKEND': 'channels_redis.core.RedisChannelLayer',
#         'CONFIG': {
#             'hosts': [(os.getenv('REDIS_HOST', 'localhost'), 
#                       int(os.getenv('REDIS_PORT', 6379)))],
#         },
#     },
# }

# Cache configuration
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', 6379)}/1",
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Crispy Forms settings
CRISPY_TEMPLATE_PACK = 'bootstrap4'

# Custom User Model
AUTH_USER_MODEL = 'users.CustomUser'

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Login and redirect URLs
LOGIN_URL = 'users:login'
LOGIN_REDIRECT_URL = 'home'
LOGOUT_REDIRECT_URL = 'home'

# Razorpay settings
RAZORPAY_KEY_ID = os.getenv('rzp_test_OBy2Cmthx7Kq2U', '')
RAZORPAY_KEY_SECRET = os.getenv('2lZY4hGIgyf7D3qBop3LZeUy','')

# Celery settings
CELERY_BROKER_URL = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', 6379)}/0"
CELERY_RESULT_BACKEND = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', 6379)}/0"
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# WebRTC settings
STUN_SERVER = os.getenv('STUN_SERVER', 'stun:stun.l.google.com:19302')
TURN_SERVER = os.getenv('TURN_SERVER', '')
TURN_USERNAME = os.getenv('TURN_USERNAME', '')
TURN_CREDENTIAL = os.getenv('TURN_CREDENTIAL', '')

# CSRF settings
CSRF_TRUSTED_ORIGINS = [
    'https://peerlearn-app-2.onrender.com/',
    'https://*.replit.dev',
    'https://*.replit.app',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
]

