/**
 * Dashboard WebSocket Manager for PeerLearn
 * Handles WebSocket connections for dashboard real-time updates
 */

(function() {
    // Don't re-initialize if already defined
    if (typeof window.DashboardWebSocket !== 'undefined') {
        return;
    }

    /**
     * Dashboard WebSocket Manager
     */
    class DashboardWebSocketManager {
        /**
         * Initialize the dashboard WebSocket manager
         */
        constructor() {
            this.socket = null;
            this.userId = null;
            this.connected = false;
            this.reconnectAttempts = 0;
            this.maxReconnectAttempts = 5;
            this.reconnectInterval = 3000; // 3 seconds
            this.subscriptions = new Set();
            this.pingInterval = null;
            this.eventHandlers = {};

            // Initialize when document is loaded
            document.addEventListener('DOMContentLoaded', () => {
                this.initialize();
            });
        }

        /**
         * Initialize the WebSocket connection
         */
        initialize() {
            // Check if we're on a dashboard page with a user-id meta tag
            const userIdMeta = document.querySelector('meta[name="user-id"]');
            if (!userIdMeta) return;
            
            this.userId = userIdMeta.getAttribute('content');
            if (!this.userId) return;
            
            // Connect to WebSocket
            this.connect();
            
            // Add listener for page visibility changes to reconnect if needed
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && !this.connected) {
                    this.connect();
                }
            });
        }

        /**
         * Connect to the WebSocket server
         */
        connect() {
            if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || 
                               this.socket.readyState === WebSocket.OPEN)) {
                return; // Already connected or connecting
            }
            
            try {
                // Determine WebSocket URL
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/ws/dashboard/${this.userId}/`;
                
                // Create WebSocket connection
                this.socket = new WebSocket(wsUrl);
                
                // Setup event handlers
                this.socket.onopen = this.handleOpen.bind(this);
                this.socket.onmessage = this.handleMessage.bind(this);
                this.socket.onclose = this.handleClose.bind(this);
                this.socket.onerror = this.handleError.bind(this);
                
                console.log('Dashboard WebSocket connecting to', wsUrl);
            } catch (error) {
                console.error('Failed to create WebSocket connection:', error);
                this.scheduleReconnect();
            }
        }

        /**
         * Handle WebSocket open event
         */
        handleOpen() {
            console.log('Dashboard WebSocket connected');
            this.connected = true;
            this.reconnectAttempts = 0;
            
            // Start sending pings to keep the connection alive
            this.startPingInterval();
            
            // Fetch initial dashboard data
            this.fetchDashboardData();
            
            // Resubscribe to previous channels if any
            this.resubscribe();
            
            // Dispatch the connected event
            this.dispatchEvent('connected');
        }

        /**
         * Start ping interval to keep connection alive
         */
        startPingInterval() {
            // Clear existing interval if any
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
            }
            
            // Send ping every 30 seconds
            this.pingInterval = setInterval(() => {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.send({
                        type: 'ping',
                        timestamp: new Date().toISOString()
                    });
                }
            }, 30000);
        }

        /**
         * Fetch initial dashboard data
         */
        fetchDashboardData() {
            this.send({
                type: 'get_data'
            });
        }

        /**
         * Resubscribe to saved channels
         */
        resubscribe() {
            if (this.subscriptions.size > 0) {
                for (const channel of this.subscriptions) {
                    this.send({
                        type: 'subscribe',
                        channel: channel
                    });
                }
            }
        }

        /**
         * Handle WebSocket message event
         * @param {MessageEvent} event - The WebSocket message event
         */
        handleMessage(event) {
            try {
                const data = JSON.parse(event.data);
                console.log('Dashboard message received:', data.type);
                
                // Dispatch event based on message type
                this.dispatchEvent(data.type, data);
                
                // Handle specific message types
                switch (data.type) {
                    case 'pong':
                        // Ping response - connection is alive
                        break;
                        
                    case 'dashboard_data':
                        // Dashboard data received
                        this.updateDashboardUI(data);
                        break;
                        
                    case 'sessions_data':
                        // Sessions data received
                        this.updateSessionsUI(data);
                        break;
                        
                    case 'session_update':
                    case 'booking_update':
                    case 'session_request_update':
                    case 'notification_update':
                        // Various real-time updates
                        this.handleRealTimeUpdate(data);
                        break;
                        
                    case 'subscription_success':
                        // Successfully subscribed to a channel
                        this.subscriptions.add(data.channel);
                        break;
                        
                    case 'unsubscription_success':
                        // Successfully unsubscribed from a channel
                        this.subscriptions.delete(data.channel);
                        break;
                        
                    case 'error':
                        // Error from server
                        console.error('Dashboard WebSocket error:', data.message);
                        break;
                }
            } catch (error) {
                console.error('Error handling dashboard WebSocket message:', error);
            }
        }

        /**
         * Handle WebSocket close event
         * @param {CloseEvent} event - The WebSocket close event
         */
        handleClose(event) {
            console.log('Dashboard WebSocket closed:', event.code, event.reason);
            this.connected = false;
            
            // Clear ping interval
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
            
            // Attempt to reconnect if not a normal closure
            if (event.code !== 1000 && event.code !== 1001) {
                this.scheduleReconnect();
            }
            
            // Dispatch the disconnected event
            this.dispatchEvent('disconnected');
        }

        /**
         * Handle WebSocket error event
         * @param {Event} event - The WebSocket error event
         */
        handleError(event) {
            console.error('Dashboard WebSocket error:', event);
            // No need to attempt reconnect here, as onclose will also be called
        }

        /**
         * Schedule reconnection attempt
         */
        scheduleReconnect() {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.warn('Max reconnect attempts reached, giving up');
                return;
            }
            
            const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts);
            console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
            
            setTimeout(() => {
                this.reconnectAttempts++;
                this.connect();
            }, delay);
        }

        /**
         * Send data to the WebSocket server
         * @param {Object} data - The data to send
         */
        send(data) {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                console.warn('Cannot send data, WebSocket is not open');
                return false;
            }
            
            try {
                const json = JSON.stringify(data);
                this.socket.send(json);
                return true;
            } catch (error) {
                console.error('Error sending data to WebSocket:', error);
                return false;
            }
        }

        /**
         * Fetch sessions with optional filters
         * @param {Object} filters - Optional filters for the sessions
         */
        fetchSessions(filters = {}) {
            return this.send({
                type: 'fetch_sessions',
                filters: filters
            });
        }

        /**
         * Subscribe to a channel
         * @param {string} channel - The channel to subscribe to
         */
        subscribe(channel) {
            if (this.subscriptions.has(channel)) {
                return true; // Already subscribed
            }
            
            return this.send({
                type: 'subscribe',
                channel: channel
            });
        }

        /**
         * Unsubscribe from a channel
         * @param {string} channel - The channel to unsubscribe from
         */
        unsubscribe(channel) {
            if (!this.subscriptions.has(channel)) {
                return true; // Not subscribed
            }
            
            return this.send({
                type: 'unsubscribe',
                channel: channel
            });
        }

        /**
         * Mark a notification as read
         * @param {number} notificationId - The ID of the notification
         */
        markNotificationRead(notificationId) {
            return this.send({
                type: 'mark_notification_read',
                notification_id: notificationId
            });
        }

        /**
         * Mark all notifications as read
         */
        markAllNotificationsRead() {
            return this.send({
                type: 'mark_all_notifications_read'
            });
        }

        /**
         * Update dashboard UI with data
         * @param {Object} data - The dashboard data
         */
        updateDashboardUI(data) {
            // This will be handled by Alpine.js components
            // Dispatch events for Alpine components to listen to
            this.dispatchEvent('dashboard_updated', data);
        }

        /**
         * Update sessions UI with data
         * @param {Object} data - The sessions data
         */
        updateSessionsUI(data) {
            // This will be handled by Alpine.js components
            // Dispatch events for Alpine components to listen to
            this.dispatchEvent('sessions_updated', data);
        }

        /**
         * Handle real-time updates
         * @param {Object} data - The update data
         */
        handleRealTimeUpdate(data) {
            // This will trigger a UI update via Alpine.js event listeners
            // Additional handling for specific update types
            if (data.type === 'session_update' && data.status === 'live') {
                this.showSessionLiveNotification(data);
            }
            
            if (data.type === 'notification_update') {
                this.showNewNotification(data);
            }
        }

        /**
         * Show session live notification
         * @param {Object} data - The session data
         */
        showSessionLiveNotification(data) {
            // Check if browser notifications are supported and permitted
            if ('Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification('Session is Live!', {
                    body: `The session "${data.title || 'Unnamed session'}" is now live. Click to join.`,
                    icon: '/static/img/logo-icon.png'
                });
                
                // Open the session when clicking on the notification
                notification.onclick = function() {
                    window.open(`/sessions/${data.session_id}/room/`, '_blank');
                    notification.close();
                };
            }
        }

        /**
         * Show new notification
         * @param {Object} data - The notification data
         */
        showNewNotification(data) {
            // Check if browser notifications are supported and permitted
            if ('Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification('New Notification', {
                    body: data.notification.message || 'You have a new notification',
                    icon: '/static/img/logo-icon.png'
                });
                
                // Open the notifications page when clicking on the notification
                notification.onclick = function() {
                    window.location.href = '/users/dashboard/notifications/';
                    notification.close();
                };
            }
        }

        /**
         * Register an event handler
         * @param {string} eventType - The event type to listen for
         * @param {Function} callback - The callback function
         */
        on(eventType, callback) {
            if (!this.eventHandlers[eventType]) {
                this.eventHandlers[eventType] = [];
            }
            
            this.eventHandlers[eventType].push(callback);
        }

        /**
         * Remove an event handler
         * @param {string} eventType - The event type
         * @param {Function} callback - The callback function to remove
         */
        off(eventType, callback) {
            if (!this.eventHandlers[eventType]) return;
            
            this.eventHandlers[eventType] = this.eventHandlers[eventType].filter(
                handler => handler !== callback
            );
        }

        /**
         * Dispatch an event to all registered handlers
         * @param {string} eventType - The event type
         * @param {Object} data - The event data
         */
        dispatchEvent(eventType, data = {}) {
            if (!this.eventHandlers[eventType]) return;
            
            for (const handler of this.eventHandlers[eventType]) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${eventType} event handler:`, error);
                }
            }
            
            // Also dispatch a CustomEvent for external listeners
            const event = new CustomEvent(`dashboard:${eventType}`, { detail: data });
            document.dispatchEvent(event);
        }

        /**
         * Request permission for browser notifications
         */
        requestNotificationPermission() {
            if ('Notification' in window) {
                if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                    Notification.requestPermission();
                }
            }
        }

        /**
         * Close the WebSocket connection
         */
        close() {
            if (this.socket) {
                this.socket.close();
            }
            
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
        }
    }

    // Create and export the dashboard WebSocket manager
    window.DashboardWebSocket = new DashboardWebSocketManager();
})();