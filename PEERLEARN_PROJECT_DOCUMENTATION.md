# PeerLearn Project Documentation

## 1. Entity Relationship Diagram (ERD)

```
+----------------+         +----------------+         +----------------+
|    CustomUser  |         |     Session    |         |     Booking    |
+----------------+         +----------------+         +----------------+
| id             |<-------->| id            |<-------->| id            |
| username       |         | mentor (FK)    |         | session (FK)   |
| email          |         | title          |         | learner (FK)   |
| password       |         | description    |         | status         |
| role           |         | topics (JSON)  |         | created_at     |
| profile_picture|         | schedule       |         | updated_at     |
| bio            |         | duration       |         | feedback_subm. |
| interests      |         | price          |         | cancel_reason  |
| career_goal    |         | room_code      |         +----------------+
| expertise      |         | status         |                |
| skills         |         | max_participants|                |
| intro_video    |         | created_at     |                |
| phone_number   |         | updated_at     |                |
| date_updated   |         | live_started_at|                |
+----------------+         +----------------+                |
       |  |                        |                         |
       |  |                        |                         |
       |  |  +------------------+  |                         |
       |  |  |  SessionRequest  |  |                         |
       |  +->+------------------+  |                         |
       |     | id               |  |                         |
       +---->| learner (FK)     |  |                         |
             | mentor (FK)      |  |                         |
             | title            |  |                         |
             | domain (FK)      |  |                         |
             | description      |  |                         |
             | proposed_time    |  |                         |
             | duration         |  |                         |
             | budget           |  |                         |
             | status           |  |                         |
             | mentor_notes     |  |                         |
             | counter_offer    |  |                         |
             | counter_time     |  |                         |
             | is_free          |  |                         |
             | created_at       |  |                         |
             | updated_at       |  |                         |
             +------------------+  |                         |
                     |             |                         |
                     |             |                         |
                     v             v                         v
             +----------------+    |    +------------------+
             |     Domain     |    |    |     Payment      |
             +----------------+    |    +------------------+
             | id             |    |    | id               |
             | name           |    |    | booking (FK)     |
             | description    |    |    | amount           |
             | icon           |    |    | razorpay_order_id|
             | created_at     |    |    | razorpay_payment_|
             +----------------+    |    | razorpay_sig     |
                                   |    | status           |
                                   |    | created_at       |
                                   |    | updated_at       |
                                   |    | currency         |
                                   |    | mentor_share     |
                                   |    | platform_fee     |
                                   |    | refund_reason    |
                                   |    +------------------+
                                   |             |
                                   |             |
           +----------------+      |             |
           |   UserRating   |      |             |
           +----------------+      |             |
           | id             |      |             |
           | mentor (FK)    |<-----+             |
           | learner (FK)   |                    |
           | rating         |                    |
           | review         |                    |
           | created_at     |                    v
           +----------------+          +------------------+
                                      |   MentorPayout    |
                                      +------------------+
                                      | id               |
                                      | mentor (FK)      |
                                      | amount           |
                                      | payments (M2M)   |
                                      | status           |
                                      | payout_id        |
                                      | created_at       |
                                      | processed_at     |
                                      | notes            |
                                      +------------------+

+----------------+
|  Notification  |
+----------------+
| id             |
| user (FK)      |
| title          |
| message        |
| link           |
| notif_type     |
| reference_id   |
| read           |
| created_at     |
+----------------+
```

## 2. Database Schema

### CustomUser
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| username         | CharField     | User's username                                   |
| email            | EmailField    | User's email address                              |
| password         | CharField     | Hashed password                                   |
| role             | CharField     | User role (learner, mentor, admin)                |
| profile_picture  | ImageField    | User's profile picture                            |
| bio              | TextField     | User's biography/description                      |
| interests        | JSONField     | Topics the learner is interested in               |
| career_goal      | CharField     | Career goal for learners                          |
| expertise        | JSONField     | Areas of expertise for mentors                    |
| skills           | JSONField     | Skills that the mentor possesses                  |
| intro_video      | URLField      | URL to mentor's introduction video                |
| phone_number     | CharField     | Contact phone number                              |
| date_updated     | DateTimeField | Last update timestamp                             |

### Domain
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| name             | CharField     | Name of the domain/category                       |
| description      | TextField     | Description of the domain                         |
| icon             | CharField     | Icon identifier for UI display                    |
| created_at       | DateTimeField | Creation timestamp                                |

