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

// Expose refreshSessionsList globally for other scripts to use
window.refreshSessionsList = function() {
    // Forward to the internal function if it's defined
    if (typeof refreshSessionsList === 'function') {
        refreshSessionsList();
    } else {
        console.warn('Dashboard WebSocket not initialized, cannot refresh sessions list');
    }
};

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
    console.log('Session update received:', data);
    
    // Extract session data from the updated structure
    const sessionData = data.data || {};
    
    // Handle both legacy format and new format
    const session = sessionData.session || sessionData;
    const action = sessionData.action || 'updated';
    const status = sessionData.status || (session ? session.status : null);
    
    // Handle session going live with direct link
    if (status === 'live' && sessionData.join_url) {
        console.log('Session is now live with join URL:', sessionData.join_url);
        
        // Show toast notification with join button
        if (window.showToast) {
            const message = session && session.title 
                ? `Session "${session.title}" is now live!` 
                : "A session is now live!";
                
            const toast = window.showToast(message, 'success', 0); // Don't auto-dismiss
            
            if (toast) {
                // Add join button to toast
                const joinBtn = document.createElement('button');
                joinBtn.className = 'ml-2 inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500';
                joinBtn.textContent = 'Join Now';
                joinBtn.addEventListener('click', () => window.location.href = sessionData.join_url);
                
                // Find toast text container
                const textContainer = toast.querySelector('.text-sm');
                if (textContainer) {
                    textContainer.appendChild(joinBtn);
                }
            }
        }
        
        // Optionally trigger a browser notification
        if (Notification && Notification.permission === "granted") {
            const notification = new Notification("Session is Live!", {
                body: session && session.title ? `Session "${session.title}" is now live!` : "A session is now live!",
                icon: "/static/img/favicon.png"
            });
            
            // Close notification after 10 seconds
            setTimeout(() => notification.close(), 10000);
            
            // Navigate to session when notification is clicked
            notification.onclick = () => {
                window.location.href = sessionData.join_url;
                notification.close();
            };
        }
        
        // Update UI to show the session is live
        if (typeof updateLiveSessionUI === 'function') {
            // Use existing function if defined elsewhere
            updateLiveSessionUI(sessionData);
        } else {
            // Define inline implementation
            // Add visual indicators for live sessions
            const sessionId = sessionData.session_id || (session ? session.id : null);
            
            if (sessionId) {
                // Update any session cards to show live status
                const sessionCards = document.querySelectorAll(`.session-card[data-session-id="${sessionId}"]`);
                sessionCards.forEach(card => {
                    // Add live indicator
                    if (!card.querySelector('.live-indicator')) {
                        const liveIndicator = document.createElement('div');
                        liveIndicator.className = 'live-indicator absolute top-2 right-2 flex items-center px-2 py-1 rounded-full bg-red-600 text-white text-xs font-semibold';
                        liveIndicator.innerHTML = '<span class="animate-pulse mr-1 h-2 w-2 rounded-full bg-white"></span> LIVE';
                        card.appendChild(liveIndicator);
                    }
                    
                    // Update status badges
                    const statusBadges = card.querySelectorAll('.status-badge');
                    statusBadges.forEach(badge => {
                        badge.textContent = 'Live';
                        badge.className = 'status-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800';
                    });
                    
                    // Add join button if not already present
                    if (!card.querySelector('.join-live-btn') && sessionData.join_url) {
                        const actionArea = card.querySelector('.card-actions') || card;
                        const joinButton = document.createElement('a');
                        joinButton.href = sessionData.join_url;
                        joinButton.className = 'join-live-btn ml-2 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500';
                        joinButton.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Join Session';
                        actionArea.appendChild(joinButton);
                    }
                });
                
                // Also update session entries in any tables
                const sessionRows = document.querySelectorAll(`tr[data-session-id="${sessionId}"]`);
                sessionRows.forEach(row => {
                    // Update status cells
                    const statusCells = row.querySelectorAll('.session-status');
                    statusCells.forEach(cell => {
                        cell.innerHTML = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><span class="animate-pulse mr-1 h-2 w-2 rounded-full bg-red-600"></span> Live</span>';
                    });
                    
                    // Add join button to action cells
                    const actionCells = row.querySelectorAll('.action-cell');
                    actionCells.forEach(cell => {
                        if (!cell.querySelector('.join-live-btn') && sessionData.join_url) {
                            const joinButton = document.createElement('a');
                            joinButton.href = sessionData.join_url;
                            joinButton.className = 'join-live-btn ml-2 inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none';
                            joinButton.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Join';
                            cell.appendChild(joinButton);
                        }
                    });
                });
                
                // If there's a Go Live button for this session, hide it
                const goLiveButtons = document.querySelectorAll(`.go-live-btn[data-session-id="${sessionId}"]`);
                goLiveButtons.forEach(btn => {
                    btn.style.display = 'none';
                });
            }
        }
    }
    else {
        // Regular session update handling for non-live sessions
        // Show toast notification
        let toastMessage = '';
        let toastType = 'info';
        
        switch (action) {
            case 'created':
                toastMessage = session && session.title ? `New session created: ${session.title}` : 'New session created';
                toastType = 'success';
                break;
            case 'updated':
                toastMessage = session && session.title ? `Session updated: ${session.title}` : 'Session updated';
                break;
            case 'deleted':
                toastMessage = session && session.title ? `Session deleted: ${session.title}` : 'Session deleted';
                toastType = 'warning';
                break;
            case 'status_changed':
                if (session) {
                    const statusText = session.status || status;
                    toastMessage = `Session status changed to ${statusText}${session.title ? ': ' + session.title : ''}`;
                    
                    if (statusText === 'live') {
                        toastType = 'success';
                    } else if (statusText === 'completed') {
                        toastType = 'success';
                    } else if (statusText === 'cancelled') {
                        toastType = 'warning';
                    }
                }
                break;
        }
        
        if (toastMessage && window.showToast) {
            window.showToast(toastMessage, toastType);
        }
    }
    
    // Update UI if we have session data
    if (session) {
        updateSessionsUI(session, action);
        
        // Update earnings if mentor dashboard and earnings data is included
        if (sessionData.earnings || data.earnings) {
            updateEarningsUI(sessionData.earnings || data.earnings);
        }
    }
    
    // Always refresh sessions list if we're on a dashboard page
    const onDashboard = document.querySelector('.dashboard-container') !== null;
    if (onDashboard) {
        console.log('On dashboard, refreshing sessions list after update');
        refreshSessionsList();
    }
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
    console.log('Received dashboard data:', data.type, data);
    
    // Update various dashboard sections
    
    // Determine the active tab
    const activeTabElement = document.querySelector('.sub-tab.active');
    const activeTab = activeTabElement ? activeTabElement.dataset.tab : 'today';
    console.log('Active tab in handleDashboardData:', activeTab);
    
    // Update the appropriate sessions list based on active tab
    if (data.data) {
        if (data.data.today_sessions && activeTab === 'today') {
            console.log('Updating today sessions:', data.data.today_sessions);
            updateSessionsListUI(data.data.today_sessions, 'today');
        }
        if (data.data.upcoming_sessions && activeTab === 'upcoming') {
            console.log('Updating upcoming sessions:', data.data.upcoming_sessions);
            updateSessionsListUI(data.data.upcoming_sessions, 'upcoming');
        }
        if (data.data.past_sessions && activeTab === 'past') {
            console.log('Updating past sessions:', data.data.past_sessions);
            updateSessionsListUI(data.data.past_sessions, 'past');
        }
        
        // Fallback to sessions property if specific tabs not available
        if (data.data.sessions) {
            console.log('Updating generic sessions list:', data.data.sessions);
            updateSessionsListUI(data.data.sessions);
        }
    }
    
    // Legacy support for old format
    if (data.sessions) {
        console.log('Updating sessions list (legacy format):', data.sessions);
        updateSessionsListUI(data.sessions);
    }
    
    // Update bookings list if present
    if (data.data && data.data.bookings) {
        updateBookingsListUI(data.data.bookings);
    } else if (data.bookings) {
        updateBookingsListUI(data.bookings);
    }
    
    // Update session requests list if present
    if (data.data && data.data.session_requests) {
        updateRequestsListUI(data.data.session_requests);
    } else if (data.session_requests) {
        updateRequestsListUI(data.session_requests);
    }
    
    // Update stats if present
    if (data.data && data.data.stats) {
        updateStatsUI(data.data.stats);
    } else if (data.stats) {
        updateStatsUI(data.stats);
    }
    
    // Update earnings if present
    if (data.data && data.data.earnings) {
        updateEarningsUI(data.data.earnings);
    } else if (data.earnings) {
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
    console.log('Refreshing sessions list...');
    
    // Make the function available globally so it can be called from other scripts
    window.refreshSessionsList = refreshSessionsList;
    
    // Get the current active tab
    let currentSubTab = 'today';
    const activeTabElement = document.querySelector('.sub-tab.active');
    if (activeTabElement) {
        currentSubTab = activeTabElement.dataset.tab;
    }
    console.log('Current active tab:', currentSubTab);
    
    // Detect if we're on the mentor or learner dashboard
    const onMentorDashboard = window.location.pathname.includes('/dashboard/mentor/');
    const onLearnerDashboard = window.location.pathname.includes('/dashboard/learner/');
    
    // First try to use the WebSocket for real-time updates if it's available
    if (dashboardSocket && dashboardSocket.readyState === WebSocket.OPEN) {
        console.log('Using WebSocket to refresh sessions for tab:', currentSubTab);
        
        // Request up-to-date dashboard data via WebSocket
        sendDashboardMessage({
            type: 'get_data',
            data: {
                tab: currentSubTab
            }
        });
        
        // Also specifically request session data
        sendDashboardMessage({
            type: 'get_sessions',
            data: {
                tab: currentSubTab
            }
        });
        
        // We'll let the WebSocket response handler update the UI
        return;
    }
    
    // Fallback to API if available
    if (window.apiClient) {
        console.log('Using API client to refresh sessions');
        // Use the appropriate API endpoint based on the dashboard
        const apiPromise = onLearnerDashboard ? 
            window.apiClient.getLearnerSessions() : 
            window.apiClient.getSessionStatus();
            
        apiPromise
            .then(data => {
                console.log('Received updated sessions data:', data);
                if (data && data.sessions) {
                    updateSessionsListUI(data.sessions);
                }
            })
            .catch(error => {
                console.error('Error refreshing sessions list:', error);
                // Show a notification about the error
                if (window.showToast) {
                    window.showToast('error', 'Update Failed', 'Could not refresh session data. Please try again.');
                }
            });
    } else {
        console.log('Neither WebSocket nor API client available, trying page refresh...');
        // Fallback to page reload but preserve the current tab
        let sessionsContainer;
        
        if (onMentorDashboard) {
            sessionsContainer = document.querySelector('.sessions-container');
        } else if (onLearnerDashboard) {
            sessionsContainer = document.querySelector('.dashboard-sessions-list');
        } else {
            console.log('Not on a recognized dashboard page');
            return;
        }
        
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
                // Build the appropriate URL based on the dashboard
                let redirectUrl;
                if (onMentorDashboard) {
                    redirectUrl = `/users/dashboard/mentor/sessions/?tab=${currentMainTab}&sub_tab=${currentSubTab}`;
                } else if (onLearnerDashboard) {
                    redirectUrl = `/users/dashboard/learner/?tab=${currentMainTab}`;
                } else {
                    redirectUrl = window.location.href; // Just reload current page
                }
                
                console.log('Redirecting to refresh sessions:', redirectUrl);
                window.location.href = redirectUrl;
            }, 1000);
        }
    }
}

