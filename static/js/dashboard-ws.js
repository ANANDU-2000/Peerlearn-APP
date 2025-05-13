/**
 * Dashboard WebSocket Client for PeerLearn
 * Handles WebSocket connections for real-time updates in the dashboard
 * Updated with enhanced debugging and connection logic
 */

class DashboardSocket {
    constructor(userId, onMessageCallback = null) {
        this.userId = userId;
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10; // Increased from 5 to 10
        this.reconnectDelay = 2000; // Start with 2 seconds instead of 3
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
        
        // Debug logging
        console.log('DashboardSocket initialized with userId:', userId);
    }
    
    /**
     * Connect to the WebSocket server
     */
    connect() {
        if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
            console.log('WebSocket already connected or connecting. State:', this.getReadyStateText(this.socket.readyState));
            return;
        }
        
        // Close any existing socket that might be in a closing or closed state
        if (this.socket) {
            try {
                this.socket.close();
            } catch (err) {
                console.warn('Error closing existing socket:', err);
            }
        }
        
        // Log WebSocket support
        if (!window.WebSocket) {
            console.error('WebSocket is not supported by this browser!');
            if (window.showToast) {
                window.showToast('Your browser does not support real-time updates', 'error', 0);
            }
            return;
        }
        
        // Determine WebSocket protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Use alternate URL format without path if the normal URL fails
        const wsUrl = `${protocol}//${window.location.host}/ws/dashboard/${this.userId}/`;
        