### Session
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| mentor           | ForeignKey    | Reference to mentor (CustomUser)                  |
| title            | CharField     | Session title                                     |
| description      | TextField     | Detailed description of the session               |
| topics           | JSONField     | List of topics to be covered                      |
| schedule         | DateTimeField | Scheduled date and time                           |
| duration         | IntegerField  | Duration in minutes                               |
| price            | DecimalField  | Session price (0 for free)                        |
| room_code        | UUIDField     | Unique code for WebRTC room                       |
| status           | CharField     | Status (scheduled, live, completed, cancelled)    |
| max_participants | IntegerField  | Maximum allowed participants                      |
| created_at       | DateTimeField | Creation timestamp                                |
| updated_at       | DateTimeField | Last update timestamp                             |
| live_started_at  | DateTimeField | When session went live                            |

### SessionRequest
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| learner          | ForeignKey    | Reference to learner (CustomUser)                 |
| mentor           | ForeignKey    | Reference to mentor (CustomUser)                  |
| title            | CharField     | Requested session title                           |
| domain           | ForeignKey    | Reference to knowledge domain                     |
| description      | TextField     | Detailed description of request                   |
| proposed_time    | DateTimeField | Proposed date and time                            |
| duration         | IntegerField  | Proposed duration in minutes                      |
| budget           | DecimalField  | Learner's budget for the session                  |
| status           | CharField     | Status (pending, offered, accepted, declined)     |
| mentor_notes     | TextField     | Notes from mentor regarding the request           |
| counter_offer    | DecimalField  | Counter offer price from mentor                   |
| counter_time     | DateTimeField | Counter proposed time from mentor                 |
| is_free          | BooleanField  | Whether offered for free                          |
| created_at       | DateTimeField | Creation timestamp                                |
| updated_at       | DateTimeField | Last update timestamp                             |

### Booking
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| session          | ForeignKey    | Reference to the session                          |
| learner          | ForeignKey    | Reference to learner (CustomUser)                 |
| status           | CharField     | Status (pending, confirmed, cancelled, completed) |
| created_at       | DateTimeField | Creation timestamp                                |
| updated_at       | DateTimeField | Last update timestamp                             |
| cancellation_reason | TextField  | Reason for cancellation if cancelled              |
| feedback_submitted | BooleanField | Whether feedback has been submitted              |

### Payment
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| booking          | OneToOneField | Reference to the booking                          |
| amount           | DecimalField  | Payment amount                                    |
| razorpay_order_id | CharField    | Razorpay order ID                                 |
| razorpay_payment_id | CharField  | Razorpay payment ID                               |
| razorpay_signature | CharField   | Razorpay signature for verification               |
| status           | CharField     | Status (initiated, paid, failed, refunded)        |
| created_at       | DateTimeField | Creation timestamp                                |
| updated_at       | DateTimeField | Last update timestamp                             |
| currency         | CharField     | Currency code (default: INR)                      |
| mentor_share     | DecimalField  | Amount to be paid to mentor (85%)                 |
| platform_fee     | DecimalField  | Platform fee amount (15%)                         |
| refund_reason    | TextField     | Reason for refund if refunded                     |

### MentorPayout
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| mentor           | ForeignKey    | Reference to mentor (CustomUser)                  |
| amount           | DecimalField  | Payout amount                                     |
| payments         | ManyToManyField | Reference to payments included in payout        |
| status           | CharField     | Status (pending, completed, failed)               |
| payout_id        | CharField     | Payout ID from payment processor                  |
| created_at       | DateTimeField | Creation timestamp                                |
| processed_at     | DateTimeField | Processing timestamp                              |
| notes            | TextField     | Additional notes about payout                     |

### UserRating
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| mentor           | ForeignKey    | Reference to mentor (CustomUser)                  |
| learner          | ForeignKey    | Reference to learner (CustomUser)                 |
| rating           | IntegerField  | Rating value (1-5)                                |
| review           | TextField     | Review comments                                   |
| created_at       | DateTimeField | Creation timestamp                                |

### Notification
| Column           | Type          | Description                                       |
|------------------|---------------|---------------------------------------------------|
| id               | AutoField     | Primary key                                       |
| user             | ForeignKey    | Reference to user (CustomUser)                    |
| title            | CharField     | Notification title                                |
| message          | TextField     | Notification message                              |
| link             | CharField     | Link for action/redirect                          |
| notification_type | CharField    | Type (info, success, warning, error)              |
| reference_id     | IntegerField  | Optional reference to related object              |
| read             | BooleanField  | Whether notification has been read                |
| created_at       | DateTimeField | Creation timestamp                                |

## 3. Data Flow Diagrams (DFD)

