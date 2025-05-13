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
    // Get user ID from meta tag if not already set
    if (!window.USER_ID) {
        const userIdMeta = document.querySelector('meta[name="user-id"]');
        if (!userIdMeta) {
            console.error('User ID meta tag not found, notifications system cannot initialize');
            return;
        }
        
        // Store user ID in global variable
        window.USER_ID = userIdMeta.getAttribute('content');
        if (!window.USER_ID) {
            console.error('User ID is empty, notifications system cannot initialize');
            return;
        }
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
            console.error('User ID meta tag not found, notifications system cannot initialize');
            return;
        }
    }
    
    // Verify we have a user ID
    if (!window.USER_ID) {
        console.error('User ID is empty, notifications system cannot initialize');
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
    console.log('Notification WebSocket connected');
    reconnectAttempts = 0;
    reconnectInterval = 2000;
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
    
    // Attempt to reconnect with exponential backoff
    if (reconnectAttempts < maxReconnectAttempts) {
        setTimeout(() => {
            reconnectAttempts++;
            reconnectInterval = Math.min(30000, reconnectInterval * 2); // Max 30s
            connectNotificationWebSocket();
        }, reconnectInterval);
    } else {
        console.error('Max reconnect attempts reached for notification WebSocket');
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