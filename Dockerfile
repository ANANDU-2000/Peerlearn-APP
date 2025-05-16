# Use official Python base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set working directory inside container
WORKDIR /app

# Install system dependencies (optional, helpful for psycopg2 etc.)
RUN apt-get update && apt-get install -y build-essential libpq-dev

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy Django project (inside app/)
COPY ./app /app

# Set environment variables (adjust your settings module if needed)
ENV DJANGO_SETTINGS_MODULE=peerlearn.settings

# Run migrations, collect static files, and start app
CMD ["bash", "-c", "python manage.py migrate && python manage.py collectstatic --noinput && gunicorn peerlearn.wsgi:application --bind 0.0.0.0:$PORT"]