### Level 0 DFD (Context Diagram)
```
                                   +----------------------+
                                   |                      |
          +----------------+       |                      |       +----------------+
          |                |  Auth |                      | Payouts|                |
          |                |------>|                      |------->|                |
          |    Learner     |       |                      |        |     Mentor     |
          |                |Session|     PeerLearn        |Session |                |
          |                |<------|                      |<-------|                |
          +----------------+       |     Platform         |        +----------------+
                 |                 |                      |               ^
                 |  Payments      |                      |               |
                 v                 |                      |     Ratings  |
          +----------------+       |                      |              |
          |                |       |                      |              |
          |   Razorpay     |<----->|                      |<-------------+
          |                |       |                      |
          +----------------+       +----------------------+
```

### Level 1 DFD
```
                             +-------------------+
                             |Authentication     |
                             |System             |
                             +-------------------+
                                    ^   |
                                    |   |
                                    |   v
+----------------+            +------------------+            +----------------+
|                |  Session   |                  |  Session   |                |
|                |  Request   |                  |  Creation  |                |
|    Learner     |----------->|    Session       |<-----------|    Mentor      |
|                |            |    Management    |            |                |
|                |<-----------|                  |----------->|                |
+----------------+  Session   +------------------+  Session   +----------------+
        |          Booking            |  ^         Status          |
        |                             |  |                         |
        v                             v  |                         v
+----------------+            +------------------+           +-----------------+
|                |  Payment   |                  |  Payout   |                 |
|    Payment     |<-----------|    Payment       |---------->|  Rating &       |
|    Gateway     |            |    Processing    |           |  Feedback       |
|                |----------->|                  |<----------|                 |
+----------------+  Status    +------------------+  Rating   +-----------------+
                                    |  ^
                                    |  |
                                    v  |
                             +------------------+
                             |                  |
                             |  Notification    |
                             |  System          |
                             |                  |
                             +------------------+
```

### Level 2 DFD: Session Management Flow
```
                                          +-------------------------+
                                          |                         |
                     +----------------+   |     Create Session      |
                     |                |   |                         |
                     |   Mentor       |-->+-------------------------+
                     |                |             |
                     +----------------+             |
                              ^                     v
                              |           +-------------------------+
                              |           |                         |
                              |           |  Session Scheduling     |
                              |           |                         |
                              |           +-------------------------+
                              |                     |
                              |                     v
+----------------+   Request  |           +-------------------------+
|                |----------->|           |                         |
|                |            |           |   Session Discovery     |<--------+
|                |            |           |                         |         |
|                |            |           +-------------------------+         |
|                |            |                     |                         |
|   Learner      |            |                     v                         |
|                |            |           +-------------------------+         |
|                |            |           |                         |         |
|                |<-----------|           |   Booking Workflow      |         |
|                |  Response  |           |                         |         |
+----------------+            |           +-------------------------+         |
        |                     |                     |                         |
        |                     |                     v                Search   |
        |                     |           +-------------------------+         |
        |                     |           |                         |         |
        +---------------------|---------->|   WebRTC Room           |         |
                              |           |                         |         |
                              +-----------+-------------------------+         |
                                                    |                         |
                                                    v                         |
                                          +-------------------------+         |
                                          |                         |         |
                                          |   Rating & Feedback     |---------+
                                          |                         |
                                          +-------------------------+
```

## 4. Use Cases

### 1. User Registration and Authentication

#### 1.1 Learner Registration
- **Actor**: Unregistered User
- **Precondition**: User has navigated to the registration page
- **Main Flow**:
  1. User selects "Register as Learner"
  2. User provides email, username, password, and basic profile information
  3. System validates input and creates learner account
  4. System sends welcome email and redirects to learner dashboard
- **Alternate Flow**:
  - Email already exists: System prompts user to log in or reset password
  - Validation fails: System displays specific validation errors
- **Postcondition**: New learner account created and user logged in

#### 1.2 Mentor Registration
- **Actor**: Unregistered User
- **Precondition**: User has navigated to the registration page
- **Main Flow**:
  1. User selects "Register as Mentor"
  2. User provides email, username, password, and professional profile information
  3. User enters expertise, skills, and records intro video (optional)
  4. System validates input and creates mentor account
  5. System sends welcome email and redirects to mentor dashboard
- **Postcondition**: New mentor account created and user logged in

#### 1.3 User Login
- **Actor**: Registered User
- **Precondition**: User has valid credentials
- **Main Flow**:
  1. User enters email/username and password
  2. System validates credentials
  3. System redirects to appropriate dashboard based on role
