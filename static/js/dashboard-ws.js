/**
 * Dashboard WebSocket connection management for PeerLearn
 * Establishes and maintains WebSocket connections to receive real-time updates
 */

let dashboardSocket = null;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;
let pingInterval = null;

/**
 * Initialize dashboard WebSocket connection
 * @param {string} userId - The ID of the current user
 */
function initDashboardWebSocket(userId) {
    if (!userId) {
        console.error('User ID not provided. Cannot initialize dashboard WebSocket.');
        return;
    }

    // Close existing connection if any
    if (dashboardSocket) {
        dashboardSocket.close();
        dashboardSocket = null;
    }

    // Determine WebSocket protocol (ws or wss)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/dashboard/${userId}/`;
    
    // Create new WebSocket connection
    dashboardSocket = new WebSocket(wsUrl);
    
    // Setup event handlers
    dashboardSocket.onopen = function(e) {
        console.log('Dashboard WebSocket connection established');
        showToast('Connected to real-time updates', 'success');
        
        // Reset reconnection state
        isReconnecting = false;
        reconnectAttempts = 0;
        
        // Request initial dashboard data
        dashboardSocket.send(JSON.stringify({
            'type': 'request_dashboard_data'
        }));
        
        // Start ping interval to keep connection alive
        startPingInterval();
    };
    
    dashboardSocket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        
        // Handle different message types
        switch(data.type) {
            case 'session_update':
                handleSessionUpdate(data);
                break;
            case 'booking_update':
                handleBookingUpdate(data);
                break;
            case 'notification_update':
                handleNotificationUpdate(data);
                break;
            case 'session_request_update':
                handleSessionRequestUpdate(data);
                break;
            case 'dashboard_data':
                handleDashboardData(data);
                break;
            case 'pong':
                // Ping response received, connection is alive
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    };
    
    dashboardSocket.onclose = function(e) {
        console.log('Dashboard WebSocket connection closed');
        clearInterval(pingInterval);
        
        // Attempt to reconnect if not closing deliberately
        if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            isReconnecting = true;
            setTimeout(() => {
                reconnectAttempts++;
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                initDashboardWebSocket(userId);
            }, RECONNECT_DELAY);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            showToast('Connection lost. Please refresh the page.', 'error');
        }
    };
    
    dashboardSocket.onerror = function(e) {
        console.error('Dashboard WebSocket error:', e);
    };
}

/**
 * Start ping interval to keep connection alive
 */
function startPingInterval() {
    // Clear existing interval if any
    if (pingInterval) {
        clearInterval(pingInterval);
    }
    
    // Send ping every 30 seconds
    pingInterval = setInterval(() => {
        if (dashboardSocket && dashboardSocket.readyState === WebSocket.OPEN) {
            dashboardSocket.send(JSON.stringify({ 'type': 'ping' }));
        }
    }, 30000);
}

/**
 * Handle session update message
 * @param {Object} data - The session update data
 */
function handleSessionUpdate(data) {
    // Refresh session list if available
    if (typeof refreshSessionList === 'function') {
        refreshSessionList();
    }
    
    // Update session stats if available
    updateSessionStats(data.stats);
    
    // Show notification
    showToast(data.message || 'Session updated', 'info');
}

/**
 * Handle booking update message
 * @param {Object} data - The booking update data
 */
function handleBookingUpdate(data) {
    // Refresh booking list if available
    if (typeof refreshBookingList === 'function') {
        refreshBookingList();
    }
    
    // Update booking stats if available
    updateBookingStats(data.stats);
    
    // Show notification
    showToast(data.message || 'Booking updated', 'info');
}

/**
 * Handle notification update message
 * @param {Object} data - The notification update data
 */
function handleNotificationUpdate(data) {
    // Update notification count
    updateNotificationCount(data.count);
    
    // Refresh notification list if available
    if (typeof refreshNotifications === 'function') {
        refreshNotifications();
    }
    
    // Show toast for new notification
    if (data.notification && data.notification.message) {
        showToast(data.notification.message, 'info');
    }
}

/**
 * Handle session request update message
 * @param {Object} data - The session request update data
 */
function handleSessionRequestUpdate(data) {
    // Refresh session request list if available
    if (typeof refreshSessionRequestList === 'function') {
        refreshSessionRequestList();
    }
    
    // Show notification
    showToast(data.message || 'Session request updated', 'info');
}

