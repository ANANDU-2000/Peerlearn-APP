# PeerLearn Installation Guide

This guide provides step-by-step instructions for setting up the PeerLearn development and production environments.

## Prerequisites

- Python 3.10+
- PostgreSQL 14+
- Redis 6+
- Node.js and npm (for frontend assets)
- Git

## Development Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/peerlearn.git
cd peerlearn
```

### 2. Set Up Python Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

### 3. Install Python Dependencies

```bash
# Install core dependencies
pip install -r pip_requirements.txt
```

### 4. Set Up Environment Variables

Create a `.env` file in the project root directory with the following variables (adjust as needed):

```
# Django Settings
DEBUG=True
SECRET_KEY=your-secret-key-change-in-production
ALLOWED_HOSTS=localhost,127.0.0.1

# Database Configuration
DATABASE_URL=postgres://postgres:postgres@localhost:5432/peerlearn

# Redis Configuration
REDIS_URL=redis://localhost:6379/0

# Razorpay Configuration
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret

# Email Configuration
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@example.com
EMAIL_HOST_PASSWORD=your-email-password
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=PeerLearn <noreply@peerlearn.com>
```

### 5. Initialize the Database

```bash
# Run migrations
python manage.py migrate

# Create a superuser
python manage.py createsuperuser
```

### 6. Start the Development Server

```bash
# Start the Daphne server for ASGI (Channels/WebSockets)
python -m daphne -b 0.0.0.0 -p 5000 peerlearn.asgi:application
```

### 7. Start Celery (in a separate terminal)

```bash
# Start Celery worker
celery -A peerlearn worker -l info

# Start Celery beat (for scheduled tasks, optional)
celery -A peerlearn beat -l info
```

## Frontend Development Setup

### 1. Install Node.js Dependencies (if applicable)

```bash
npm install
```

### 2. Build Frontend Assets (if applicable)

```bash
npm run build
```

## Production Deployment

### 1. Using Docker Compose

```bash
# Build and start containers
docker-compose up -d --build

# Run migrations
docker-compose exec web python manage.py migrate

# Create superuser
docker-compose exec web python manage.py createsuperuser

# Collect static files
docker-compose exec web python manage.py collectstatic --no-input
```

### 2. Manual Production Setup

#### Install Required System Packages

```bash
sudo apt update
sudo apt install -y python3-pip python3-dev libpq-dev postgresql postgresql-contrib nginx redis-server
```

#### Set Up PostgreSQL

```bash
sudo -u postgres psql

# In PostgreSQL prompt
CREATE DATABASE peerlearn;
CREATE USER peerlearnuser WITH PASSWORD 'your_password';
ALTER ROLE peerlearnuser SET client_encoding TO 'utf8';
ALTER ROLE peerlearnuser SET default_transaction_isolation TO 'read committed';
ALTER ROLE peerlearnuser SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE peerlearn TO peerlearnuser;
\q
```

#### Set Up Python Environment and Application

```bash
# Create directory
sudo mkdir -p /var/www/peerlearn
sudo chown -R $USER:$USER /var/www/peerlearn

# Clone repository
git clone https://github.com/yourusername/peerlearn.git /var/www/peerlearn

# Create virtual environment
cd /var/www/peerlearn
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r pip_requirements.txt
pip install gunicorn

# Configure environment variables
# Create .env file with production settings

# Collect static files
python manage.py collectstatic --no-input

# Run migrations
python manage.py migrate
```

#### Configure Nginx

Create an Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/peerlearn
```

Add the following configuration (adjust as needed):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location = /favicon.ico { access_log off; log_not_found off; }
    
    location /static/ {
        root /var/www/peerlearn;
    }

    location /media/ {
        root /var/www/peerlearn;
    }

    location / {
        include proxy_params;
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/peerlearn /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl restart nginx
```

#### Set Up Supervisor

Create supervisor configuration:

```bash
sudo nano /etc/supervisor/conf.d/peerlearn.conf
```

Add the following configuration:

```ini
[program:peerlearn]
command=/var/www/peerlearn/venv/bin/daphne -b 0.0.0.0 -p 5000 peerlearn.asgi:application
directory=/var/www/peerlearn
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/peerlearn/daphne.log
environment=DJANGO_SETTINGS_MODULE="peerlearn.settings",DEBUG="False"

[program:peerlearn-celery]
command=/var/www/peerlearn/venv/bin/celery -A peerlearn worker -l info
directory=/var/www/peerlearn
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/peerlearn/celery.log
environment=DJANGO_SETTINGS_MODULE="peerlearn.settings",DEBUG="False"

[program:peerlearn-celerybeat]
command=/var/www/peerlearn/venv/bin/celery -A peerlearn beat -l info
directory=/var/www/peerlearn
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/peerlearn/celerybeat.log
environment=DJANGO_SETTINGS_MODULE="peerlearn.settings",DEBUG="False"
```

Create log directory and update permissions:

```bash
sudo mkdir -p /var/log/peerlearn
sudo chown -R www-data:www-data /var/log/peerlearn
sudo chown -R www-data:www-data /var/www/peerlearn
```

Start supervisor:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status
```

#### Set Up SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failures**
   - Check that Daphne is running
   - Verify ASGI configuration
   - Check firewall settings
   - Ensure proper Nginx configuration for WebSockets

2. **Database Connection Issues**
   - Verify PostgreSQL is running
   - Check database credentials
   - Ensure database exists

3. **Redis Connection Issues**
   - Verify Redis is running
   - Check Redis connection settings

4. **Celery Not Processing Tasks**
   - Check Celery worker is running
   - Verify Redis configuration
   - Check for task errors in logs

### Useful Commands

```bash
# Check logs
tail -f /var/log/peerlearn/daphne.log
tail -f /var/log/peerlearn/celery.log

# Restart services
sudo supervisorctl restart peerlearn
sudo supervisorctl restart peerlearn-celery

# Check Nginx status
sudo systemctl status nginx

# Test Nginx configuration
sudo nginx -t
```

## Maintenance

### Updating the Application

```bash
# Pull latest changes
cd /var/www/peerlearn
git pull

# Activate virtual environment
source venv/bin/activate

# Install new dependencies
pip install -r pip_requirements.txt

# Apply migrations
python manage.py migrate

# Collect static files if needed
python manage.py collectstatic --no-input

# Restart services
sudo supervisorctl restart peerlearn
sudo supervisorctl restart peerlearn-celery
sudo supervisorctl restart peerlearn-celerybeat
```

### Database Backups

```bash
# Backup PostgreSQL database
pg_dump -U postgres -d peerlearn > peerlearn_backup_$(date +%Y%m%d).sql

# Restore from backup
psql -U postgres -d peerlearn < peerlearn_backup.sql
```