- **Alternate Flow**:
  - Invalid credentials: System displays error message
  - Forgotten password: User requests password reset
- **Postcondition**: User is authenticated and redirected to dashboard

### 2. Session Management

#### 2.1 Create Session (Mentor)
- **Actor**: Mentor
- **Precondition**: Mentor is logged in
- **Main Flow**:
  1. Mentor navigates to "Create Session" in dashboard
  2. Mentor fills out session details (title, description, topics, schedule, duration, price)
  3. System validates input and creates new session
  4. System confirms session creation and displays in mentor's dashboard
- **Postcondition**: New session created and available for booking

#### 2.2 Browse Sessions (Learner)
- **Actor**: Learner
- **Precondition**: Learner is logged in
- **Main Flow**:
  1. Learner navigates to "Browse Sessions" 
  2. System displays available sessions with filtering options
  3. Learner applies filters (topic, price, time)
  4. System updates session list based on filters
- **Postcondition**: Learner views filtered session list

#### 2.3 Book Session (Learner)
- **Actor**: Learner
- **Precondition**: Learner is logged in, session is available
- **Main Flow**:
  1. Learner selects a session and clicks "Book Now"
  2. System displays session details and payment information
  3. Learner confirms booking and proceeds to payment
  4. System integrates with Razorpay for payment processing
  5. System confirms booking upon successful payment
  6. System sends notification to both learner and mentor
- **Alternate Flow**:
  - Free session: Skip payment steps
  - Payment failure: System displays error and allows retry
- **Postcondition**: Session booked, payment processed, notifications sent

#### 2.4 Request Custom Session (Learner)
- **Actor**: Learner
- **Precondition**: Learner is logged in, has selected a mentor
- **Main Flow**:
  1. Learner navigates to mentor's profile
  2. Learner selects "Request Session" 
  3. Learner fills out request form (title, description, proposed time, budget)
  4. System sends request to mentor
  5. System notifies learner of submission
- **Postcondition**: Session request submitted to mentor

#### 2.5 Respond to Session Request (Mentor)
- **Actor**: Mentor
- **Precondition**: Mentor has received session request
- **Main Flow**:
  1. Mentor views request in dashboard
  2. Mentor reviews details and decides to accept, decline, or counter
  3. If accepting, mentor confirms details
  4. If countering, mentor adjusts time/price and provides notes
  5. System notifies learner of mentor's response
- **Postcondition**: Request responded to, learner notified

### 3. Session Execution

#### 3.1 Go Live (Mentor)
- **Actor**: Mentor
- **Precondition**: Session is scheduled, near start time
- **Main Flow**:
  1. Mentor navigates to scheduled session in dashboard
  2. Mentor clicks "Go Live" button
  3. System updates session status to "Live"
  4. System notifies booked learners
  5. System redirects mentor to WebRTC room
- **Postcondition**: Session is live, learners notified

#### 3.2 Join Session (Learner)
- **Actor**: Learner
- **Precondition**: Learner has confirmed booking, session is live
- **Main Flow**:
  1. Learner receives notification of live session
  2. Learner clicks "Join Now" button
  3. System redirects learner to WebRTC room
  4. WebRTC connection established between mentor and learner
- **Postcondition**: Learner joined session, video connection established

#### 3.3 Conduct WebRTC Session
- **Actors**: Mentor, Learner
- **Precondition**: Both participants have joined WebRTC room
- **Main Flow**:
  1. System displays video streams of both participants
  2. Participants communicate via audio/video
  3. Participants can toggle audio/video, share screen
  4. System displays session timer
  5. When time is up, system notifies participants
- **Postcondition**: Real-time session conducted successfully

#### 3.4 End Session
- **Actor**: Mentor
- **Precondition**: Session is live
- **Main Flow**:
  1. Mentor clicks "End Session" button
  2. System prompts for confirmation
  3. System updates session status to "Completed"
  4. System disconnects WebRTC connections
  5. System prompts learner for feedback
- **Postcondition**: Session completed, feedback requested

### 4. Payments and Ratings

#### 4.1 Process Payment
- **Actor**: Learner
- **Precondition**: Learner has selected a paid session to book
- **Main Flow**:
  1. System calculates total price
  2. System integrates with Razorpay to create payment order
  3. Learner completes payment through Razorpay interface
  4. Razorpay sends callback with payment status
  5. System verifies payment and updates booking status
- **Postcondition**: Payment processed, booking confirmed

