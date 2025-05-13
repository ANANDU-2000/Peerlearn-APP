/**
 * API Client for PeerLearn
 * Provides a clean interface for making API requests to the backend
 */

// Create a class for the API client
class ApiClient {
    /**
     * Initialize the API client
     */
    constructor() {
        this.csrfToken = this.getCsrfToken();
    }
    
    /**
     * Get CSRF token from the cookie
     * @returns {string} CSRF token
     */
    getCsrfToken() {
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
     * Build headers with CSRF token
     * @param {Object} additionalHeaders - Additional headers to include
     * @returns {Object} Headers object
     */
    buildHeaders(additionalHeaders = {}) {
        return {
            'Content-Type': 'application/json',
            'X-CSRFToken': this.csrfToken,
            ...additionalHeaders
        };
    }
    
    /**
     * Handle API response
     * @param {Response} response - Fetch API response
     * @returns {Promise} Promise that resolves to the response data
     */
    async handleResponse(response) {
        // Parse response as json if content type is json
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        // Check if response is ok (status 200-299)
        if (!response.ok) {
            // Create error object with response details
            const error = new Error(data.message || data.error || 'Unknown error');
            error.status = response.status;
            error.data = data;
            throw error;
        }
        
        return data;
    }
    
    /**
     * Make a GET request
     * @param {string} url - Request URL
     * @param {Object} params - Query parameters
     * @returns {Promise} Promise that resolves to the response data
     */
    async get(url, params = {}) {
        // Add query parameters if present
        const queryParams = new URLSearchParams(params).toString();
        const requestUrl = queryParams ? `${url}?${queryParams}` : url;
        
        try {
            const response = await fetch(requestUrl, {
                method: 'GET',
                headers: this.buildHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API GET Error (${url}):`, error);
            throw error;
        }
    }
    
    /**
     * Make a POST request
     * @param {string} url - Request URL
     * @param {Object} data - Request body data
     * @returns {Promise} Promise that resolves to the response data
     */
    async post(url, data = {}) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(data)
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API POST Error (${url}):`, error);
            throw error;
        }
    }
    
    /**
     * Make a PUT request
     * @param {string} url - Request URL
     * @param {Object} data - Request body data
     * @returns {Promise} Promise that resolves to the response data
     */
    async put(url, data = {}) {
        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: this.buildHeaders(),
                body: JSON.stringify(data)
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API PUT Error (${url}):`, error);
            throw error;
        }
    }
    
    /**
     * Make a PATCH request
     * @param {string} url - Request URL
     * @param {Object} data - Request body data
     * @returns {Promise} Promise that resolves to the response data
     */
    async patch(url, data = {}) {
        try {
            const response = await fetch(url, {
                method: 'PATCH',
                headers: this.buildHeaders(),
                body: JSON.stringify(data)
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API PATCH Error (${url}):`, error);
            throw error;
        }
    }
    
    /**
     * Make a DELETE request
     * @param {string} url - Request URL
     * @returns {Promise} Promise that resolves to the response data
     */
    async delete(url) {
        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: this.buildHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API DELETE Error (${url}):`, error);
            throw error;
        }
    }
    
    /**
     * Upload a file
     * @param {string} url - Upload URL
     * @param {FormData} formData - Form data with file
     * @returns {Promise} Promise that resolves to the response data
     */
    async uploadFile(url, formData) {
        try {
            // For file uploads, we don't set Content-Type header
            // as the browser will set it with the boundary parameter
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.csrfToken
                },
                body: formData
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API File Upload Error (${url}):`, error);
            throw error;
        }
    }
    
    // Specific API endpoints for PeerLearn
    
    /**
     * Get session status data
     * @returns {Promise} Promise with session data
     */
    async getSessionStatus() {
        return this.get('/sessions/api/status/');
    }
    
    /**
     * Get booking details
     * @param {number} bookingId - Booking ID
     * @returns {Promise} Promise with booking data
     */
    async getBookingDetails(bookingId) {
        return this.get(`/sessions/api/bookings/${bookingId}/`);
    }
    
    /**
     * Book a session
     * @param {number} sessionId - Session ID
     * @returns {Promise} Promise with booking result
     */
    async bookSession(sessionId) {
        return this.post(`/sessions/book/${sessionId}/`);
    }
    
    /**
     * Cancel a booking
     * @param {number} bookingId - Booking ID
     * @param {string} reason - Cancellation reason
     * @returns {Promise} Promise with cancellation result
     */
    async cancelBooking(bookingId, reason) {
        return this.post(`/sessions/cancel-booking/${bookingId}/`, { reason });
    }
    
    /**
     * Submit feedback for a session
     * @param {number} bookingId - Booking ID
     * @param {Object} feedbackData - Feedback data
     * @returns {Promise} Promise with submission result
     */
    async submitFeedback(bookingId, feedbackData) {
        return this.post(`/sessions/feedback/${bookingId}/`, feedbackData);
    }
    
    /**
     * Update session status (for mentors)
     * @param {number} sessionId - Session ID
     * @param {string} status - New status
     * @returns {Promise} Promise with update result
     */
    async updateSessionStatus(sessionId, status) {
        return this.post(`/sessions/update-status/${sessionId}/`, { status });
    }
    
    /**
     * Cancel a session (for mentors)
     * @param {number} sessionId - Session ID
     * @param {string} reason - Cancellation reason
     * @returns {Promise} Promise with cancellation result
     */
    async cancelSession(sessionId, reason) {
        return this.post(`/sessions/api/sessions/${sessionId}/cancel/`, { reason });
    }
    
    /**
     * Create a new session
     * @param {FormData} formData - Session form data including files
     * @returns {Promise} Promise with creation result
     */
    async createSession(formData) {
        try {
            const response = await fetch('/sessions/api/create/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.csrfToken
                },
                body: formData
            });
            
            const data = await this.handleResponse(response);
            
            if (data.success) {
                showToast('success', 'Session Created', 'Your session has been published successfully.');
                setTimeout(() => {
                    window.location.href = '/users/dashboard/mentor/sessions/';
                }, 1000);
            }
            
            return data;
        } catch (error) {
            console.error('Session creation error:', error);
            showToast('error', 'Error', 'There was an error creating your session. Please try again.');
            throw error;
        }
    }
}

// Create a global instance of the API client
window.apiClient = new ApiClient();