/**
 * Notifications System for PeerLearn
 * Provides real-time notifications via WebSocket
 */

// Use an IIFE to prevent variable name collisions
(function() {
// Don't re-initialize if already defined
if (typeof window.initNotifications !== 'undefined') {
    return;
}

// Set up window unloading flag to prevent reconnection attempts when page is closing
window.isUnloading = false;
window.addEventListener('beforeunload', () => {
    window.isUnloading = true;
});

// Store notification data
let notificationsData = {
    count: 0,
    items: [],
    readCount: 0
};

// WebSocket connection
let notificationSocket = null;
let reconnectAttempts = 0;
let reconnectInterval = 2000; // Start with 2s
const maxReconnectAttempts = 5;

/**
 * Initialize notifications system
 * This is called from Alpine.js initialization
 */
function initNotifications() {
    // Check if we're on a page that should have notifications
    // (public pages won't have user-id meta tag, and that's expected)
    const userIdMeta = document.querySelector('meta[name="user-id"]');
    if (!userIdMeta) {
        console.debug('User ID meta tag not found - likely on a public page without authentication');
        return; // Exit quietly - this is normal for public pages
    }
    
    // Get user ID from meta tag if not already set
    if (!window.USER_ID) {
        // Store user ID in global variable
        window.USER_ID = userIdMeta.getAttribute('content');
        if (!window.USER_ID) {
            console.warn('User ID meta tag exists but is empty, notifications system cannot initialize');
            return;
        }
        console.log('Set USER_ID from meta tag:', window.USER_ID);
    } else {
        console.log('Using existing USER_ID:', window.USER_ID);
    }

    console.log('Initializing notifications system for user:', window.USER_ID);

    // Connect to WebSocket for notifications
    connectNotificationWebSocket();
    
    // Load initial notifications via API
    fetchNotifications();
    
    // Setup refresh interval (every 5 minutes)
    setInterval(fetchNotifications, 5 * 60 * 1000);
}

/**
 * Connect to the notifications WebSocket
 */
function connectNotificationWebSocket() {
    // Close existing connection if any
    if (notificationSocket) {
        notificationSocket.close();
    }
    
    // Get user ID from meta tag if not already set
    if (!window.USER_ID) {
        const userIdMeta = document.querySelector('meta[name="user-id"]');
        if (userIdMeta) {
            window.USER_ID = userIdMeta.getAttribute('content');
        } else {
            console.debug('User ID meta tag not found - likely on a public page without authentication');
            return;
        }
    }
    
    // Verify we have a user ID
    if (!window.USER_ID) {
        console.warn('User ID meta tag exists but is empty, notifications system cannot initialize');
        return;
    }
    
    // Create WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/notifications/${window.USER_ID}/`;
    
    console.log('Connecting to notification WebSocket:', wsUrl);
    
    // Create new WebSocket connection
    try {
        notificationSocket = new WebSocket(wsUrl);
        
        // Event handlers for WebSocket
        notificationSocket.onopen = onNotificationSocketOpen;
        notificationSocket.onmessage = onNotificationSocketMessage;
        notificationSocket.onclose = onNotificationSocketClose;
        notificationSocket.onerror = onNotificationSocketError;
    } catch (error) {
        console.error('Error creating notification WebSocket:', error);
    }
}

/**
 * Handle WebSocket open event
 */
function onNotificationSocketOpen(event) {
    console.log('Notification WebSocket connected successfully');
    
    // Reset reconnection variables
    reconnectAttempts = 0;
    reconnectInterval = 2000;
    
    // Update notification icon if we're on a dashboard page
    const notificationIndicator = document.getElementById('notification-indicator');
    if (notificationIndicator) {
        notificationIndicator.classList.remove('text-gray-500');
        notificationIndicator.classList.add('text-green-500');
    }
    
    // Optionally show a toast message on reconnection after failure
    if (reconnectAttempts > 0 && window.showToast) {
        window.showToast('Notification service reconnected', 'success');
    }
}

/**
 * Handle WebSocket message event
 */
function onNotificationSocketMessage(event) {
    const data = JSON.parse(event.data);
    console.log('Notification received:', data);
    
    // Handle different types of notification events
    if (data.type === 'notification_update') {
        // Process the new notification
        processNewNotification(data.notification);
    } else if (data.type === 'notification_read') {
        // Update read status
        updateNotificationReadStatus(data.notification_id);
    } else if (data.type === 'notification_count') {
        // Update unread count
        updateNotificationCount(data.count);
    }
}

/**
 * Handle WebSocket close event
 */
function onNotificationSocketClose(event) {
    console.log('Notification WebSocket closed:', event);
    
    // Check if window is closing/page is unloading - no need to reconnect in that case
    if (window.isUnloading) {
        console.log('Page is unloading, not attempting to reconnect notification WebSocket');
        return;
    }
    
    // Determine if we should reconnect based on the close code
    // Don't reconnect for authentication failures (4003) or policy violations (1008)
    const shouldNotReconnect = [1008, 4003].includes(event.code);
    
    if (shouldNotReconnect) {
        console.warn(`Not reconnecting notification WebSocket due to close code ${event.code}: ${event.reason}`);
        return;
    }
    
    // Attempt to reconnect with exponential backoff
    if (reconnectAttempts < maxReconnectAttempts) {
        // Calculate delay with exponential backoff and a bit of randomization
        const delay = reconnectInterval * (1 + (Math.random() * 0.1));
        console.log(`Reconnecting notification WebSocket in ${(delay/1000).toFixed(1)}s (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        
        setTimeout(() => {
            reconnectAttempts++;
            reconnectInterval = Math.min(30000, reconnectInterval * 2); // Max 30s
            connectNotificationWebSocket();
        }, delay);
    } else {
        console.error('Max reconnect attempts reached for notification WebSocket');
        
        // Maybe show an error toast to the user
        if (window.showToast) {
            window.showToast('Unable to connect to notification service. Please refresh the page.', 'error', 0);
        }
    }
}

/**
 * Handle WebSocket error event
 */
function onNotificationSocketError(error) {
    console.error('Notification WebSocket error:', error);
}

/**
 * Process a new notification
 * @param {Object} notification - The notification data
 */
function processNewNotification(notification) {
    // Add notification to list
    notificationsData.items.unshift(notification);
    
    // Update counter if notification is unread
    if (!notification.read) {
        notificationsData.count++;
        updateNotificationCounter();
    }
    
    // Update Alpine.js data if using Alpine
    updateAlpineNotificationData();
    
    // Show toast notification
    showNotificationToast(notification);
}

/**
 * Show toast for new notification
 * @param {Object} notification - The notification data
 */
function showNotificationToast(notification) {
    if (window.showToast) {
        window.showToast(notification.message, 'info');
    }
}

/**
 * Update notification count in UI
 * @param {number} count - The new notification count
 */
function updateNotificationCount(count) {
    notificationsData.count = count;
    updateNotificationCounter();
    updateAlpineNotificationData();
}

/**
 * Update the notification counter badge in UI
 */
function updateNotificationCounter() {
    // Update counter in UI
    const counters = document.querySelectorAll('.notification-counter');
    
    counters.forEach(counter => {
        // Only show counter if there are unread notifications
        if (notificationsData.count > 0) {
            counter.textContent = notificationsData.count;
            counter.classList.remove('hidden');
        } else {
            counter.textContent = '0';
            counter.classList.add('hidden');
        }
    });
}

/**
 * Update Alpine.js notification data
 * This assumes Alpine.js is used and has notificationCount in its data
 */
function updateAlpineNotificationData() {
    // Find elements with x-data containing notificationCount
    document.querySelectorAll('[x-data]').forEach(el => {
        if (el.__x) {
            // Check if this Alpine component has notificationCount
            if ('notificationCount' in el.__x.getUnobservedData()) {
                // Update the value
                el.__x.$data.notificationCount = notificationsData.count;
                
                // If it also has notifications array
                if ('notifications' in el.__x.getUnobservedData()) {
                    el.__x.$data.notifications = notificationsData.items;
                }
            }
        }
    });
}

/**
 * Mark a notification as read
 * @param {number} notificationId - The notification ID
 */
function markNotificationAsRead(notificationId) {
    // Find notification in the list
    const notification = notificationsData.items.find(n => n.id === notificationId);
    
    if (notification && !notification.read) {
        // Update locally
        notification.read = true;
        notificationsData.count = Math.max(0, notificationsData.count - 1);
        
        // Update UI
        updateNotificationCounter();
        updateAlpineNotificationData();
        
        // Send to server via WebSocket if connected
        if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
            notificationSocket.send(JSON.stringify({
                type: 'mark_read',
                notification_id: notificationId
            }));
        } else {
            // Fallback to API if WebSocket not available
            markReadViaAPI(notificationId);
        }
    }
}

/**
 * Mark all notifications as read
 */
function markAllNotificationsAsRead() {
    // Update locally
    notificationsData.items.forEach(notification => {
        notification.read = true;
    });
    notificationsData.count = 0;
    
    // Update UI
    updateNotificationCounter();
    updateAlpineNotificationData();
    
    // Send to server via WebSocket if connected
    if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
        notificationSocket.send(JSON.stringify({
            type: 'mark_all_read'
        }));
    } else {
        // Fallback to API if WebSocket not available
        markAllReadViaAPI();
    }
}

/**
 * Update notification read status locally
 * @param {number} notificationId - The notification ID
 */
function updateNotificationReadStatus(notificationId) {
    // Find notification in the list
    const notification = notificationsData.items.find(n => n.id === notificationId);
    
    if (notification && !notification.read) {
        // Update locally
        notification.read = true;
        notificationsData.count = Math.max(0, notificationsData.count - 1);
        
        // Update UI
        updateNotificationCounter();
        updateAlpineNotificationData();
    }
}

/**
 * Fetch notifications from API
 */
function fetchNotifications() {
    // Call API to get notifications
    fetch('/users/api/notifications/')
        .then(response => response.json())
        .then(data => {
            // Update local data
            notificationsData.items = data.notifications;
            notificationsData.count = data.unread_count;
            
            // Update UI
            updateNotificationCounter();
            updateAlpineNotificationData();
        })
        .catch(error => {
            console.error('Error fetching notifications:', error);
        });
}

/**
 * Mark notification read via API (fallback if WebSocket unavailable)
 * @param {number} notificationId - The notification ID
 */
function markReadViaAPI(notificationId) {
    fetch(`/users/api/notifications/${notificationId}/read/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        }
    }).catch(error => {
        console.error('Error marking notification as read:', error);
    });
}

/**
 * Mark all notifications read via API (fallback if WebSocket unavailable)
 */
function markAllReadViaAPI() {
    fetch('/users/api/notifications/read-all/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        }
    }).catch(error => {
        console.error('Error marking all notifications as read:', error);
    });
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

// Export functions for global use
window.initNotifications = initNotifications;
window.connectNotificationWebSocket = connectNotificationWebSocket;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.processNewNotification = processNewNotification;

})(); // End of IIFE