#### 4.2 Rate and Review Mentor
- **Actor**: Learner
- **Precondition**: Learner has completed a session
- **Main Flow**:
  1. Learner is prompted to rate mentor after session ends
  2. Learner selects rating (1-5 stars) and provides optional review
  3. System saves rating and updates mentor's average rating
  4. System displays confirmation of submitted feedback
- **Postcondition**: Rating recorded, mentor average updated

#### 4.3 Process Mentor Payout
- **Actor**: System
- **Precondition**: Payments have been received for completed sessions
- **Main Flow**:
  1. System periodically aggregates completed session payments
  2. System calculates mentor's share (85% of payment)
  3. System initiates payout to mentor's account
  4. System updates payout status based on processing result
- **Postcondition**: Mentor receives payout for completed sessions

### 5. Notifications and Dashboard

#### 5.1 Send Notifications
- **Actor**: System
- **Precondition**: Notification-triggering event has occurred
- **Main Flow**:
  1. System creates notification based on event type
  2. System saves notification to database
  3. If user is online, system sends real-time notification via WebSocket
  4. System displays notification count in UI
- **Postcondition**: Notification delivered and available in user's dashboard

#### 5.2 View Dashboard (Learner)
- **Actor**: Learner
- **Precondition**: Learner is logged in
- **Main Flow**:
  1. Learner navigates to dashboard
  2. System displays upcoming and past sessions
  3. System shows session requests and their status
  4. System presents recommended mentors and sessions
  5. System shows notifications and account settings
- **Postcondition**: Learner views personalized dashboard

#### 5.3 View Dashboard (Mentor)
- **Actor**: Mentor
- **Precondition**: Mentor is logged in
- **Main Flow**:
  1. Mentor navigates to dashboard
  2. System displays upcoming and past sessions
  3. System shows pending session requests
  4. System presents earnings statistics
  5. System shows notifications and account settings
- **Postcondition**: Mentor views personalized dashboard

## 5. Sequence Diagrams

### Session Booking Sequence
```
Learner                 System                 Razorpay                Mentor
   |                       |                       |                      |
   | Browse Sessions       |                       |                      |
   |---------------------->|                       |                      |
   |                       |                       |                      |
   | Select Session        |                       |                      |
   |---------------------->|                       |                      |
   |                       |                       |                      |
   | Book Session          |                       |                      |
   |---------------------->|                       |                      |
   |                       | Create Order          |                      |
   |                       |---------------------->|                      |
   |                       |                       |                      |
   |                       | Order Created         |                      |
   |                       |<----------------------|                      |
   |                       |                       |                      |
   | Payment Page          |                       |                      |
   |<----------------------|                       |                      |
   |                       |                       |                      |
   | Complete Payment      |                       |                      |
   |---------------------------------------------->|                      |
   |                       |                       |                      |
   |                       | Payment Callback      |                      |
   |                       |<----------------------|                      |
   |                       |                       |                      |
   |                       | Verify Payment        |                      |
   |                       |---------------------->|                      |
   |                       |                       |                      |
   |                       | Payment Verified      |                      |
   |                       |<----------------------|                      |
   |                       |                       |                      |
   |                       | Update Booking Status |                      |
   |                       |------------------------------------------->  |
   |                       |                       |                      |
   | Booking Confirmation  |                       |                      |
   |<----------------------|                       |                      |
   |                       | Send Notification     |                      |
   |                       |------------------------------------------->  |
   |                       |                       |                      |
```

### WebRTC Session Sequence
```
Learner                 System                  Mentor
   |                       |                       |
   |                       | Session Near Start    |
   |                       |---------------------->|
   |                       |                       |
   |                       | "Go Live" Button      |
   |                       |---------------------->|
   |                       |                       |
   |                       | Click "Go Live"       |
   |                       |<----------------------|
   |                       |                       |
   |                       | Update Status to Live |
   |                       |-------------------+   |
   |                       |                   |   |
   |                       |<------------------+   |
   |                       |                       |
   | Session Live Notif.   |                       |
   |<----------------------|                       |
   |                       |                       |
   | Click "Join Now"      |                       |
   |---------------------->|                       |
   |                       |                       |
   | Redirect to Room      | Redirect to Room      |
   |<----------------------|---------------------->|
   |                       |                       |
   | WebRTC Connection Setup                      |
   |<--------------------------------------------->|
   |                       |                       |
   | WebRTC Session (Audio/Video/Screen)          |
   |<--------------------------------------------->|
   |                       |                       |
   |                       | End Session           |
   |                       |<----------------------|
   |                       |                       |
   |                       | Update Status         |
   |                       |-------------------+   |
   |                       |                   |   |
   |                       |<------------------+   |
   |                       |                       |
   | Session Ended Notif.  |                       |
   |<----------------------|                       |
   |                       |                       |
   | Feedback Prompt       |                       |
   |<----------------------|                       |
   |                       |                       |
   | Submit Feedback       |                       |
   |---------------------->|                       |
   |                       |                       |
   |                       | Update Mentor Rating  |
   |                       |-------------------+   |
   |                       |                   |   |
   |                       |<------------------+   |
   |                       |                       |
```

