<<<<<<< HEAD
# PeerLearn - Advanced One-to-One EdTech Platform

PeerLearn is a premium, personalized one-to-one live EdTech platform enabling intelligent digital learning interactions, with a focus on professional skill development and knowledge transfer.

## Overview

PeerLearn connects learners with mentors through a real-time platform that facilitates personalized learning experiences. The platform supports video conferencing, session booking, payments, ratings, and more.

## Key Features

- **User Roles**: Learner, Mentor, Admin with distinct dashboards and permissions
- **Real-time Communication**: WebRTC for video conferencing and WebSockets for live updates
- **Session Management**: Create, search, book, and manage learning sessions
- **Payment Processing**: Integrated with Razorpay for secure transactions
- **Recommendation System**: ML-powered mentor recommendations
- **Notifications**: Real-time updates and alerts
- **Analytics**: Comprehensive dashboards for users and administrators

## Technology Stack

- **Backend**: Django 4.2, Django REST Framework, Django Channels
- **Database**: SQLite3 (development), PostgreSQL (production)
- **Real-time**: Redis, WebSockets, Channels
- **Frontend**: Tailwind CSS, Alpine.js, JavaScript
- **Video Conferencing**: WebRTC
- **Background Tasks**: Celery
- **Payment Gateway**: Razorpay
- **Caching**: Redis

## Models & APIs

### Core Models

1. **CustomUser**
   - Extended Django User model
   - Supports multiple roles (learner, mentor, admin)
   - Profile information, expertise, experience, etc.

2. **Session**
   - Learning session details
   - Title, description, schedule, duration
   - Pricing, capacity, status

3. **Booking**
   - Session booking information
   - Payment status, attendance, feedback

4. **SessionRequest**
   - Session requests from learners to mentors
   - Proposed times, topics, budget

5. **Payment**
   - Payment records for session bookings
   - Transaction details, status, refund information

6. **MentorPayout**
   - Payout records for mentors
   - Amount, status, transaction details

7. **Notification**
   - User notifications
   - Support for different notification types

### API Endpoints

#### Users API
- `/users/api/check-email/` - Check if email exists
- `/users/dashboard/learner/` - Learner dashboard
- `/users/dashboard/mentor/` - Mentor dashboard
- `/users/mentors/` - List mentors
- `/users/mentors/<pk>/` - Mentor profile
- `/users/mentors/<pk>/rate/` - Rate mentor

#### Sessions API
- `/sessions/create/` - Create session
- `/sessions/create/advanced/` - Advanced session creation
- `/sessions/api/status/` - Session status updates
- `/sessions/<session_id>/` - Session details
- `/sessions/<session_id>/edit/` - Edit session
- `/sessions/<session_id>/publish/` - Publish session
- `/sessions/<session_id>/cancel/` - Cancel session
- `/sessions/join/<code>/` - Join live session

#### Bookings API
- `/sessions/book/<session_id>/` - Book session
- `/sessions/api/bookings/<booking_id>/` - Booking details
- `/sessions/api/bookings/<booking_id>/cancel/` - Cancel booking

#### Payments API
- `/payments/process/<booking_id>/` - Process payment
- `/payments/success/` - Payment success callback
- `/payments/webhook/` - Payment gateway webhook

#### Notifications API
- `/users/api/notifications/` - List notifications
- `/users/api/notifications/<id>/read/` - Mark notification as read
- `/users/api/notifications/read-all/` - Mark all notifications as read

## Real-time Flows (WebSocket Channels)

### WebSocket Channels

1. **Dashboard Channel** (`/ws/dashboard/<user_id>/`)
   - Real-time dashboard updates
   - Session status changes
   - Earnings updates
   - Booking notifications

2. **Notification Channel** (`/ws/notifications/<user_id>/`)
   - New notifications delivery
   - Notification count updates
   - Read status synchronization

3. **Session Channel** (`/ws/session/<room_code>/`)
   - WebRTC signaling for video/audio
   - Session status updates
   - Chat messages
   - Participant presence

### WebRTC Room Details

