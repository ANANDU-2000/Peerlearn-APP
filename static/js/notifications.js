// Notification WebSocket Connection
let notificationSocket = null;
let notificationCount = 0;

/**
 * Connects to the WebSocket for real-time notifications
 */
function connectNotificationWebSocket() {
    try {
        // WebSocket is disabled in this version, will be enabled in production
        console.log('Notification WebSocket is disabled in development mode');
        return;
        
        // The following code is disabled but kept for production use
        /*
        // Determine the correct WebSocket protocol based on the page protocol
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/notifications/`;
        
        // Create WebSocket connection
        notificationSocket = new WebSocket(wsUrl);
        
        // Connection opened
        notificationSocket.addEventListener('open', (event) => {
            console.log('Notification WebSocket connection established');
        });
        
        // Connection closed
        notificationSocket.addEventListener('close', (event) => {
            console.log('Notification WebSocket connection closed');
            // Try to reconnect after 5 seconds
            setTimeout(() => {
                connectNotificationWebSocket();
            }, 5000);
        });
        
        // Connection error
        notificationSocket.addEventListener('error', (event) => {
            console.error('Notification WebSocket error:', event);
        });
        
        // Listen for messages
        notificationSocket.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            handleNotification(data);
        });
        */
    } catch (error) {
        console.error('Error setting up notification WebSocket:', error);
    }
}

/**
 * Handles incoming notification data
 * @param {Object} data - The notification data
 */
function handleNotification(data) {
    if (data.type === 'notification') {
        // Add notification to the list
        addNotificationToList(data.notification);
        
        // Update the notification count
        updateNotificationCount(1);
        
        // Show toast notification if user has granted permission
        if (Notification.permission === 'granted') {
            showBrowserNotification(data.notification);
        }
    } else if (data.type === 'notification_count') {
        // Update the notification count from the server
        updateNotificationCount(data.count);
    }
}

/**
 * Updates the notification count indicator
 * @param {number} count - The number to add to the current count
 */
function updateNotificationCount(count) {
    // If count is a number, add it to the current count
    if (typeof count === 'number') {
        notificationCount += count;
    } else {
        // Otherwise, set the count to the provided value
        notificationCount = count;
    }
    
    // Update Alpine.js data
    const notificationCountComponent = document.querySelector('[x-data="{ notificationCount: 0 }"]');
    if (notificationCountComponent && notificationCountComponent.__x) {
        notificationCountComponent.__x.updateElements({ notificationCount: notificationCount });
    }
}

/**
 * Adds a notification to the dropdown list
 * @param {Object} notification - The notification object
 */
function addNotificationToList(notification) {
    const notificationsList = document.getElementById('notifications-list');
    const template = document.getElementById('notification-template');
    
    // Clear the 'no notifications' message if it exists
    if (notificationsList.querySelector('.text-center')) {
        notificationsList.innerHTML = '';
    }
    
    // Clone the template
    const notificationItem = template.content.cloneNode(true);
    
    // Set the notification content
    notificationItem.querySelector('.notification-item').href = notification.url || '#';
    notificationItem.querySelector('.notification-message').textContent = notification.message;
    
    // Format the timestamp
    const timestamp = new Date(notification.timestamp);
    const timeAgo = getTimeAgo(timestamp);
    notificationItem.querySelector('.notification-time').textContent = timeAgo;
    
    // Add status classes
    if (!notification.is_read) {
        notificationItem.querySelector('.notification-item').classList.add('border-primary-600', 'bg-primary-50');
    }
    
    // Insert at the top of the list
    notificationsList.insertBefore(notificationItem, notificationsList.firstChild);
}

/**
 * Shows a browser notification
 * @param {Object} notification - The notification object
 */
function showBrowserNotification(notification) {
    const notifOptions = {
        body: notification.message,
        icon: '/static/img/logo.png'
    };
    
    const browserNotif = new Notification('PeerLearn', notifOptions);
    
    browserNotif.onclick = function() {
        window.focus();
        if (notification.url) {
            window.location.href = notification.url;
        }
        this.close();
    };
}

/**
 * Requests permission for browser notifications
 */
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support desktop notifications');
        return;
    }
    
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Notification permission granted');
            }
        });
    }
}

/**
 * Returns a human-readable time ago string
 * @param {Date} date - The date to convert
 * @returns {string} - The time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const secondsAgo = Math.floor((now - date) / 1000);
    
    if (secondsAgo < 60) {
        return 'Just now';
    } else if (secondsAgo < 3600) {
        const minutes = Math.floor(secondsAgo / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (secondsAgo < 86400) {
        const hours = Math.floor(secondsAgo / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (secondsAgo < 2592000) {
        const days = Math.floor(secondsAgo / 86400);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

/**
 * Marks all notifications as read
 */
function markAllAsRead() {
    if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
        notificationSocket.send(JSON.stringify({
            'type': 'mark_all_read'
        }));
        
        // Update UI to show all notifications as read
        const notificationItems = document.querySelectorAll('.notification-item');
        notificationItems.forEach(item => {
            item.classList.remove('border-primary-600', 'bg-primary-50');
        });
        
        // Reset the notification count
        updateNotificationCount(0);
    }
}

/**
 * Initializes the notification system
 */
function initNotifications() {
    // Request browser notification permission
    requestNotificationPermission();
    
    // Connect to the WebSocket
    connectNotificationWebSocket();
    
    // Fetch initial notifications
    fetchNotifications();
}

/**
 * Fetches existing notifications from the server
 */
function fetchNotifications() {
    fetch('/api/notifications/')
        .then(response => response.json())
        .then(data => {
            if (data.notifications && data.notifications.length > 0) {
                // Clear the list
                document.getElementById('notifications-list').innerHTML = '';
                
                // Add notifications to the list
                data.notifications.forEach(notification => {
                    addNotificationToList(notification);
                });
                
                // Update the count
                updateNotificationCount(data.unread_count);
            }
        })
        .catch(error => console.error('Error fetching notifications:', error));
}

// Initialize when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add click handler for "Mark all as read" button
    const markAllReadBtn = document.querySelector('button[data-action="mark-all-read"]');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', markAllAsRead);
    }
});