/**
 * Dashboard WebSocket Client for PeerLearn
 * Handles WebSocket connections for real-time updates in the dashboard
 */

class DashboardSocket {
    constructor(userId, onMessageCallback = null) {
        this.userId = userId;
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // Start with 3 seconds
        this.onMessageCallback = onMessageCallback;
        
        // Notification counts for different types
        this.unreadNotifications = 0;
        this.pendingRequests = 0;
        this.upcomingSessions = 0;
        
        // Bind methods to this
        this.connect = this.connect.bind(this);
        this.onOpen = this.onOpen.bind(this);
        this.onMessage = this.onMessage.bind(this);
        this.onClose = this.onClose.bind(this);
        this.onError = this.onError.bind(this);
        this.reconnect = this.reconnect.bind(this);
        this.getNotificationCount = this.getNotificationCount.bind(this);
    }
    
    /**
     * Connect to the WebSocket server
     */
    connect() {
        if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
            console.log('WebSocket already connected or connecting');
            return;
        }
        
        // Determine WebSocket protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/dashboard/${this.userId}/`;
        
        try {
            this.socket = new WebSocket(wsUrl);
            
            // Set up event handlers
            this.socket.onopen = this.onOpen;
            this.socket.onmessage = this.onMessage;
            this.socket.onclose = this.onClose;
            this.socket.onerror = this.onError;
            
            console.log('WebSocket connecting to:', wsUrl);
        } catch (error) {
            console.error('Error creating WebSocket:', error);
            this.reconnect();
        }
    }
    
    /**
     * Handle WebSocket open event
     */
    onOpen(event) {
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 3000;
        
        // Update connected status indicator if it exists
        const statusIndicator = document.getElementById('ws-status-indicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('bg-red-500');
            statusIndicator.classList.add('bg-green-500');
            statusIndicator.setAttribute('title', 'Connected to real-time updates');
        }
        
        // Add a toast notification
        if (window.showToast) {
            window.showToast('Connected to real-time updates', 'success', 3000);
        }
    }
    
    /**
     * Handle WebSocket message event
     */
    onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message:', data);
            
            // Update counts and UI based on message type
            if (data.type === 'unread_notifications') {
                this.unreadNotifications = data.notifications.length;
                this.updateNotificationBadge();
            } 
            else if (data.type === 'notification') {
                this.unreadNotifications++;
                this.updateNotificationBadge();
                
                // Show toast for new notification
                if (window.showToast) {
                    window.showToast(data.notification.title, 'info', 5000);
                }
            }
            else if (data.type === 'session_update') {
                // Handle session updates
                const session = data.session;
                const action = data.action;
                
                // Call user-provided callback if exists
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
                
                // Show toast for session updates
                if (window.showToast) {
                    if (action === 'created') {
                        window.showToast(`New session created: ${session.title}`, 'success');
                    } else if (action === 'updated') {
                        window.showToast(`Session updated: ${session.title}`, 'info');
                    } else if (action === 'cancelled') {
                        window.showToast(`Session cancelled: ${session.title}`, 'warning');
                    }
                }
            }
            else if (data.type === 'booking_update') {
                // Handle booking updates
                const booking = data.booking;
                const action = data.action;
                
                // Call user-provided callback if exists
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
                
                // Show toast for booking updates
                if (window.showToast && booking.session) {
                    if (action === 'created') {
                        window.showToast(`New booking for: ${booking.session.title}`, 'success');
                    } else if (action === 'cancelled') {
                        window.showToast(`Booking cancelled for: ${booking.session.title}`, 'warning');
                    } else if (action === 'confirmed') {
                        window.showToast(`Booking confirmed for: ${booking.session.title}`, 'success');
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }
    
    /**
     * Handle WebSocket close event
     */
    onClose(event) {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.connected = false;
        
        // Update connected status indicator if it exists
        const statusIndicator = document.getElementById('ws-status-indicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('bg-green-500');
            statusIndicator.classList.add('bg-red-500');
            statusIndicator.setAttribute('title', 'Disconnected from real-time updates');
        }
        
        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000) {
            this.reconnect();
        }
    }
    
    /**
     * Handle WebSocket error event
     */
    onError(error) {
        console.error('WebSocket error:', error);
        
        // Show error toast
        if (window.showToast) {
            window.showToast('Connection error. Reconnecting...', 'error', 3000);
        }
    }
    
    /**
     * Attempt to reconnect to the WebSocket server
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            
            // Show error toast
            if (window.showToast) {
                window.showToast('Could not connect to real-time updates. Please refresh the page.', 'error', 0);
            }
            
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            this.connect();
        }, delay);
    }
    
    /**
     * Update the notification badge count in the UI
     */
    updateNotificationBadge() {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (this.unreadNotifications > 0) {
                badge.textContent = this.unreadNotifications;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }
    
    /**
     * Get the current notification count
     */
    getNotificationCount() {
        return this.unreadNotifications;
    }
    
    /**
     * Mark a notification as read
     */
    markNotificationRead(notificationId) {
        if (!this.connected || !this.socket) {
            console.error('WebSocket not connected');
            return;
        }
        
        this.socket.send(JSON.stringify({
            action: 'mark_read',
            notification_id: notificationId
        }));
    }
    
    /**
     * Mark all notifications as read
     */
    markAllNotificationsRead() {
        if (!this.connected || !this.socket) {
            console.error('WebSocket not connected');
            return;
        }
        
        this.socket.send(JSON.stringify({
            action: 'mark_all_read'
        }));
        
        this.unreadNotifications = 0;
        this.updateNotificationBadge();
    }
}

// Create a global instance if we have a user ID
document.addEventListener('DOMContentLoaded', function() {
    const userIdElement = document.getElementById('user-id');
    
    if (userIdElement) {
        const userId = userIdElement.value;
        
        if (userId) {
            // Create global instance
            window.dashboardSocket = new DashboardSocket(userId, function(data) {
                // This callback will be called for all messages
                // We can dispatch to relevant page handlers if needed
                if (window.handleDashboardWebSocketMessage) {
                    window.handleDashboardWebSocketMessage(data);
                }
            });
            
            // Connect to WebSocket
            window.dashboardSocket.connect();
        }
    }
});