/**
 * Handle dashboard data message
 * @param {Object} data - The dashboard data
 */
function handleDashboardData(data) {
    console.log('Received dashboard data:', data);
    
    // Process dashboard data based on user type
    if (data.user_type === 'mentor') {
        handleMentorDashboardData(data);
    } else if (data.user_type === 'learner') {
        handleLearnerDashboardData(data);
    }
}

/**
 * Handle mentor dashboard data
 * @param {Object} data - The mentor dashboard data
 */
function handleMentorDashboardData(data) {
    // Update dashboard stats
    if (data.stats) {
        document.getElementById('total-sessions')?.textContent = data.stats.total_sessions || 0;
        document.getElementById('published-sessions')?.textContent = data.stats.published_sessions || 0;
        document.getElementById('active-bookings')?.textContent = data.stats.active_bookings || 0;
        document.getElementById('pending-requests')?.textContent = data.stats.pending_requests || 0;
        document.getElementById('total-earnings')?.textContent = data.stats.total_earnings || '₹0';
    }
    
    // Update session lists if applicable
    if (data.sessions && typeof updateSessionsList === 'function') {
        updateSessionsList(data.sessions);
    }
    
    // Update booking lists if applicable
    if (data.bookings && typeof updateBookingsList === 'function') {
        updateBookingsList(data.bookings);
    }
    
    // Update session request lists if applicable
    if (data.session_requests && typeof updateSessionRequestsList === 'function') {
        updateSessionRequestsList(data.session_requests);
    }
}

/**
 * Handle learner dashboard data
 * @param {Object} data - The learner dashboard data
 */
function handleLearnerDashboardData(data) {
    // Update dashboard stats
    if (data.stats) {
        document.getElementById('total-bookings')?.textContent = data.stats.total_bookings || 0;
        document.getElementById('upcoming-sessions')?.textContent = data.stats.upcoming_sessions || 0;
        document.getElementById('completed-sessions')?.textContent = data.stats.completed_sessions || 0;
        document.getElementById('pending-requests')?.textContent = data.stats.pending_requests || 0;
    }
    
    // Update booking lists if applicable
    if (data.bookings && typeof updateBookingsList === 'function') {
        updateBookingsList(data.bookings);
    }
    
    // Update session request lists if applicable
    if (data.session_requests && typeof updateSessionRequestsList === 'function') {
        updateSessionRequestsList(data.session_requests);
    }
}

/**
 * Update notification count in UI
 * @param {number} count - The number of unread notifications
 */
function updateNotificationCount(count) {
    const notificationCountElements = document.querySelectorAll('.notification-count');
    
    notificationCountElements.forEach(el => {
        el.textContent = count;
        
        // Toggle visibility based on count
        if (count > 0) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

/**
 * Update session stats in the dashboard
 * @param {Object} stats - Session statistics
 */
function updateSessionStats(stats) {
    if (!stats) return;
    
    // Update stats in dashboard if elements exist
    document.getElementById('total-sessions')?.textContent = stats.total || 0;
    document.getElementById('published-sessions')?.textContent = stats.published || 0;
    document.getElementById('draft-sessions')?.textContent = stats.draft || 0;
}

/**
 * Update booking stats in the dashboard
 * @param {Object} stats - Booking statistics
 */
function updateBookingStats(stats) {
    if (!stats) return;
    
    // Update stats in dashboard if elements exist
    document.getElementById('active-bookings')?.textContent = stats.active || 0;
    document.getElementById('completed-bookings')?.textContent = stats.completed || 0;
    document.getElementById('cancelled-bookings')?.textContent = stats.cancelled || 0;
}

/**
 * Mark a notification as read
 * @param {string} notificationId - The ID of the notification
 */
function markNotificationAsRead(notificationId) {
    if (dashboardSocket && dashboardSocket.readyState === WebSocket.OPEN) {
        dashboardSocket.send(JSON.stringify({
            'type': 'mark_notification_read',
            'notification_id': notificationId
        }));
    }
}

/**
 * Mark all notifications as read
 */
function markAllNotificationsAsRead() {
    if (dashboardSocket && dashboardSocket.readyState === WebSocket.OPEN) {
        dashboardSocket.send(JSON.stringify({
            'type': 'mark_all_notifications_read'
        }));
    }
}

// Make functions available globally
window.initDashboardWebSocket = initDashboardWebSocket;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;