## 6. WebRTC Connection Flow

### Connection Establishment
```
+---------------+                                  +---------------+
|               |                                  |               |
|               |      1. WebSocket Connection     |               |
|               |<-------------------------------->|               |
|               |                                  |               |
|               |      2. Join Signal              |               |
|               |--------------------------------->|               |
|               |                                  |               |
|               |      3. Acknowledgment           |               |
|               |<---------------------------------|               |
|               |                                  |               |
|   Initiator   |      4. Create Offer             |   Recipient   |
|   (Mentor)    |                                  |   (Learner)   |
|               |      5. Send Offer via WebSocket |               |
|               |--------------------------------->|               |
|               |                                  |               |
|               |      6. Create Answer            |               |
|               |                                  |               |
|               |      7. Send Answer via WebSocket|               |
|               |<---------------------------------|               |
|               |                                  |               |
|               |      8. ICE Candidate Exchange   |               |
|               |<-------------------------------->|               |
|               |                                  |               |
|               |      9. Media Stream Exchange    |               |
|               |<-------------------------------->|               |
+---------------+                                  +---------------+
```

### WebRTC Data Path
```
+-----------------------+                    +-----------------------+
|                       |                    |                       |
|    Browser Client     |                    |    Browser Client     |
|    (Mentor)           |                    |    (Learner)          |
|                       |                    |                       |
+-----------------------+                    +-----------------------+
          |                                           |
          |  WebRTC (P2P)                             |
          |------------------------------------------>|
          |                                           |
          |  Media Streams (Audio/Video)              |
          |<----------------------------------------->|
          |                                           |
          |  Data Channel (Chat/Controls)             |
          |<----------------------------------------->|
          |                                           |
          v                                           v
+-----------------------+                    +-----------------------+
|                       |                    |                       |
|    Signaling Server   |<------------------>|    STUN/TURN         |
|    (WebSocket)        |   Network          |    Servers           |
|                       |   Traversal        |                      |
+-----------------------+                    +-----------------------+
```

## 7. Algorithms

### 1. Mentor Recommendation Algorithm

```
function recommend_mentors(learner_id, limit=6):
    # Get learner object
    learner = get_learner_by_id(learner_id)
    
    # Extract learner interests
    learner_interests = learner.interests or []
    
    # Base query for mentors
    mentor_query = get_all_mentors()
    
    # If learner has interests, prioritize mentors with matching expertise
    if learner_interests:
        # Find mentors with expertise matching learner interests
        matching_expertise_mentors = filter_mentors_by_expertise(mentor_query, learner_interests)
        
        # If we have enough mentors with matching expertise, return them
        if matching_expertise_mentors.count() >= limit:
            return sort_mentors_by_rating(matching_expertise_mentors).limit(limit)
    
    # Otherwise, get mentors with recent activity and high ratings
    active_mentors = get_active_mentors(days=30)
    
    # Sort by rating and limit results
    recommended_mentors = sort_mentors_by_rating(active_mentors).limit(limit)
    
    return recommended_mentors
```

### 2. Session Matching Algorithm

```
function find_matching_sessions(learner_id):
    # Get learner's interests and past session topics
    learner = get_learner_by_id(learner_id)
    learner_interests = learner.interests or []
    
    # Get topics from past sessions the learner has booked
    past_session_topics = get_past_session_topics(learner_id)
    
    # Combine interests and past topics with weights
    # (past topics get higher weight as they represent proven interest)
    weighted_topics = combine_weighted_topics(
        learner_interests, 
        past_session_topics
    )
    
    # Find upcoming sessions matching these topics
    matching_sessions = find_sessions_by_topics(weighted_topics)
    
    # Filter out sessions the learner has already booked
    matching_sessions = filter_out_booked_sessions(matching_sessions, learner_id)
    
    # Sort by relevance score and recency
    matching_sessions = sort_sessions_by_relevance_and_recency(matching_sessions)
    
    return matching_sessions
```

### 3. Mentor Rating Calculation Algorithm

