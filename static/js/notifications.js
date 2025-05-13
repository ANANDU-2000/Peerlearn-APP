/**
 * Notifications management for PeerLearn
 * Handles WebSocket connections for real-time notifications
 */

let notificationSocket = null;
let notificationsPingInterval = null;
const NOTIFICATION_PING_INTERVAL = 30000; // 30 seconds
let notificationSoundEnabled = true;

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
    
    try {
        // Create new WebSocket connection
        notificationSocket = new WebSocket(wsUrl);
        
        // Setup event handlers
        notificationSocket.onopen = function(e) {
            console.log('Notification WebSocket connection established');
            
            // Start ping interval to keep connection alive
            startNotificationPingInterval();
        };
        
        notificationSocket.onmessage = function(e) {
            try {
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
            } catch (error) {
                console.error('Error processing notification WebSocket message:', error);
            }
        };
        
        notificationSocket.onclose = function(e) {
            console.log('Notification WebSocket connection closed');
            clearInterval(notificationsPingInterval);
            
            // Attempt to reconnect after a delay
            setTimeout(() => {
                connectNotificationWebSocket(userId);
            }, 3000);
        };
        
        notificationSocket.onerror = function(e) {
            console.error('Notification WebSocket error:', e);
        };
    } catch (error) {
        console.error('Error initializing notification WebSocket:', error);
    }
}

/**
 * Start ping interval to keep connection alive
 */
function startNotificationPingInterval() {
    // Clear existing interval if any
    if (notificationsPingInterval) {
        clearInterval(notificationsPingInterval);
    }
    
    // Send ping every 30 seconds
    notificationsPingInterval = setInterval(() => {
        if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
            notificationSocket.send(JSON.stringify({ 'type': 'ping' }));
        }
    }, NOTIFICATION_PING_INTERVAL);
}

/**
 * Handle new notification message
 * @param {Object} data - The notification data
 */
function handleNewNotification(data) {
    // Play notification sound if enabled
    if (notificationSoundEnabled) {
        playNotificationSound();
    }
    
    // Show notification as toast
    if (typeof showToast === 'function') {
        showToast(data.message, mapNotificationTypeToToastType(data.level));
    }
    
    // Update notification count
    if (data.count !== undefined) {
        updateNotificationCount(data.count);
    }
    
    // Refresh notification list if available
    if (typeof refreshNotificationList === 'function') {
        refreshNotificationList();
    }
}

/**
 * Map notification level to toast type
 * @param {string} level - Notification level ('info', 'warning', 'error', 'success')
 * @returns {string} Toast type
 */
