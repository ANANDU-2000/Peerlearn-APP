/**
 * API Client for PeerLearn
 * Provides consistent methods for making API requests to the backend
 */

/**
 * Get CSRF token from cookies
 * @returns {string} - CSRF token
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

/**
 * Make an API request with proper error handling and CSRF protection
 * @param {string} url - The API endpoint URL
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} [data=null] - Request body data for POST/PUT requests
 * @param {boolean} [withCredentials=true] - Whether to include credentials
 * @returns {Promise} A promise that resolves with the API response
 */
async function apiRequest(url, method, data = null, withCredentials = true) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // Add CSRF token for non-GET requests
        if (method !== 'GET') {
            headers['X-CSRFToken'] = getCsrfToken();
        }
        
        const options = {
            method: method,
            headers: headers,
            credentials: withCredentials ? 'same-origin' : 'omit'
        };
        
        // Add request body for POST, PUT, PATCH requests
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            options.body = JSON.stringify(data);
        }
        
        // Make the request
        const response = await fetch(url, options);
        
        // Handle HTTP errors
        if (!response.ok) {
            // Try to get error details from response body
            let errorData = null;
            try {
                errorData = await response.json();
            } catch (e) {
                // Response body isn't JSON
            }
            
            const error = new Error(
                errorData?.detail || errorData?.message || 
                `API request failed with status ${response.status}`
            );
            error.status = response.status;
            error.statusText = response.statusText;
            error.data = errorData;
            throw error;
        }
        
        // Check if response is empty (e.g. 204 No Content)
        if (response.status === 204) {
            return null;
        }
        
        // Parse response body as JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            return await response.text();
        }
    } catch (error) {
        // Log error and rethrow
        console.error('API request failed:', error);
        
        // Show user-friendly error message
        if (typeof showToast === 'function') {
            showToast(
                error.data?.detail || error.message || 'An error occurred. Please try again.',
                'error'
            );
        }
        
        throw error;
    }
}

/**
 * Fetch a session by ID
 * @param {number} sessionId - The session ID
 * @returns {Promise} A promise that resolves with the session data
 */
async function fetchSession(sessionId) {
    return await apiRequest(`/api/sessions/${sessionId}/`, 'GET');
}

/**
 * Create a new session
 * @param {Object} sessionData - The session data
 * @returns {Promise} A promise that resolves with the created session
 */
async function createSession(sessionData) {
    return await apiRequest('/api/sessions/', 'POST', sessionData);
}

/**
 * Update an existing session
 * @param {number} sessionId - The session ID
 * @param {Object} sessionData - The updated session data
 * @returns {Promise} A promise that resolves with the updated session
 */
async function updateSession(sessionId, sessionData) {
    return await apiRequest(`/api/sessions/${sessionId}/`, 'PUT', sessionData);
}

/**
 * Delete a session
 * @param {number} sessionId - The session ID
 * @returns {Promise} A promise that resolves when the session is deleted
 */
async function deleteSession(sessionId) {
    return await apiRequest(`/api/sessions/${sessionId}/`, 'DELETE');
}

/**
 * Publish a session
 * @param {number} sessionId - The session ID
 * @returns {Promise} A promise that resolves when the session is published
 */
async function publishSession(sessionId) {
    return await apiRequest(`/api/sessions/${sessionId}/publish/`, 'POST');
}

/**
 * Cancel a session
 * @param {number} sessionId - The session ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise} A promise that resolves when the session is cancelled
 */
async function cancelSession(sessionId, reason) {
    return await apiRequest(`/api/sessions/${sessionId}/cancel/`, 'POST', { reason });
}

/**
 * Book a session
 * @param {number} sessionId - The session ID
 * @returns {Promise} A promise that resolves with the booking data
 */
async function bookSession(sessionId) {
    return await apiRequest(`/api/sessions/${sessionId}/book/`, 'POST');
}

/**
 * Cancel a booking
 * @param {number} bookingId - The booking ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise} A promise that resolves when the booking is cancelled
 */
async function cancelBooking(bookingId, reason) {
    return await apiRequest(`/api/bookings/${bookingId}/cancel/`, 'POST', { reason });
}

/**
 * Fetch notifications
 * @param {boolean} [unreadOnly=false] - Whether to fetch only unread notifications
 * @returns {Promise} A promise that resolves with the notifications data
 */
async function fetchNotifications(unreadOnly = false) {
    return await apiRequest(`/api/notifications/?unread_only=${unreadOnly ? '1' : '0'}`, 'GET');
}

/**
 * Mark a notification as read
 * @param {number} notificationId - The notification ID
 * @returns {Promise} A promise that resolves when the notification is marked as read
 */
async function markNotificationRead(notificationId) {
    return await apiRequest(`/api/notifications/${notificationId}/read/`, 'POST');
}

/**
 * Mark all notifications as read
 * @returns {Promise} A promise that resolves when all notifications are marked as read
 */
async function markAllNotificationsRead() {
    return await apiRequest('/api/notifications/read-all/', 'POST');
}

/**
 * Submit session request
 * @param {Object} requestData - The session request data
 * @returns {Promise} A promise that resolves with the created request
 */
async function submitSessionRequest(requestData) {
    return await apiRequest('/api/session-requests/', 'POST', requestData);
}

/**
 * Respond to session request
 * @param {number} requestId - The request ID
 * @param {Object} responseData - The response data
 * @returns {Promise} A promise that resolves with the updated request
 */
async function respondToSessionRequest(requestId, responseData) {
    return await apiRequest(`/api/session-requests/${requestId}/respond/`, 'POST', responseData);
}

/**
 * Submit feedback for a session
 * @param {number} bookingId - The booking ID
 * @param {Object} feedbackData - The feedback data
 * @returns {Promise} A promise that resolves when the feedback is submitted
 */
async function submitFeedback(bookingId, feedbackData) {
    return await apiRequest(`/api/bookings/${bookingId}/feedback/`, 'POST', feedbackData);
}

// Export functions globally
window.apiRequest = apiRequest;
window.fetchSession = fetchSession;
window.createSession = createSession;
window.updateSession = updateSession;
window.deleteSession = deleteSession;
window.publishSession = publishSession;
window.cancelSession = cancelSession;
window.bookSession = bookSession;
window.cancelBooking = cancelBooking;
window.fetchNotifications = fetchNotifications;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.submitSessionRequest = submitSessionRequest;
window.respondToSessionRequest = respondToSessionRequest;
window.submitFeedback = submitFeedback;