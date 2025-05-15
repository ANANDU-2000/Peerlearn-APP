/**
 * Dashboard Notifications for PeerLearn
 * Handles notification display and interactions for all dashboard pages
 */

(function() {
    // Don't re-initialize if already defined
    if (typeof window.DashboardNotifications !== 'undefined') {
        return;
    }
    
    /**
     * Dashboard Notifications System
     */
    class DashboardNotificationsSystem {
        /**
         * Initialize the notifications system
         */
        constructor() {
            this.userId = null;
            this.unreadCount = 0;
            this.notifications = [];
            this.notificationContainer = null;
            this.countBadges = [];
            
            // Initialize when document is loaded
            document.addEventListener('DOMContentLoaded', () => {
                this.initialize();
            });
        }
        
        /**
         * Initialize the system
         */
        initialize() {
            // Find user ID
            const userIdMeta = document.querySelector('meta[name="user-id"]');
            if (!userIdMeta) return;
            
            this.userId = userIdMeta.getAttribute('content');
            if (!this.userId) return;
            
            // Find notification elements
            this.notificationContainer = document.getElementById('notification-dropdown');
            this.countBadges = document.querySelectorAll('.notification-count');
            
            // Add event listeners
            document.addEventListener('dashboard:notification_update', (event) => {
                this.handleNotificationUpdate(event.detail);
            });
            
            document.addEventListener('dashboard:dashboard_data', (event) => {
                if (event.detail.notifications) {
                    this.updateNotifications(event.detail.notifications);
                }
            });
            
            // Setup mark as read handlers
            document.addEventListener('click', (event) => {
                if (event.target.closest('.mark-notification-read')) {
                    const notificationId = event.target.closest('.mark-notification-read').dataset.id;
                    this.markAsRead(notificationId);
                    event.preventDefault();
                    event.stopPropagation();
                }
                
                if (event.target.closest('#mark-all-read')) {
                    this.markAllAsRead();
                    event.preventDefault();
                    event.stopPropagation();
                }
            });
            
            // Request browser notification permission
            this.requestNotificationPermission();
        }
        
        /**
         * Handle notification update from WebSocket
         * @param {Object} data - Notification data
         */
        handleNotificationUpdate(data) {
            if (!data.notification) return;
            
            // Add the new notification to the list
            this.notifications.unshift(data.notification);
            
            // Update the unread count
            this.unreadCount++;
            
            // Update the UI
            this.updateBadges();
            this.renderNotifications();
            
            // Show browser notification
            this.showBrowserNotification(data.notification);
            
            // Play sound via NotificationSounds system if available
            if (window.NotificationSounds) {
                window.NotificationSounds.playSound('NEW_NOTIFICATION');
            }
        }
        
        /**
         * Update notifications from dashboard data
         * @param {Array} notifications - List of notifications
         */
        updateNotifications(notifications) {
            this.notifications = notifications || [];
            
            // Count unread notifications
            this.unreadCount = this.notifications.filter(n => !n.read).length;
            
            // Update the UI
            this.updateBadges();
            this.renderNotifications();
        }
        
        /**
         * Update notification count badges
         */
        updateBadges() {
            this.countBadges.forEach(badge => {
                badge.textContent = this.unreadCount;
                
                if (this.unreadCount > 0) {
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            });
        }
        
        /**
         * Render notifications in dropdown
         */
        renderNotifications() {
            if (!this.notificationContainer) return;
            
            // Get the list element
            const notificationList = this.notificationContainer.querySelector('.notification-list');
            if (!notificationList) return;
            
            // Clear existing notifications
            notificationList.innerHTML = '';
            
            // Show empty state if no notifications
            if (this.notifications.length === 0) {
                notificationList.innerHTML = `
                    <div class="py-4 px-2 text-center text-gray-500">
                        <p>No notifications yet</p>
                    </div>
                `;
                return;
            }
            
            // Render each notification
            this.notifications.slice(0, 10).forEach(notification => {
                const li = document.createElement('li');
                li.className = notification.read ? 'read' : 'unread';
                
                const notificationTime = new Date(notification.created_at);
                const timeAgo = this.getTimeAgo(notificationTime);
                
                li.innerHTML = `
                    <a href="${notification.url || '#'}" class="block hover:bg-gray-50 px-4 py-3 border-b ${notification.read ? 'bg-white' : 'bg-blue-50'}">
                        <div class="flex justify-between">
                            <p class="text-sm font-medium text-gray-900">${notification.title || 'Notification'}</p>
                            <p class="text-xs text-gray-500">${timeAgo}</p>
                        </div>
                        <p class="text-sm text-gray-600 mt-1">${notification.message || ''}</p>
                        ${!notification.read ? `
                            <button class="mark-notification-read mt-2 text-xs text-blue-600 hover:text-blue-800" data-id="${notification.id}">
                                Mark as read
                            </button>
                        ` : ''}
                    </a>
                `;
                
                notificationList.appendChild(li);
            });
            
            // Add "Mark all as read" button if there are unread notifications
            const footerActions = this.notificationContainer.querySelector('.notification-actions');
            if (footerActions) {
                footerActions.innerHTML = '';
                
                if (this.unreadCount > 0) {
                    const markAllButton = document.createElement('button');
                    markAllButton.id = 'mark-all-read';
                    markAllButton.className = 'text-sm text-blue-600 hover:text-blue-800';
                    markAllButton.textContent = 'Mark all as read';
                    footerActions.appendChild(markAllButton);
                }
                
                const viewAllLink = document.createElement('a');
                viewAllLink.href = '/users/dashboard/notifications/';
                viewAllLink.className = 'text-sm text-blue-600 hover:text-blue-800 ml-auto';
                viewAllLink.textContent = 'View all';
                footerActions.appendChild(viewAllLink);
            }
        }
        
        /**
         * Show browser notification
         * @param {Object} notification - Notification data
         */
        showBrowserNotification(notification) {
            if (!('Notification' in window) || Notification.permission !== 'granted') {
                return;
            }
            
            try {
                const notif = new Notification(notification.title || 'New Notification', {
                    body: notification.message || '',
                    icon: '/static/img/logo-icon.png'
                });
                
                // Close after 5 seconds
                setTimeout(() => notif.close(), 5000);
                
                // Handle click
                notif.onclick = function() {
                    window.focus();
                    if (notification.url) {
                        window.location.href = notification.url;
                    }
                    notif.close();
                };
            } catch (error) {
                console.warn('Error showing browser notification:', error);
            }
        }
        
        /**
         * Mark a notification as read
         * @param {string} notificationId - ID of notification to mark as read
         */
        markAsRead(notificationId) {
            // Find the notification in the list
            const index = this.notifications.findIndex(n => n.id == notificationId);
            
            if (index !== -1 && !this.notifications[index].read) {
                // Mark as read in local list
                this.notifications[index].read = true;
                
                // Decrement unread count
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                
                // Update UI
                this.updateBadges();
                this.renderNotifications();
                
                // Send to server via WebSocket
                if (window.DashboardWebSocket) {
                    window.DashboardWebSocket.markNotificationRead(notificationId);
                } else {
                    // Fallback to API
                    fetch(`/api/notifications/${notificationId}/read/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': this.getCsrfToken()
                        }
                    }).catch(error => {
                        console.error('Error marking notification as read:', error);
                    });
                }
            }
        }
        
        /**
         * Mark all notifications as read
         */
        markAllAsRead() {
            // Mark all as read in local list
            this.notifications.forEach(notification => {
                notification.read = true;
            });
            
            // Reset unread count
            this.unreadCount = 0;
            
            // Update UI
            this.updateBadges();
            this.renderNotifications();
            
            // Send to server via WebSocket
            if (window.DashboardWebSocket) {
                window.DashboardWebSocket.markAllNotificationsRead();
            } else {
                // Fallback to API
                fetch('/api/notifications/mark-all-read/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    }
                }).catch(error => {
                    console.error('Error marking all notifications as read:', error);
                });
            }
        }
        
        /**
         * Get CSRF token from cookies
         * @returns {string} CSRF token
         */
        getCsrfToken() {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.startsWith('csrftoken=')) {
                    return cookie.substring('csrftoken='.length);
                }
            }
            return '';
        }
        
        /**
         * Get relative time string
         * @param {Date} date - Date to format
         * @returns {string} Relative time string
         */
        getTimeAgo(date) {
            const now = new Date();
            const diffSeconds = Math.floor((now - date) / 1000);
            
            if (diffSeconds < 60) {
                return 'Just now';
            }
            
            const diffMinutes = Math.floor(diffSeconds / 60);
            if (diffMinutes < 60) {
                return `${diffMinutes}m ago`;
            }
            
            const diffHours = Math.floor(diffMinutes / 60);
            if (diffHours < 24) {
                return `${diffHours}h ago`;
            }
            
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) {
                return `${diffDays}d ago`;
            }
            
            // Format as date for older notifications
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }
        
        /**
         * Request browser notification permission
         */
        requestNotificationPermission() {
            if ('Notification' in window) {
                if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                    Notification.requestPermission();
                }
            }
        }
    }
    
    // Create and export the notifications system
    window.DashboardNotifications = new DashboardNotificationsSystem();
})();