```
function calculate_mentor_rating(mentor_id):
    # Get all ratings for the mentor
    all_ratings = get_ratings_for_mentor(mentor_id)
    
    # If no ratings, return default
    if all_ratings.count() == 0:
        return None
    
    # Calculate simple average
    total_rating = sum(rating.rating for rating in all_ratings)
    average_rating = total_rating / all_ratings.count()
    
    # Weight by recency (more recent ratings have higher weight)
    weighted_sum = 0
    weight_sum = 0
    
    for rating in all_ratings:
        # Calculate days since rating
        days_since = (current_date() - rating.created_at).days
        
        # Apply recency weight (exponential decay)
        weight = exp(-0.01 * days_since)
        
        weighted_sum += rating.rating * weight
        weight_sum += weight
    
    # Calculate weighted average
    weighted_average = weighted_sum / weight_sum if weight_sum > 0 else average_rating
    
    # Combine simple and weighted average (75% weighted, 25% simple)
    final_rating = 0.75 * weighted_average + 0.25 * average_rating
    
    return round(final_rating, 1)  # Round to 1 decimal place
```

### 4. Payment Processing Algorithm

```
function process_session_payment(booking_id, payment_data):
    # Get booking
    booking = get_booking_by_id(booking_id)
    
    # Verify booking status
    if booking.status != 'pending':
        return error("Invalid booking status for payment")
    
    # Get session and amount
    session = booking.session
    amount = session.price
    
    # Create Razorpay order
    order_data = create_razorpay_order(
        amount=amount,
        currency='INR',
        receipt=f"booking_{booking_id}",
        notes={
            'booking_id': booking_id,
            'session_id': session.id,
            'learner_id': booking.learner.id,
            'mentor_id': session.mentor.id
        }
    )
    
    # Create payment record
    payment = create_payment(
        booking=booking,
        amount=amount,
        razorpay_order_id=order_data['id'],
        status='initiated'
    )
    
    # Calculate shares
    payment.mentor_share = amount * 0.85  # 85% to mentor
    payment.platform_fee = amount * 0.15  # 15% platform fee
    payment.save()
    
    # Return payment info for frontend processing
    return {
        'payment_id': payment.id,
        'order_id': order_data['id'],
        'amount': amount,
        'currency': 'INR',
        'booking_id': booking_id
    }
```

### 5. WebSocket Notification Delivery Algorithm

```
function send_notification_to_user(user_id, notification_data):
    # Create notification in database
    notification = create_notification(
        user_id=user_id,
        title=notification_data['title'],
        message=notification_data['message'],
        link=notification_data['link'],
        notification_type=notification_data['type'],
        reference_id=notification_data.get('reference_id')
    )
    
    # Try to send real-time notification via WebSocket
    try:
        # Get channel layer
        channel_layer = get_channel_layer()
        
        # Send to user's notification group
        send_to_channel(
            channel_layer,
            f"notifications_{user_id}",
            {
                "type": "notification_message",
                "message": {
                    "id": notification.id,
                    "title": notification.title,
                    "message": notification.message,
                    "link": notification.link,
                    "created_at": notification.created_at.isoformat(),
                    "is_read": False
                }
            }
        )
        
        # Also update any open dashboard
        send_to_channel(
            channel_layer,
            f"dashboard_{user_id}",
            {
                "type": "notification_update",
                "count": get_unread_notification_count(user_id)
            }
        )
        
        return True
    except Exception as e:
        # Log error but don't fail - notification is still in database
        log_error(f"WebSocket notification delivery failed: {str(e)}")
        return False
```

## 8. Project Architecture

### High-Level System Architecture
```
                    +--------------------+
                    |                    |
                    |   Django App       |
                    |                    |
                    +--------------------+
                              |
                              v
+---------------+   +--------------------+   +---------------+
|               |   |                    |   |               |
|  Django       |<->|  Django Channels   |<->|  Redis        |
|  ORM/Models   |   |  (WebSockets)      |   |  Cache/Broker |
|               |   |                    |   |               |
+---------------+   +--------------------+   +---------------+
        |                    |                      |
        v                    v                      v
+---------------+   +--------------------+   +---------------+
|               |   |                    |   |               |
|  SQLite       |   |  WebRTC            |   |  Celery       |
|  Database     |   |  (Real-time Comm)  |   |  Tasks        |
|               |   |                    |   |               |
+---------------+   +--------------------+   +---------------+
                              |
                              v
                    +--------------------+
                    |                    |
                    |  Razorpay          |
                    |  Payment Gateway   |
                    |                    |
                    +--------------------+
```

