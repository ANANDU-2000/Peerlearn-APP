/**
 * Dashboard WebSocket Connection
 * Handles real-time updates for the dashboard
 */

// Use an IIFE to prevent variable name collisions
(function() {
// Don't re-initialize if already defined
if (typeof window.initDashboardWebSocket !== 'undefined') {
    return;
}

// Set up window unloading flag to prevent reconnection attempts when page is closing
if (typeof window.isUnloading === 'undefined') {
    window.isUnloading = false;
    window.addEventListener('beforeunload', () => {
        window.isUnloading = true;
    });
}

// WebSocket connection for dashboard
let dashboardSocket = null;
let reconnectAttempts = 0;
let reconnectInterval = 2000; // Start with 2s
const maxReconnectAttempts = 5;

/**
 * Initialize dashboard WebSocket connection
 * @param {string} userId - User ID for WebSocket connection
 */
function initDashboardWebSocket(userId) {
    // Validate the user ID
    if (!userId) {
        console.debug('No user ID provided to initDashboardWebSocket. This is expected on public pages.');
        return;
    }
    
    // Store user ID in a global variable
    window.USER_ID = userId;
    
    console.log('Initializing dashboard WebSocket for user:', window.USER_ID);
    
    // Connect to WebSocket
    connectDashboardWebSocket();
    
    // Add window event listeners for reconnection
    window.addEventListener('online', () => {
        console.log('Browser online event - attempting to reconnect dashboard WebSocket');
        connectDashboardWebSocket();
    });
}

/**
 * Connect to dashboard WebSocket
 */
function connectDashboardWebSocket() {
    // Validate that USER_ID is available
    if (!window.USER_ID) {
        console.warn('Cannot connect dashboard WebSocket: No USER_ID available');
        return;
    }
    
    // Close existing connection if any
    if (dashboardSocket && dashboardSocket.readyState !== WebSocket.CLOSED) {
        dashboardSocket.close();
    }
    
    // Create WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/dashboard/${window.USER_ID}/`;
    
    try {
        console.log(`Connecting to dashboard WebSocket at ${wsUrl}`);
        
        // Create WebSocket connection
        dashboardSocket = new WebSocket(wsUrl);
        
        // Set event handlers
        dashboardSocket.onopen = onDashboardSocketOpen;
        dashboardSocket.onmessage = onDashboardSocketMessage;
        dashboardSocket.onclose = onDashboardSocketClose;
        dashboardSocket.onerror = onDashboardSocketError;
    } catch (error) {
        console.error('Error creating dashboard WebSocket:', error);
    }
}

/**
 * Handle WebSocket open event
 */
function onDashboardSocketOpen(event) {
    console.log('Dashboard WebSocket connected');
    
    // Reset reconnection variables
    reconnectAttempts = 0;
    reconnectInterval = 2000;
    
    // Request initial data
    sendDashboardMessage({
        type: 'get_data'
    });
    
    // Show toast notification if page was reloaded
    if (sessionStorage.getItem('dashboard_reconnect') === 'true') {
        sessionStorage.removeItem('dashboard_reconnect');
        if (window.showToast) {
            window.showToast('Dashboard connected - data is now live', 'success');
        }
    }
}

/**
 * Handle WebSocket message event
 */
function onDashboardSocketMessage(event) {
    // Parse message data
    const data = JSON.parse(event.data);
    console.log('Dashboard message received:', data.type);
    
    // Handle different message types
    switch (data.type) {
        case 'session_update':
            handleSessionUpdate(data);
            break;
        case 'booking_update':
            handleBookingUpdate(data);
            break;
        case 'session_request_update':
            handleSessionRequestUpdate(data);
            break;
        case 'notification_update':
            handleNotificationUpdate(data);
            break;
        case 'dashboard_data':
            handleDashboardData(data);
            break;
        case 'connection_established':
        case 'joined_group':
            // Just log these messages, no action needed
            console.log(`Dashboard WebSocket: ${data.type}`);
            break;
        case 'ping':
            // Respond with pong to keep connection alive
            sendDashboardMessage({ type: 'pong' });
            break;
        case 'error':
            console.error('Dashboard WebSocket error:', data.message || 'Unknown error');
            break;
        default:
            console.warn('Unknown dashboard message type:', data.type);
    }
}

/**
 * Handle WebSocket close event
 */
function onDashboardSocketClose(event) {
    console.log('Dashboard WebSocket closed:', event.code, event.reason);
    
    // Check if window is closing/page is unloading - no need to reconnect in that case
    if (window.isUnloading) {
        console.log('Page is unloading, not attempting to reconnect dashboard WebSocket');
        return;
    }
    
    // Determine if we should reconnect based on the close code
    // Don't reconnect for authentication failures (4003) or policy violations (1008)
    const shouldNotReconnect = [1008, 4003].includes(event.code);
    
    if (shouldNotReconnect) {
        console.warn(`Not reconnecting dashboard WebSocket due to close code ${event.code}: ${event.reason}`);
        return;
    }
    
    // Set reconnect flag for page reload detection
    sessionStorage.setItem('dashboard_reconnect', 'true');
    
    // Attempt to reconnect with exponential backoff
    if (reconnectAttempts < maxReconnectAttempts) {
        // Calculate delay with exponential backoff and a bit of randomization
        const delay = reconnectInterval * (1 + (Math.random() * 0.1));
        console.log(`Reconnecting dashboard WebSocket in ${(delay/1000).toFixed(1)}s (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        
        setTimeout(() => {
            reconnectAttempts++;
            reconnectInterval = Math.min(30000, reconnectInterval * 2); // Max 30s
            connectDashboardWebSocket();
        }, delay);
    } else {
        console.error('Max reconnect attempts reached for dashboard WebSocket');
        
        // Update connection indicator
        const indicator = document.getElementById('ws-status-indicator');
        if (indicator) {
            indicator.classList.remove('bg-green-500');
            indicator.classList.add('bg-red-500');
            indicator.setAttribute('title', 'Disconnected from real-time updates');
        }
        
        // Show toast with reload option
        if (window.showToast) {
            const reloadToast = window.showToast(
                'Connection lost. Please reload the page to reconnect.',
                'error',
                0 // Don't auto-dismiss
            );
            
            // Add reload button to toast
            if (reloadToast) {
                const reloadBtn = document.createElement('button');
                reloadBtn.className = 'ml-2 inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500';
                reloadBtn.textContent = 'Reload Now';
                reloadBtn.addEventListener('click', () => window.location.reload());
                
                // Find toast text container
                const textContainer = reloadToast.querySelector('.text-sm');
                if (textContainer) {
                    textContainer.appendChild(reloadBtn);
                }
            }
        }
    }
}

/**
 * Handle WebSocket error event
 */
function onDashboardSocketError(error) {
    console.error('Dashboard WebSocket error:', error);
}

/**
 * Send message to dashboard WebSocket
 * @param {Object} message - Message to send
 * @returns {boolean} - Whether the message was sent
 */
function sendDashboardMessage(message) {
    // Check if we're on an authenticated page
    if (!window.USER_ID) {
        console.debug('No user ID available, dashboard message not sent');
        return false;
    }

    if (!dashboardSocket) {
        console.warn('Dashboard WebSocket not initialized, message not sent');
        return false;
    }
    
    if (dashboardSocket.readyState === WebSocket.OPEN) {
        try {
            const messageString = JSON.stringify(message);
            dashboardSocket.send(messageString);
            return true;
        } catch (error) {
            console.error('Error sending message to dashboard WebSocket:', error);
            return false;
        }
    } else {
        console.warn(`Dashboard WebSocket not open (state: ${dashboardSocket.readyState}), message not sent:`, message);
        return false;
    }
}

/**
 * Handle session update message
 * @param {Object} data - Session update data
 */
function handleSessionUpdate(data) {
    const session = data.session;
    console.log('Session update:', session);
    
    // Show toast notification
    let toastMessage = '';
    let toastType = 'info';
    
    switch (data.action) {
        case 'created':
            toastMessage = `New session created: ${session.title}`;
            toastType = 'success';
            break;
        case 'updated':
            toastMessage = `Session updated: ${session.title}`;
            break;
        case 'deleted':
            toastMessage = `Session deleted: ${session.title}`;
            toastType = 'warning';
            break;
        case 'status_changed':
            toastMessage = `Session status changed to ${session.status}: ${session.title}`;
            if (session.status === 'live') {
                toastType = 'success';
            } else if (session.status === 'completed') {
                toastType = 'success';
            } else if (session.status === 'cancelled') {
                toastType = 'warning';
            }
            break;
    }
    
    if (toastMessage && window.showToast) {
        window.showToast(toastMessage, toastType);
    }
    
    // If in sessions page, update UI
    updateSessionsUI(session, data.action);
    
    // Update earnings if mentor dashboard
    updateEarningsUI(data.earnings);
}

/**
 * Handle booking update message
 * @param {Object} data - Booking update data
 */
function handleBookingUpdate(data) {
    const booking = data.booking;
    console.log('Booking update:', booking);
    
    // Show toast notification
    let toastMessage = '';
    let toastType = 'info';
    
    switch (data.action) {
        case 'created':
            toastMessage = `New booking for: ${booking.session.title}`;
            toastType = 'success';
            break;
        case 'cancelled':
            toastMessage = `Booking cancelled: ${booking.session.title}`;
            toastType = 'warning';
            break;
        case 'completed':
            toastMessage = `Session completed: ${booking.session.title}`;
            toastType = 'success';
            break;
    }
    
    if (toastMessage && window.showToast) {
        window.showToast(toastMessage, toastType);
    }
    
    // Update bookings UI if on bookings page
    updateBookingsUI(booking, data.action);
    
    // Update session details if on that page
    updateSessionDetailUI(booking.session.id);
}

/**
 * Handle session request update message
 * @param {Object} data - Session request update data
 */
function handleSessionRequestUpdate(data) {
    const request = data.request;
    console.log('Session request update:', request);
    
    // Show toast notification
    let toastMessage = '';
    let toastType = 'info';
    
    switch (data.action) {
        case 'created':
            toastMessage = `New session request: ${request.title}`;
            toastType = 'success';
            break;
        case 'accepted':
            toastMessage = `Session request accepted: ${request.title}`;
            toastType = 'success';
            break;
        case 'rejected':
            toastMessage = `Session request rejected: ${request.title}`;
            toastType = 'warning';
            break;
        case 'counter_offer':
            toastMessage = `Counter offer for request: ${request.title}`;
            break;
    }
    
    if (toastMessage && window.showToast) {
        window.showToast(toastMessage, toastType);
    }
    
    // Update requests UI if on requests page
    updateRequestsUI(request, data.action);
}

/**
 * Handle notification update message
 * @param {Object} data - Notification update data
 */
function handleNotificationUpdate(data) {
    // This may be handled by the notifications.js system
    if (window.processNewNotification) {
        window.processNewNotification(data.notification);
    }
}

/**
 * Handle dashboard data message
 * @param {Object} data - Dashboard data
 */
function handleDashboardData(data) {
    console.log('Received dashboard data:', data);
    
    // Update various dashboard sections
    
    // Update sessions list if present
    if (data.sessions) {
        updateSessionsListUI(data.sessions);
    }
    
    // Update bookings list if present
    if (data.bookings) {
        updateBookingsListUI(data.bookings);
    }
    
    // Update session requests list if present
    if (data.session_requests) {
        updateRequestsListUI(data.session_requests);
    }
    
    // Update stats if present
    if (data.stats) {
        updateStatsUI(data.stats);
    }
    
    // Update earnings if present
    if (data.earnings) {
        updateEarningsUI(data.earnings);
    }
}

/**
 * Update sessions UI when session data changes
 * @param {Object} session - Session data
 * @param {string} action - Action type (created, updated, deleted, status_changed)
 */
function updateSessionsUI(session, action) {
    // Check if we're on sessions page
    const sessionsContainer = document.querySelector('.sessions-tab-content[data-tab="today"], .sessions-tab-content[data-tab="upcoming"], .sessions-tab-content[data-tab="past"]');
    if (!sessionsContainer) return;
    
    // Handle action
    if (action === 'created') {
        // Get sessions list
        refreshSessionsList();
    } else if (action === 'updated' || action === 'status_changed') {
        // Find and update existing session
        const sessionElement = document.getElementById(`session-${session.id}`);
        if (sessionElement) {
            // Update status indicator
            const statusIndicator = sessionElement.querySelector('.session-status');
            if (statusIndicator) {
                // Remove all status classes
                statusIndicator.classList.remove('bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800', 
                    'bg-yellow-100', 'text-yellow-800', 'bg-gray-100', 'text-gray-800', 'bg-blue-100', 'text-blue-800');
                
                // Add appropriate class based on status
                if (session.status === 'scheduled') {
                    statusIndicator.classList.add('bg-blue-100', 'text-blue-800');
                    statusIndicator.textContent = 'Scheduled';
                } else if (session.status === 'live') {
                    statusIndicator.classList.add('bg-green-100', 'text-green-800');
                    statusIndicator.textContent = 'Live';
                } else if (session.status === 'completed') {
                    statusIndicator.classList.add('bg-gray-100', 'text-gray-800');
                    statusIndicator.textContent = 'Completed';
                } else if (session.status === 'cancelled') {
                    statusIndicator.classList.add('bg-red-100', 'text-red-800');
                    statusIndicator.textContent = 'Cancelled';
                }
            }
            
            // Update other session details
            const titleElement = sessionElement.querySelector('.session-title');
            if (titleElement) {
                titleElement.textContent = session.title;
            }
            
            // Update date/time if changed
            const timeElement = sessionElement.querySelector('.session-time');
            if (timeElement && session.formatted_time) {
                timeElement.textContent = session.formatted_time;
            }
            
            // Update participants count if available
            const participantsElement = sessionElement.querySelector('.session-participants');
            if (participantsElement && session.participants_count !== undefined) {
                participantsElement.textContent = `${session.participants_count} / ${session.max_participants}`;
            }
        } else {
            // Session element not found, refresh entire list
            refreshSessionsList();
        }
    } else if (action === 'deleted') {
        // Find and remove session element
        const sessionElement = document.getElementById(`session-${session.id}`);
        if (sessionElement) {
            sessionElement.remove();
        }
    }
}

/**
 * Refresh sessions list by reloading the page or making an API call
 */
function refreshSessionsList() {
    // Option 1: Use API to get updated list
    if (window.apiClient) {
        window.apiClient.getSessionStatus()
            .then(data => {
                updateSessionsListUI(data.sessions);
            })
            .catch(error => {
                console.error('Error refreshing sessions list:', error);
            });
    } else {
        // Option 2: Fallback to page reload but preserve the current tab
        const sessionsContainer = document.querySelector('.sessions-container');
        if (sessionsContainer && !document.querySelector('.sessions-refresh-in-progress')) {
            // Determine current tab
            const currentMainTab = document.querySelector('.main-tab.active')?.dataset?.tab || 'sessions';
            const currentSubTab = document.querySelector('.sub-tab.active')?.dataset?.tab || 'today';
            
            // Add refresh indicator
            const refreshIndicator = document.createElement('div');
            refreshIndicator.className = 'sessions-refresh-in-progress text-center py-4';
            refreshIndicator.innerHTML = `
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
                <span class="ml-2">Refreshing sessions...</span>
            `;
            sessionsContainer.appendChild(refreshIndicator);
            
            // Reload content after a short delay
            setTimeout(() => {
                // Redirect to the same page with tab parameters
                window.location.href = `/users/dashboard/mentor/sessions/?tab=${currentMainTab}&sub_tab=${currentSubTab}`;
            }, 1000);
        }
    }
}

/**
 * Update sessions list UI with new data
 * @param {Array} sessions - List of sessions
 */
function updateSessionsListUI(sessions) {
    if (!sessions || !Array.isArray(sessions)) {
        console.error('Invalid sessions data for UI update:', sessions);
        return;
    }
    
    console.log('Updating sessions list with:', sessions);
    
    // Determine active tab to know which sessions to display
    const activeTab = document.querySelector('.sub-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    const tabContentElement = document.querySelector(`.sessions-tab-content[data-tab="${tabName}"]`);
    
    if (!tabContentElement) {
        console.warn(`Tab content element for ${tabName} not found`);
        return;
    }
    
    // Classify sessions based on date for proper tab placement
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySessions = [];
    const upcomingSessions = [];
    const pastSessions = [];
    
    sessions.forEach(session => {
        const sessionDate = new Date(session.schedule);
        sessionDate.setHours(0, 0, 0, 0);
        
        const now = new Date();
        
        if (sessionDate.getTime() === today.getTime()) {
            todaySessions.push(session);
        } else if (sessionDate > today) {
            upcomingSessions.push(session);
        } else {
            pastSessions.push(session);
        }
    });
    
    // If this is a simple update (just a few sessions), try to update in-place
    // Otherwise, trigger a refresh for the whole sessions page
    if (sessions.length <= 5 && document.querySelector('.sessions-container') && !document.querySelector('.sessions-refresh-in-progress')) {
        // Show refresh in progress
        const refreshIndicator = document.createElement('div');
        refreshIndicator.className = 'sessions-refresh-in-progress text-center py-4';
        refreshIndicator.innerHTML = `
            <div class="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
            <span class="ml-2">Refreshing sessions...</span>
        `;
        document.querySelector('.sessions-container').appendChild(refreshIndicator);
        
        // Reload after short delay
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

/**
 * Update bookings UI when booking data changes
 * @param {Object} booking - Booking data
 * @param {string} action - Action type (created, cancelled, completed)
 */
function updateBookingsUI(booking, action) {
    // Implementation depends on bookings UI structure
    console.log('Would update bookings with:', booking, action);
    
    // Similar implementation to updateSessionsUI
    // For simplicity, we'll just reload the page if on bookings page
    if (document.querySelector('.bookings-container')) {
        if (!document.querySelector('.bookings-refresh-in-progress')) {
            // Show refresh indicator
            const refreshIndicator = document.createElement('div');
            refreshIndicator.className = 'bookings-refresh-in-progress text-center py-4';
            refreshIndicator.innerHTML = `
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
                <span class="ml-2">Refreshing bookings...</span>
            `;
            document.querySelector('.bookings-container').appendChild(refreshIndicator);
            
            // Reload after short delay
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }
}

/**
 * Update session requests UI when request data changes
 * @param {Object} request - Request data
 * @param {string} action - Action type
 */
function updateRequestsUI(request, action) {
    // Implementation depends on requests UI structure
    console.log('Would update requests with:', request, action);
    
    // Similar implementation to updateSessionsUI
    // For simplicity, we'll just reload the page if on requests page
    if (document.querySelector('.requests-container')) {
        if (!document.querySelector('.requests-refresh-in-progress')) {
            // Show refresh indicator
            const refreshIndicator = document.createElement('div');
            refreshIndicator.className = 'requests-refresh-in-progress text-center py-4';
            refreshIndicator.innerHTML = `
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
                <span class="ml-2">Refreshing requests...</span>
            `;
            document.querySelector('.requests-container').appendChild(refreshIndicator);
            
            // Reload after short delay
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }
}

/**
 * Update session detail page when data changes
 * @param {number} sessionId - Session ID
 */
function updateSessionDetailUI(sessionId) {
    // Check if we're on the detail page for this session
    const sessionDetailContainer = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (sessionDetailContainer) {
        // Reload the page to get updated data
        window.location.reload();
    }
}

/**
 * Update dashboard stats with new data
 * @param {Object} stats - Dashboard statistics
 */
function updateStatsUI(stats) {
    // Update dashboard stats cards
    for (const [key, value] of Object.entries(stats)) {
        const element = document.getElementById(`stat-${key}`);
        if (element) {
            element.textContent = value;
        }
    }
}

/**
 * Update earnings display with new data
 * @param {Object} earnings - Earnings data
 */
function updateEarningsUI(earnings) {
    if (!earnings) return;
    
    // Update earnings displays
    const totalEarningsElement = document.getElementById('total-earnings');
    if (totalEarningsElement && earnings.total) {
        totalEarningsElement.textContent = earnings.total;
    }
    
    const pendingEarningsElement = document.getElementById('pending-earnings');
    if (pendingEarningsElement && earnings.pending) {
        pendingEarningsElement.textContent = earnings.pending;
    }
    
    // Update earnings chart if present
    updateEarningsChart(earnings);
}

/**
 * Update earnings chart with new data
 * @param {Object} earnings - Earnings data
 */
function updateEarningsChart(earnings) {
    // This would need to be implemented based on the charting library used
    // For example, if using Chart.js:
    if (window.earningsChart && earnings.chart_data) {
        window.earningsChart.data = earnings.chart_data;
        window.earningsChart.update();
    }
}

/**
 * Update bookings list UI with new data
 * @param {Array} bookings - List of bookings
 */
function updateBookingsListUI(bookings) {
    // Implementation would be similar to updateSessionsListUI
    console.log('Would update bookings list with:', bookings);
}

/**
 * Update requests list UI with new data
 * @param {Array} requests - List of session requests
 */
function updateRequestsListUI(requests) {
    // Implementation would be similar to updateSessionsListUI
    console.log('Would update requests list with:', requests);
}

// Export functions for global use
window.initDashboardWebSocket = initDashboardWebSocket;
window.sendDashboardMessage = sendDashboardMessage;
window.onDashboardSocketMessage = onDashboardSocketMessage;
window.handleSessionUpdate = handleSessionUpdate;
window.handleBookingUpdate = handleBookingUpdate;
window.handleSessionRequestUpdate = handleSessionRequestUpdate;
window.handleNotificationUpdate = handleNotificationUpdate;
window.updateSessionsUI = updateSessionsUI;

// Initialize on DOMContentLoaded if user is logged in
document.addEventListener('DOMContentLoaded', () => {
    if (typeof USER_ID !== 'undefined') {
        initDashboardWebSocket();
    }
});

})(); // End of IIFE