The WebRTC implementation in PeerLearn enables real-time video and audio communication between learners and mentors:

1. **Signaling Process**:
   - Uses Django Channels WebSocket for signaling
   - Handles SDP offer/answer exchange
   - Manages ICE candidates
   - Supports reconnection on network change

2. **Media Handling**:
   - Video constraints with quality fallbacks
   - Audio processing with echo cancellation
   - Screen sharing capability
   - Camera/microphone toggle controls

3. **Room Features**:
   - Participant list with status indicators
   - Connection quality monitoring
   - Real-time chat alongside video
   - Waiting room/lobby system
   - Session timer and notifications

4. **Error Handling**:
   - Media permission detection and guidance
   - Network interruption recovery
   - Browser compatibility checks
   - Fallback to audio-only when needed

## ML Recommendation Integration

PeerLearn implements a recommendation system to suggest mentors to learners:

1. **Features Used**:
   - Learner interests and search history
   - Mentor expertise and ratings
   - Session completion data
   - Topical relevance

2. **Algorithm**:
   - Collaborative filtering approach
   - Content-based similarity matching
   - Weighted rating calculations
   - Recency and popularity factors

3. **Implementation**:
   - Scheduled background task via Celery
   - Redis-cached recommendation results
   - API endpoints for recommendation retrieval
   - Feedback loop to improve suggestions

## Admin Setup & Credentials

To access the admin interface:

1. Create a superuser:
   ```
   python manage.py createsuperuser
   ```

2. Access the admin panel at `/admin/`

3. Default admin sections:
   - Users Management
   - Sessions & Bookings
   - Payments & Payouts
   - System Configuration
   - Analytics Dashboard

## Running the Project

### Prerequisites
- Python 3.10+
- Redis server
- Node.js and npm (for frontend asset compilation)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/peerlearn.git
   cd peerlearn
   ```

2. Create and activate a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```
   python -m pip install -r requirements.txt
   ```

4. Set up environment variables (create a `.env` file):
   ```
   DEBUG=True
   SECRET_KEY=your-secret-key
   RAZORPAY_KEY_ID=your-razorpay-key
   RAZORPAY_KEY_SECRET=your-razorpay-secret
   ```

5. Run migrations:
   ```
   python manage.py migrate
   ```

6. Create a superuser:
   ```
   python manage.py createsuperuser
   ```

7. Start the development server:
   ```
   python -m daphne -b 0.0.0.0 -p 5000 peerlearn.asgi:application
   ```

8. In a separate terminal, start Celery worker:
   ```
   celery -A peerlearn worker -l info
   ```

9. Access the application at `http://localhost:5000`

### Docker Deployment

1. Build and start the containers:
   ```
   docker-compose up -d --build
   ```

2. Run migrations:
   ```
   docker-compose exec web python manage.py migrate
   ```

3. Create a superuser:
   ```
   docker-compose exec web python manage.py createsuperuser
   ```

4. Access the application at `http://localhost:5000`

## Security Notes

1. **CSRF Protection**
   - Django's built-in CSRF protection is enabled
   - All forms and AJAX requests include CSRF tokens
   - Custom middleware validates tokens on sensitive operations

2. **Role-based Authorization**
   - Custom middleware checks role permissions
   - URL patterns are protected by role requirements
   - Template rendering is conditional on role access

3. **Two-Factor Authentication**
   - Optional 2FA for all users
   - SMS or authenticator app verification
   - Recovery codes provided for backup access

4. **Input Validation**
   - Form validation on both frontend and backend
   - Content sanitization for user-generated content
   - Rate limiting for sensitive operations

5. **Payment Security**
   - All payment processing handled via Razorpay
   - No card details stored on servers
   - Webhook verification using cryptographic signatures

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Django and DRF for the amazing web framework
- Tailwind CSS and Alpine.js for streamlined frontend development
- The open source community for the countless libraries that make this possible
=======
# Peerlearn-APP
Edtech App 
>>>>>>> 7da94adce6b7ff2cc537dc5b41fa83f8875c5eee