        try {
            console.log(`WebSocket connecting to: ${wsUrl}`);
            
            // Create new WebSocket connection
            this.socket = new WebSocket(wsUrl);
            
            // Set up event handlers
            this.socket.onopen = this.onOpen;
            this.socket.onmessage = this.onMessage;
            this.socket.onclose = this.onClose;
            this.socket.onerror = this.onError;
            
            // Update UI to show connecting state
            const statusIndicator = document.getElementById('ws-status-indicator');
            if (statusIndicator) {
                statusIndicator.classList.remove('bg-green-500', 'bg-red-500');
                statusIndicator.classList.add('bg-yellow-500');
                statusIndicator.setAttribute('title', 'Connecting to real-time updates...');
            }
            
            if (window.showToast) {
                window.showToast('Connecting to real-time updates...', 'info', 3000);
            }
            
        } catch (error) {
            console.error('Error creating WebSocket:', error);
            this.reconnect();
        }
    }
    
    /**
     * Helper method to get text representation of WebSocket readyState
     */
    getReadyStateText(readyState) {
        switch (readyState) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return 'UNKNOWN';
        }
    }
    
    /**
     * Handle WebSocket open event
     */
    onOpen(event) {
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 2000; // Reset to initial value
        
        // Update connected status indicator if it exists
        const statusIndicator = document.getElementById('ws-status-indicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('bg-red-500', 'bg-yellow-500');
            statusIndicator.classList.add('bg-green-500');
            statusIndicator.setAttribute('title', 'Connected to real-time updates');
        }
        
        // Add a toast notification
        if (window.showToast) {
            window.showToast('Connected to real-time updates', 'success', 3000);
        }
        
        // Request dashboard data once connected
        this.requestDashboardData();
        
        // Start ping interval to keep connection alive
        this.startPingInterval();
    }
    
    /**
     * Start ping interval to keep connection alive
     */
    startPingInterval() {
        // Clear any existing ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        // Set up new ping interval (every 30 seconds)
        this.pingInterval = setInterval(() => {
            if (this.connected && this.socket && this.socket.readyState === WebSocket.OPEN) {
                try {
                    console.log('Sending ping to keep connection alive');
                    this.socket.send(JSON.stringify({
                        action: 'ping',
                        session_id: Math.floor(Math.random() * 1000000),
                        timestamp: new Date().toISOString()
                    }));
                } catch (error) {
                    console.error('Error sending ping:', error);
                }
            } else if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                console.log(`Connection not open. Current state: ${this.getReadyStateText(this.socket.readyState)}`);
                this.reconnect();
            }
        }, 30000); // 30 seconds
        
        console.log('Started ping interval');
    }
    
    /**
     * Request dashboard data from the server
     */
    requestDashboardData() {
        if (!this.connected || !this.socket) {
            console.error('WebSocket not connected');
            return;
        }
        
        try {
            console.log('Requesting dashboard data');
            this.socket.send(JSON.stringify({
                action: 'get_dashboard_data'
            }));
        } catch (error) {
            console.error('Error requesting dashboard data:', error);
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
        console.log(`WebSocket disconnected: Code=${event.code}, Reason="${event.reason || 'No reason provided'}"`);
        this.connected = false;
        
        // Update connected status indicator if it exists
        const statusIndicator = document.getElementById('ws-status-indicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('bg-green-500', 'bg-yellow-500');
            statusIndicator.classList.add('bg-red-500');
            statusIndicator.setAttribute('title', `Disconnected: ${this.getCloseReasonText(event.code)}`);
        }
        
        // Show specific close reason toast
        if (window.showToast) {
            // Different messages based on close reason
            if (event.code === 1000) {
                window.showToast('Connection closed normally', 'info', 3000);
            } else if (event.code === 1001) {
                window.showToast('Connection closed: Page navigation', 'info', 3000);
            } else if (event.code === 1006) {
                window.showToast('Connection lost. Attempting to reconnect...', 'warning', 3000);
            } else if (event.code === 4001) {
                window.showToast('Authentication required. Please refresh the page.', 'error', 0);
            } else if (event.code === 4004) {
                window.showToast('Server connection issue. Reconnecting...', 'warning', 3000);
            } else {
                window.showToast(`Connection closed (${event.code}). Reconnecting...`, 'warning', 3000);
            }
        }
        
        // Attempt to reconnect for all abnormal closures
        if (event.code !== 1000 && event.code !== 1001) {
            this.reconnect();
        }
    }
    
    /**
     * Get user-friendly text for WebSocket close code
     */
    getCloseReasonText(code) {
        const reasons = {
            1000: 'Normal closure',
            1001: 'Going away (page navigation)',
            1002: 'Protocol error',
            1003: 'Unsupported data',
            1005: 'No status received',
            1006: 'Abnormal closure (connection lost)',
            1007: 'Invalid frame payload data',
            1008: 'Policy violation',
            1009: 'Message too big',
            1010: 'Mandatory extension missing',
            1011: 'Internal server error',
            1012: 'Service restart',
            1013: 'Try again later',
            1015: 'TLS handshake error',
            4000: 'General application error',
            4001: 'Not authenticated',
            4002: 'No channel layer',
            4003: 'Authentication mismatch',
            4004: 'URL path not found',
            4005: 'Group join error'
        };
        return reasons[code] || `Unknown reason (${code})`;
    }
    
    /**
     * Handle WebSocket error event
     */
    onError(error) {
        console.error('WebSocket error:', error);
        
        // Update status indicator
        const statusIndicator = document.getElementById('ws-status-indicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('bg-green-500', 'bg-yellow-500');
            statusIndicator.classList.add('bg-red-500');
            statusIndicator.setAttribute('title', 'Connection error');
        }
        
        // Show error toast
        if (window.showToast) {
            window.showToast('Connection error. Trying to reconnect...', 'error', 3000);
        }
        
        // Note: We don't need to call reconnect() here as the onclose handler will be called after an error
    }
    
    /**
     * Attempt to reconnect to the WebSocket server
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            
            // Update status indicator
            const statusIndicator = document.getElementById('ws-status-indicator');
            if (statusIndicator) {
                statusIndicator.setAttribute('title', 'Max reconnection attempts reached');
            }
            
            // Show error toast
            if (window.showToast) {
                window.showToast('Could not connect to real-time updates. Please refresh the page or try again later.', 'error', 0);
            }
            
            return;
        }
        
        this.reconnectAttempts++;
        
        // Exponential backoff with maximum limit
        const backoffFactor = Math.min(Math.pow(1.5, this.reconnectAttempts - 1), 5);
        const delay = Math.min(this.reconnectDelay * backoffFactor, 30000); // Max 30 seconds
        
        console.log(`Reconnecting in ${Math.round(delay/1000)} seconds (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        // Update status indicator
        const statusIndicator = document.getElementById('ws-status-indicator');
        if (statusIndicator) {
            statusIndicator.setAttribute('title', `Reconnecting in ${Math.round(delay/1000)}s (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        }
        
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
            action: 'mark_notification_read',
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
            action: 'mark_all_notifications_read'
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