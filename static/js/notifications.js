/**
 * Notifications management for PeerLearn
 * Handles WebSocket connections for real-time notifications
 */

let notificationSocket = null;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;
let pingInterval = null;

/**
 * Initialize notification WebSocket connection
 * @param {string} userId - The ID of the current user
 */
function connectNotificationWebSocket(userId) {
    if (!userId) {
        console.error('User ID not provided. Cannot initialize notification WebSocket.');
        return;
    }

    // Close existing connection if any
    if (notificationSocket) {
        notificationSocket.close();
        notificationSocket = null;
    }

    // Determine WebSocket protocol (ws or wss)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/notifications/${userId}/`;
    
    // Create new WebSocket connection
    notificationSocket = new WebSocket(wsUrl);
    
    // Setup event handlers
    notificationSocket.onopen = function(e) {
        console.log('Notification WebSocket connection established');
        
        // Reset reconnection state
        isReconnecting = false;
        reconnectAttempts = 0;
        
        // Start ping interval to keep connection alive
        startPingInterval();
    };
    
    notificationSocket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        
        // Handle different message types
        switch(data.type) {
            case 'notification':
                handleNewNotification(data);
                break;
            case 'notification_count':
                updateNotificationCount(data.count);
                break;
            case 'pong':
                // Ping response received, connection is alive
                break;
            default:
                console.log('Unknown notification message type:', data.type);
        }
    };
    
    notificationSocket.onclose = function(e) {
        console.log('Notification WebSocket connection closed');
        clearInterval(pingInterval);
        
        // Attempt to reconnect if not closing deliberately
        if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            isReconnecting = true;
            setTimeout(() => {
                reconnectAttempts++;
                console.log(`Attempting to reconnect notifications (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                connectNotificationWebSocket(userId);
            }, RECONNECT_DELAY);
        }
    };
    
    notificationSocket.onerror = function(e) {
        console.error('Notification WebSocket error:', e);
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
        if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
            notificationSocket.send(JSON.stringify({ 'type': 'ping' }));
        }
    }, 30000);
}

/**
 * Handle new notification message
 * @param {Object} data - The notification data
 */
function handleNewNotification(data) {
    // Update notification count
    updateNotificationCount(data.count);
    
    // Refresh notification list if available
    if (typeof refreshNotifications === 'function') {
        refreshNotifications();
    }
    
    // Show toast notification
    if (data.notification && data.notification.message) {
        const notificationType = mapNotificationTypeToToastType(data.notification.level);
        showToast(data.notification.message, notificationType);
        
        // Play notification sound if available
        playNotificationSound();
    }
}

/**
 * Map notification level to toast type
 * @param {string} level - Notification level ('info', 'warning', 'error', 'success')
 * @returns {string} Toast type
 */
function mapNotificationTypeToToastType(level) {
    switch(level) {
        case 'danger':
        case 'error':
            return 'error';
        case 'warning':
            return 'warning';
        case 'success':
            return 'success';
        case 'info':
        default:
            return 'info';
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
    
    // Update document title if count > 0
    if (count > 0) {
        const currentTitle = document.title;
        if (!currentTitle.startsWith('(')) {
            document.title = `(${count}) ${currentTitle}`;
        } else {
            // Already has notification count, update it
            document.title = `(${count}) ${currentTitle.substring(currentTitle.indexOf(') ') + 2)}`;
        }
    } else {
        // Reset title if count is 0
        const currentTitle = document.title;
        if (currentTitle.startsWith('(')) {
            document.title = currentTitle.substring(currentTitle.indexOf(') ') + 2);
        }
    }
}

/**
 * Play notification sound
 */
function playNotificationSound() {
    // Check if notification sounds are enabled
    const soundsEnabled = localStorage.getItem('notification_sounds_enabled') !== 'false';
    
    if (soundsEnabled) {
        try {
            const sound = new Audio('/static/sounds/notification.mp3');
            sound.volume = 0.5;
            sound.play().catch(error => {
                console.log('Could not play notification sound:', error);
            });
        } catch (error) {
            console.log('Error creating notification sound:', error);
        }
    }
}

/**
 * Toggle notification sounds
 * @param {boolean} enabled - Whether to enable notification sounds
 */
function toggleNotificationSounds(enabled) {
    localStorage.setItem('notification_sounds_enabled', enabled);
}

/**
 * Get notification sound setting
 * @returns {boolean} Whether notification sounds are enabled
 */
function getNotificationSoundSetting() {
    return localStorage.getItem('notification_sounds_enabled') !== 'false';
}

/**
 * Initialize notifications panel
 */
function initNotifications() {
    // Get user ID from meta tag or data attribute
    const userId = document.querySelector('meta[name="user-id"]')?.getAttribute('content') || 
                  document.querySelector('[data-user-id]')?.getAttribute('data-user-id');
    
    if (!userId) {
        console.error('User ID not found for notifications initialization');
        return;
    }
    
    // Connect to notification WebSocket
    connectNotificationWebSocket(userId);
    
    // Setup event listeners for notification panel
    setupNotificationPanel();
}

/**
 * Setup notification panel event listeners
 */
function setupNotificationPanel() {
    // Mark all notifications as read button
    const markAllReadBtn = document.getElementById('mark-all-read');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', function() {
            markAllNotificationsRead();
        });
    }
    
    // Notification sound toggle
    const soundToggle = document.getElementById('notification-sound-toggle');
    if (soundToggle) {
        // Set initial state
        soundToggle.checked = getNotificationSoundSetting();
        
        // Setup change event
        soundToggle.addEventListener('change', function() {
            toggleNotificationSounds(this.checked);
        });
    }
}

/**
 * Mark a notification as read
 * @param {string} notificationId - The ID of the notification
 */
function markNotificationRead(notificationId) {
    if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
        notificationSocket.send(JSON.stringify({
            'type': 'mark_read',
            'notification_id': notificationId
        }));
    } else {
        // Fallback to API if WebSocket is not available
        markNotificationReadAPI(notificationId);
    }
}

/**
 * Mark all notifications as read
 */
function markAllNotificationsRead() {
    if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
        notificationSocket.send(JSON.stringify({
            'type': 'mark_all_read'
        }));
    } else {
        // Fallback to API if WebSocket is not available
        markAllNotificationsReadAPI();
    }
}

/**
 * Mark a notification as read via API
 * @param {string} notificationId - The ID of the notification
 */
async function markNotificationReadAPI(notificationId) {
    try {
        await fetch(`/api/notifications/${notificationId}/read/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });
        
        // Refresh notification list
        if (typeof refreshNotifications === 'function') {
            refreshNotifications();
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

/**
 * Mark all notifications as read via API
 */
async function markAllNotificationsReadAPI() {
    try {
        await fetch('/api/notifications/read-all/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });
        
        // Update notification count
        updateNotificationCount(0);
        
        // Refresh notification list
        if (typeof refreshNotifications === 'function') {
            refreshNotifications();
        }
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    }
}

/**
 * Get CSRF token from cookies
 * @returns {string} CSRF token
 */
function getCsrfToken() {
    const name = 'csrftoken';
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Make functions available globally
window.connectNotificationWebSocket = connectNotificationWebSocket;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.initNotifications = initNotifications;