/**
 * Create a session element from session data
 * @param {Object} session - Session data
 * @returns {HTMLElement} Session element
 */
function createSessionElement(session) {
    try {
        // Create session list item
        const li = document.createElement('li');
        li.id = `session-${session.id}`;
        li.className = 'session-item block hover:bg-gray-50';
        
        // Store schedule time in data attribute for countdown calculation
        li.dataset.scheduleTime = session.schedule;
        
        // Format date
        const sessionDate = new Date(session.schedule);
        const formattedDate = sessionDate.toLocaleString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
        
        // Determine status class
        let statusClass = '';
        if (session.status === 'scheduled') {
            statusClass = 'bg-blue-100 text-blue-800';
        } else if (session.status === 'live') {
            statusClass = 'bg-green-100 text-green-800';
        } else if (session.status === 'completed') {
            statusClass = 'bg-gray-100 text-gray-800';
        } else if (session.status === 'cancelled') {
            statusClass = 'bg-red-100 text-red-800';
        }
        
        // Calculate time until session
        let countdown = '';
        let canGoLive = false;
        
        const now = new Date();
        const timeUntil = sessionDate - now;
        
        if (session.status === 'live') {
            // Session is live, calculate remaining time
            const durationMinutes = session.duration || 60;
            const endTime = new Date(sessionDate.getTime() + (durationMinutes * 60000));
            const remaining = endTime - now;
            
            if (remaining <= 0) {
                countdown = '00:00:00';
            } else {
                // Format remaining time
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.floor((remaining % 3600000) / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                countdown = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        } else if (session.status === 'scheduled') {
            // Session is scheduled, countdown to start
            if (timeUntil <= 0) {
                countdown = 'LIVE NOW';
                canGoLive = true;
            } else {
                // Check if within 15 minutes of start time
                if (timeUntil <= 15 * 60 * 1000) {
                    canGoLive = true;
                }
                
                // Format countdown
                const hours = Math.floor(timeUntil / 3600000);
                const minutes = Math.floor((timeUntil % 3600000) / 60000);
                const seconds = Math.floor((timeUntil % 60000) / 1000);
                countdown = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        } else {
            countdown = '00:00:00';
        }
        
        // Create control buttons based on status
        let controlButtons = '';
        
        if (canGoLive && session.status === 'scheduled') {
            controlButtons = `
                <a href="/sessions/go_live/${session.room_code}/" class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                    <svg class="-ml-0.5 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                    </svg>
                    Go Live
                </a>
            `;
        } else if (session.status === 'live') {
            controlButtons = `
                <a href="/sessions/room/${session.room_code}/" class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                    <svg class="-ml-0.5 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                    Join Session
                </a>
            `;
        }
        
        // Build HTML for session item
        li.innerHTML = `
            <div class="px-4 py-4 sm:px-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <p class="text-lg font-medium text-primary-600 truncate">
                            ${session.title}
                        </p>
                        <div class="ml-2 flex-shrink-0 flex">
                            <p class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                                ${session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                            </p>
                        </div>
                    </div>
                    <div class="ml-2 flex-shrink-0 flex items-center">
                        <div class="mr-4">
                            ${controlButtons}
                        </div>
                        <div class="flex items-center text-sm text-gray-500">
                            <svg class="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                            </svg>
                            <span class="tabular-nums countdown-value" data-session-id="${session.id}">${countdown}</span>
                        </div>
                    </div>
                </div>
                <div class="mt-2 sm:flex sm:justify-between">
                    <div class="sm:flex">
                        <p class="flex items-center text-sm text-gray-500">
                            <svg class="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
                            </svg>
                            ${formattedDate}
                        </p>
                        <p class="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                            <svg class="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                            </svg>
                            <span class="participant-counter" data-current="${session.bookings_count || 0}" data-max="${session.max_participants || 10}">
                                ${session.bookings_count || 0}/${session.max_participants || 10} participants
                            </span>
                        </p>
                    </div>
                    <div class="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                        <svg class="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                        </svg>
                        <span>${session.duration || 60} minutes</span>
                    </div>
                </div>
            </div>
        `;
        
        // Set up countdown interval for this session
        const countdownElement = li.querySelector(`.countdown-value[data-session-id="${session.id}"]`);
        if (countdownElement && (session.status === 'scheduled' || session.status === 'live')) {
            // This interval will be automatically cleaned up if the element is removed from DOM
            const intervalId = setInterval(() => {
                const now = new Date();
                let newCountdown = '';
                
                if (session.status === 'live') {
                    // Update remaining time for live session
                    const durationMinutes = session.duration || 60;
                    const endTime = new Date(sessionDate.getTime() + (durationMinutes * 60000));
                    const remaining = endTime - now;
                    
                    if (remaining <= 0) {
                        newCountdown = '00:00:00';
                        clearInterval(intervalId);
                    } else {
                        // Format remaining time
                        const hours = Math.floor(remaining / 3600000);
                        const minutes = Math.floor((remaining % 3600000) / 60000);
                        const seconds = Math.floor((remaining % 60000) / 1000);
                        newCountdown = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }
                } else {
                    // Update countdown for scheduled session
                    const timeUntil = sessionDate - now;
                    
                    if (timeUntil <= 0) {
                        newCountdown = 'LIVE NOW';
                        
                        // Show Go Live button if time to start
                        const goLiveButton = li.querySelector('.go-live-button');
                        if (goLiveButton) {
                            goLiveButton.classList.remove('hidden');
                        }
                    } else {
                        // Format countdown
                        const hours = Math.floor(timeUntil / 3600000);
                        const minutes = Math.floor((timeUntil % 3600000) / 60000);
                        const seconds = Math.floor((timeUntil % 60000) / 1000);
                        newCountdown = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }
                }
                
                // Update countdown display
                countdownElement.textContent = newCountdown;
            }, 1000);
            
            // Store interval ID on the element for cleanup
            li.dataset.intervalId = intervalId;
        }
        
        return li;
    } catch (error) {
        console.error('Error creating session element:', error);
        return null;
    }
}

/**
 * Update sessions list UI with new data
 * @param {Array} sessions - List of sessions
 * @param {string} tabFilter - Optional tab to update ('today', 'upcoming', 'past')
 */
function updateSessionsListUI(sessions, tabFilter) {
    if (!sessions || !Array.isArray(sessions)) {
        console.error('Invalid sessions data for UI update:', sessions);
        return;
    }
    
    console.log('Updating sessions list with:', sessions.length, 'sessions', tabFilter ? `for tab ${tabFilter}` : '');
    
    // Determine active tab if not specified
    let tabName = tabFilter;
    if (!tabName) {
        const activeTab = document.querySelector('.sub-tab.active');
        if (!activeTab) {
            console.warn('No active tab found for session display');
            return;
        }
        tabName = activeTab.dataset.tab;
    }
    
    // Find the content element for this tab
    const tabContentElement = document.querySelector(`.sessions-tab-content[data-tab="${tabName}"]`);
    if (!tabContentElement) {
        console.warn(`Tab content element for ${tabName} not found`);
        return;
    }
    
    // If we already have the correct tab sessions, no need to filter again
    let sessionsToDisplay = sessions;
    
    // If we have a mix of sessions for different tabs, filter them
    if (!tabFilter) {
        // Classify sessions based on date for proper tab placement
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaySessions = [];
        const upcomingSessions = [];
        const pastSessions = [];
        
        sessions.forEach(session => {
            // Make sure schedule is a valid date string
            if (!session.schedule) {
                console.warn('Session missing schedule date:', session);
                return;
            }
            
            const sessionDate = new Date(session.schedule);
            const sessionDay = new Date(sessionDate);
            sessionDay.setHours(0, 0, 0, 0);
            
            const now = new Date();
            
            // Check if session is complete or cancelled
            const isComplete = session.status === 'completed' || session.status === 'cancelled';
            
            if (sessionDay.getTime() === today.getTime() && !isComplete) {
                todaySessions.push(session);
            } else if (sessionDay > today && !isComplete) {
                upcomingSessions.push(session);
            } else {
                pastSessions.push(session);
            }
        });
        
        // Determine which sessions to display based on active tab
        if (tabName === 'today') {
            sessionsToDisplay = todaySessions;
        } else if (tabName === 'upcoming') {
            sessionsToDisplay = upcomingSessions;
        } else if (tabName === 'past') {
            sessionsToDisplay = pastSessions;
        }
    }
    
    console.log(`Displaying ${sessionsToDisplay.length} filtered sessions for tab ${tabName}`);
    
    // Find sessions list element
    const sessionsListContainer = tabContentElement.querySelector('.sessions-container, .session-list-container');
    if (!sessionsListContainer) {
        console.warn(`Sessions container not found in tab ${tabName}`);
        
        // Only show error and refresh if we actually have sessions to display
        if (sessionsToDisplay.length > 0) {
            // Create a temporary container
            const tempContainer = document.createElement('div');
            tempContainer.className = 'text-center py-4 bg-white shadow rounded-md';
            tempContainer.innerHTML = `
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
                <span class="ml-2">Refreshing sessions list...</span>
            `;
            tabContentElement.appendChild(tempContainer);
            
            // Force refresh after short delay
            setTimeout(() => {
                // Reload just this tab, not the whole page
                switchSessionTab(tabName);
            }, 1000);
        }
        return;
    }
    
    // Find the sessions list (ul element)
    let sessionsList = sessionsListContainer.querySelector('ul');
    
    // If no list but we have sessions, create one
    if (!sessionsList && sessionsToDisplay.length > 0) {
        sessionsList = document.createElement('ul');
        sessionsList.className = 'divide-y divide-gray-200';
        sessionsListContainer.innerHTML = ''; // Clear container
        sessionsListContainer.appendChild(sessionsList);
    }
    
    // No sessions to display
    if (sessionsToDisplay.length === 0) {
        // Show empty state
        const emptyState = `
            <div class="text-center py-12 bg-white shadow rounded-md">
                <svg class="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-900">No ${tabName} sessions</h3>
                <p class="mt-1 text-sm text-gray-500">You don't have any sessions ${tabName === 'today' ? 'scheduled for today' : tabName === 'upcoming' ? 'scheduled for future days' : 'in the past'}.</p>
                <div class="mt-6">
                    <a href="{% url 'users:mentor_create_advanced_session' %}" class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                        <svg class="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Create New Session
                    </a>
                </div>
            </div>
        `;
        
        sessionsListContainer.innerHTML = emptyState;
        return;
    }
    
    // We have sessions and a list element - update it
    if (sessionsList) {
        // Clear existing sessions
        sessionsList.innerHTML = '';
        
        // Add each session to the list
        sessionsToDisplay.forEach(session => {
            try {
                // Create and append session element
                const sessionElement = createSessionElement(session);
                if (sessionElement) {
                    sessionsList.appendChild(sessionElement);
                }
            } catch (error) {
                console.error('Error rendering session:', error, session);
            }
        });
        
        // Initialize countdown timers for new elements
        initializeSessionCountdowns();
    }
}

/**
 * Initialize countdown timers for session elements
 */
function initializeSessionCountdowns() {
    // Find all elements with countdown values
    document.querySelectorAll('.countdown-value').forEach(element => {
        const sessionId = element.dataset.sessionId;
        if (!sessionId) return;
        
        // Update the countdown every minute
        const updateInterval = setInterval(() => {
            try {
                const sessionElement = document.getElementById(`session-${sessionId}`);
                if (!sessionElement) {
                    // Session element no longer exists, clear the interval
                    clearInterval(updateInterval);
                    return;
                }
                
                // Get the session schedule time from the data attribute
                const scheduleTimeStr = sessionElement.dataset.scheduleTime;
                if (!scheduleTimeStr) return;
                
                const scheduleTime = new Date(scheduleTimeStr);
                const now = new Date();
                
                // Calculate time difference
                const diff = scheduleTime - now;
                
                // If session time has passed
                if (diff <= 0) {
                    element.textContent = 'Live now';
                    element.classList.add('text-green-600', 'font-medium');
                    clearInterval(updateInterval);
                    return;
                }
                
                // Calculate days, hours, minutes
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                
                // Format the countdown
                let countdownText = '';
                if (days > 0) {
                    countdownText += `${days}d `;
                }
                if (hours > 0 || days > 0) {
                    countdownText += `${hours}h `;
                }
                countdownText += `${minutes}m`;
                
                // Update the element
                element.textContent = countdownText;
            } catch (error) {
                console.error('Error updating countdown:', error);
            }
        }, 60000); // Update every minute
        
        // Do an initial update
        try {
            const sessionElement = document.getElementById(`session-${sessionId}`);
            if (!sessionElement) return;
            
            const scheduleTimeStr = sessionElement.dataset.scheduleTime;
            if (!scheduleTimeStr) return;
            
            const scheduleTime = new Date(scheduleTimeStr);
            const now = new Date();
            
            // Calculate time difference
            const diff = scheduleTime - now;
            
            // If session time has passed
            if (diff <= 0) {
                element.textContent = 'Live now';
                element.classList.add('text-green-600', 'font-medium');
                return;
            }
            
            // Calculate days, hours, minutes
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            // Format the countdown
            let countdownText = '';
            if (days > 0) {
                countdownText += `${days}d `;
            }
            if (hours > 0 || days > 0) {
                countdownText += `${hours}h `;
            }
            countdownText += `${minutes}m`;
            
            // Update the element
            element.textContent = countdownText;
        } catch (error) {
            console.error('Error updating countdown:', error);
        }
    });
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