function mapNotificationTypeToToastType(level) {
    switch (level) {
        case 'warning':
            return 'warning';
        case 'error':
            return 'error';
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
}

/**
 * Play notification sound
 */
function playNotificationSound() {
    try {
        const sound = new Audio('/static/sounds/notification.mp3');
        sound.volume = 0.5;
        sound.play();
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}

/**
 * Toggle notification sounds
 * @param {boolean} enabled - Whether to enable notification sounds
 */
function toggleNotificationSounds(enabled) {
    notificationSoundEnabled = enabled;
    localStorage.setItem('notification_sound_enabled', enabled ? 'true' : 'false');
}

/**
 * Get notification sound setting
 * @returns {boolean} Whether notification sounds are enabled
 */
function getNotificationSoundSetting() {
    const setting = localStorage.getItem('notification_sound_enabled');
    return setting === null ? true : setting === 'true';
}

/**
 * Initialize notifications panel
 */
function initNotifications() {
    // Load notification sound setting
    notificationSoundEnabled = getNotificationSoundSetting();
    
    // Get user ID for WebSocket connection
    const userIdElement = document.querySelector('meta[name="user-id"]');
    if (userIdElement) {
        const userId = userIdElement.getAttribute('content');
        if (userId) {
            connectNotificationWebSocket(userId);
        }
    }
    
    // Setup notification panel UI
    setupNotificationPanel();
    
    // Fetch initial notification count
    fetchNotificationCount();
}

/**
 * Setup notification panel event listeners
 */
function setupNotificationPanel() {
    // Toggle notification panel
    const notificationButton = document.getElementById('notification-button');
    const notificationPanel = document.getElementById('notification-panel');
    
    if (notificationButton && notificationPanel) {
        notificationButton.addEventListener('click', () => {
            const isHidden = notificationPanel.classList.contains('hidden');
            
            if (isHidden) {
                notificationPanel.classList.remove('hidden');
                fetchNotifications();
            } else {
                notificationPanel.classList.add('hidden');
            }
        });
        
        // Close panel when clicking outside
        document.addEventListener('click', (event) => {
            if (!notificationPanel.classList.contains('hidden') && 
                !notificationPanel.contains(event.target) && 
                !notificationButton.contains(event.target)) {
                notificationPanel.classList.add('hidden');
            }
        });
        
        // Mark all as read button
        const markAllReadButton = document.getElementById('mark-all-read');
        if (markAllReadButton) {
            markAllReadButton.addEventListener('click', () => {
                markAllNotificationsRead();
            });
        }
    }
    
    // Setup notification sound toggle
    const soundToggle = document.getElementById('notification-sound-toggle');
    if (soundToggle) {
        soundToggle.checked = notificationSoundEnabled;
        soundToggle.addEventListener('change', (e) => {
            toggleNotificationSounds(e.target.checked);
        });
    }
}

/**
 * Mark a notification as read
 * @param {string} notificationId - The ID of the notification
 */
function markNotificationRead(notificationId) {
    const notification = document.querySelector(`[data-notification-id="${notificationId}"]`);
    if (notification) {
        notification.classList.remove('bg-blue-50');
        notification.classList.add('bg-white');
    }
    
    // Call API to mark as read
    markNotificationReadAPI(notificationId);
}

/**
 * Mark all notifications as read
 */
function markAllNotificationsRead() {
    const notifications = document.querySelectorAll('.notification-item');
    notifications.forEach(notification => {
        notification.classList.remove('bg-blue-50');
        notification.classList.add('bg-white');
    });
    
    // Call API to mark all as read
    markAllNotificationsReadAPI();
}

/**
 * Fetch notification count
 */
async function fetchNotificationCount() {
    try {
        const response = await fetch('/api/notifications/count/');
        const data = await response.json();
        updateNotificationCount(data.count);
    } catch (error) {
        console.error('Error fetching notification count:', error);
    }
}

/**
 * Fetch notifications for the notification panel
 */
async function fetchNotifications() {
    try {
        const response = await fetch('/api/notifications/');
        const data = await response.json();
        renderNotifications(data.notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
    }
}

/**
 * Render notifications in the notification panel
 * @param {Array} notifications - List of notification objects
 */
function renderNotifications(notifications) {
    const notificationList = document.getElementById('notification-list');
    if (!notificationList) return;
    
    if (!notifications || notifications.length === 0) {
        notificationList.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                No notifications
            </div>
        `;
        return;
    }
    
    let notificationHTML = '';
    
    notifications.forEach(notification => {
        const bgClass = notification.is_read ? 'bg-white' : 'bg-blue-50';
        const timeAgo = getTimeAgo(notification.created_at);
        
        notificationHTML += `
            <div class="notification-item ${bgClass} p-3 border-b hover:bg-gray-50 transition-colors cursor-pointer" 
                data-notification-id="${notification.id}" 
                onclick="markNotificationRead('${notification.id}')">
                <div class="flex items-start">
                    <div class="mr-3 mt-0.5">
                        <span class="inline-block w-2 h-2 rounded-full ${notification.is_read ? 'bg-gray-300' : 'bg-blue-500'}"></span>
                    </div>
                    <div class="flex-grow">
                        <p class="text-sm text-gray-800 mb-1">${notification.message}</p>
                        <p class="text-xs text-gray-500">${timeAgo}</p>
                    </div>
                </div>
            </div>
        `;
    });
    
    notificationList.innerHTML = notificationHTML;
}

/**
 * Format a date as a "time ago" string
 * @param {string} dateString - ISO date string
 * @returns {string} Time ago string (e.g. "2 hours ago")
 */
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) {
        return 'just now';
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    
    const months = Math.floor(days / 30);
    if (months < 12) {
        return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    }
    
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/**
 * Mark a notification as read via API
 * @param {string} notificationId - The ID of the notification
 */
async function markNotificationReadAPI(notificationId) {
    try {
        const response = await fetch(`/api/notifications/${notificationId}/read/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });
        
        if (response.ok) {
            // Update count
            const countResponse = await fetch('/api/notifications/count/');
            const data = await countResponse.json();
            updateNotificationCount(data.count);
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
        const response = await fetch('/api/notifications/read-all/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });
        
        if (response.ok) {
            // Update count to zero
            updateNotificationCount(0);
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

// Initialize notifications when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (document.querySelector('.notification-count')) {
        initNotifications();
    }
});

// Make functions available globally
window.connectNotificationWebSocket = connectNotificationWebSocket;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.toggleNotificationSounds = toggleNotificationSounds;