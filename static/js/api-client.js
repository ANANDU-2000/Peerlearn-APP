/**
 * API Client for PeerLearn
 * Provides a standardized way to communicate with the backend API
 */

// Get CSRF token from cookies
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
            'X-Requested-With': 'XMLHttpRequest'
        };
        
        // Add CSRF token for non-GET requests
        if (method !== 'GET') {
            headers['X-CSRFToken'] = getCsrfToken();
        }
        
        const options = {
            method,
            headers,
            credentials: withCredentials ? 'include' : 'same-origin'
        };
        
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        // Check if the response is JSON
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');
        
        // Parse response based on content type
        let responseData;
        if (isJson) {
            responseData = await response.json();
        } else {
            responseData = await response.text();
        }
        
        // Check for error responses
        if (!response.ok) {
            const error = new Error(isJson && responseData.detail ? responseData.detail : 'API request failed');
            error.status = response.status;
            error.data = responseData;
            throw error;
        }
        
        return responseData;
    } catch (error) {
        console.error('API request error:', error);
        
        // Show error toast if available
        if (typeof showToast === 'function') {
            const message = error.data && error.data.detail 
                ? error.data.detail 
                : 'An error occurred while communicating with the server.';
            showToast(message, 'error');
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
    return apiRequest(`/api/sessions/${sessionId}/`, 'GET');
}

/**
 * Create a new session
 * @param {Object} sessionData - The session data
 * @returns {Promise} A promise that resolves with the created session
 */
async function createSession(sessionData) {
    return apiRequest('/api/sessions/create/', 'POST', sessionData);
}

/**
 * Update an existing session
 * @param {number} sessionId - The session ID
 * @param {Object} sessionData - The updated session data
 * @returns {Promise} A promise that resolves with the updated session
 */
async function updateSession(sessionId, sessionData) {
    return apiRequest(`/api/sessions/${sessionId}/update/`, 'PUT', sessionData);
}

/**
 * Delete a session
 * @param {number} sessionId - The session ID
 * @returns {Promise} A promise that resolves when the session is deleted
 */
async function deleteSession(sessionId) {
    return apiRequest(`/api/sessions/${sessionId}/delete/`, 'DELETE');
}

/**
 * Publish a session
 * @param {number} sessionId - The session ID
 * @returns {Promise} A promise that resolves when the session is published
 */
async function publishSession(sessionId) {
    return apiRequest(`/api/sessions/${sessionId}/publish/`, 'POST');
}

/**
 * Cancel a session
 * @param {number} sessionId - The session ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise} A promise that resolves when the session is cancelled
 */
async function cancelSession(sessionId, reason) {
    return apiRequest(`/api/sessions/${sessionId}/cancel/`, 'POST', { reason });
}

/**
 * Book a session
 * @param {number} sessionId - The session ID
 * @returns {Promise} A promise that resolves with the booking data
 */
async function bookSession(sessionId) {
    return apiRequest(`/api/sessions/${sessionId}/book/`, 'POST');
}

/**
 * Cancel a booking
 * @param {number} bookingId - The booking ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise} A promise that resolves when the booking is cancelled
 */
async function cancelBooking(bookingId, reason) {
    return apiRequest(`/api/bookings/${bookingId}/cancel/`, 'POST', { reason });
}

/**
 * Fetch notifications
 * @param {boolean} [unreadOnly=false] - Whether to fetch only unread notifications
 * @returns {Promise} A promise that resolves with the notifications data
 */
async function fetchNotifications(unreadOnly = false) {
    return apiRequest(`/api/notifications/?unread_only=${unreadOnly ? 1 : 0}`, 'GET');
}

/**
 * Mark a notification as read
 * @param {number} notificationId - The notification ID
 * @returns {Promise} A promise that resolves when the notification is marked as read
 */
async function markNotificationRead(notificationId) {
    return apiRequest(`/api/notifications/${notificationId}/read/`, 'POST');
}

/**
 * Mark all notifications as read
 * @returns {Promise} A promise that resolves when all notifications are marked as read
 */
async function markAllNotificationsRead() {
    return apiRequest('/api/notifications/read-all/', 'POST');
}

/**
 * Submit session request
 * @param {Object} requestData - The session request data
 * @returns {Promise} A promise that resolves with the created request
 */
async function submitSessionRequest(requestData) {
    return apiRequest('/api/session-requests/create/', 'POST', requestData);
}

/**
 * Respond to session request
 * @param {number} requestId - The request ID
 * @param {Object} responseData - The response data
 * @returns {Promise} A promise that resolves with the updated request
 */
async function respondToSessionRequest(requestId, responseData) {
    return apiRequest(`/api/session-requests/${requestId}/respond/`, 'POST', responseData);
}

/**
 * Submit feedback for a session
 * @param {number} bookingId - The booking ID
 * @param {Object} feedbackData - The feedback data
 * @returns {Promise} A promise that resolves when the feedback is submitted
 */
async function submitFeedback(bookingId, feedbackData) {
    return apiRequest(`/api/bookings/${bookingId}/feedback/`, 'POST', feedbackData);
}

// Make functions available globally
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