### Component Architecture
```
+-----------------------------------------------------+
|                                                     |
|                   Django Framework                  |
|                                                     |
+-----------------------------------------------------+
                          |
            +-------------+-------------+
            |                           |
+----------------------+    +----------------------+
|                      |    |                      |
|   Apps               |    |   Infrastructure     |
|                      |    |                      |
+----------------------+    +----------------------+
  |        |       |          |        |        |
  v        v       v          v        v        v
+-----+ +------+ +-------+ +------+ +------+ +--------+
|     | |      | |       | |      | |      | |        |
|Users| |Learn.| |Payment| |ASGI  | |WebRTC| |Razorpay|
|     | |Sess. | |       | |      | |      | |        |
+-----+ +------+ +-------+ +------+ +------+ +--------+
```

## 9. Deployment Architecture

```
                   +----------------+
                   |                |
   +-------------->| Django Server  |<--------------+
   |               | (Daphne)       |               |
   |               |                |               |
   |               +----------------+               |
   |                       |                        |
   |                       v                        |
   |               +----------------+               |
   |               |                |               |
   |               | Redis Server   |               |
   |               |                |               |
   |               +----------------+               |
   |                       |                        |
   |                       v                        |
+--+-------------+ +----------------+ +--------------+--+
|                | |                | |                 |
| WebSocket      | | Database       | | Celery Worker   |
| Consumers      | | (SQLite3)      | | (Background     |
| (Channels)     | |                | | Tasks)          |
|                | |                | |                 |
+----------------+ +----------------+ +-----------------+
        |                  |                  |
        v                  v                  v
+----------------+ +----------------+ +----------------+
|                | |                | |                |
| Frontend       | | Static Files   | | Media Storage  |
| (Templates)    | | (CSS/JS)       | | (Uploads)      |
|                | |                | |                |
+----------------+ +----------------+ +----------------+
```

## 10. Security Considerations

1. **Authentication and Authorization**
   - Django's built-in authentication system secures user accounts
   - Role-based access controls (learner/mentor/admin)
   - Password hashing using PBKDF2 with SHA256
   - Session timeout and secure cookie handling

2. **Payment Security**
   - Integration with Razorpay for secure payment processing
   - Payment verification using cryptographic signatures
   - No storage of sensitive payment information
   - Secure callback handling for payment confirmation

3. **WebRTC Security**
   - Encrypted media streams using DTLS-SRTP
   - Signaling via secure WebSocket connections (WSS)
   - Room access control based on booking status
   - STUN/TURN server configuration for NAT traversal

4. **Data Protection**
   - Input validation and sanitization to prevent injection attacks
   - CSRF protection for form submissions
   - XSS protection in templates
   - Secure handling of user profile data

5. **API Security**
   - Authentication required for API access
   - Rate limiting to prevent abuse
   - Validation of all input parameters
   - Proper error handling without information leakage

## 11. Scalability Considerations

1. **Database Scalability**
   - Current implementation uses SQLite3 for simplicity
   - For production, can migrate to PostgreSQL for better concurrency
   - Database connection pooling
   - Query optimization with indexes on frequently accessed fields

2. **WebSocket Scalability**
   - Redis as the channel layer backend allows for scaling WebSocket connections
   - Channel layer can be distributed across multiple Redis instances
   - WebSocket connections can be load-balanced across multiple servers

3. **WebRTC Scalability**
   - Peer-to-peer connections scale naturally for 1:1 sessions
   - For future group sessions, could implement Selective Forwarding Unit (SFU)
   - Dedicated TURN servers for improved connection reliability

4. **Application Scaling**
   - Stateless design allows horizontal scaling of Django application servers
   - Background tasks offloaded to Celery workers
   - Cache frequently accessed data using Redis

## 12. Future Enhancements

1. **Advanced Mentor Matching**
   - Machine learning-based mentor recommendations
   - Topic analysis of session content for better matching
   - Collaborative filtering based on session ratings

2. **Enhanced Session Experience**
   - Interactive whiteboard for teaching
   - Session recording and playback
   - Resource sharing during sessions
   - Automated transcription and note-taking

3. **Expanded Payment Options**
   - Subscription model for regular sessions
   - Package discounts for multiple session bookings
   - Multiple payment gateway support
   - International currency support

4. **Analytics and Reporting**
   - Detailed analytics for mentors on performance
   - Learning progress tracking for learners
   - Platform usage statistics and growth metrics
   - Revenue and earnings reports

5. **Mobile Applications**
   - Native mobile apps for iOS and Android
   - Push notifications for session alerts
   - Offline content access
   - Mobile-optimized WebRTC implementation