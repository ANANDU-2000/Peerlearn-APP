/**
 * API Client for PeerLearn
 * This file contains utility functions for interacting with the API
 */

// Helper to get CSRF token from cookies
function getCsrfToken() {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, 'csrftoken='.length) === 'csrftoken=') {
                cookieValue = decodeURIComponent(cookie.substring('csrftoken='.length));
                break;
            }
        }
    }
    return cookieValue;
}

// Show toast notification
function showToast(message, type = 'success', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-opacity duration-500 
        ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`;
    toast.style.opacity = '0';
    toast.innerHTML = `
        <div class="flex items-center">
            ${type === 'success' 
                ? '<svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' 
                : '<svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'}
            <span>${message}</span>
        </div>
        <button type="button" class="absolute top-1 right-1 text-white hover:text-gray-200" onclick="this.parentNode.remove()">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
    `;
    document.body.appendChild(toast);
    
    // Fade in
    setTimeout(() => {
        toast.style.opacity = '1';
    }, 10);
    
    // Auto remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, duration);
}

// Create error banner for network issues
function createErrorBanner(message, retryCallback = null) {
    const banner = document.createElement('div');
    banner.className = 'fixed top-0 left-0 right-0 bg-red-600 text-white p-4 z-50 flex justify-between items-center';
    banner.innerHTML = `
        <div>${message}</div>
        ${retryCallback ? `<button id="retry-btn" class="bg-white text-red-600 px-4 py-1 rounded hover:bg-gray-100">Retry ▶</button>` : ''}
    `;
    document.body.prepend(banner);
    
    if (retryCallback) {
        document.getElementById('retry-btn').addEventListener('click', () => {
            banner.remove();
            retryCallback();
        });
    }
    
    return banner;
}

// API Client object
const ApiClient = {
    // Create a new session
    createSession: async function(formData, maxRetries = 3) {
        let retries = 0;
        let banner = null;
        
        const attemptSubmit = async () => {
            try {
                const response = await fetch('/sessions/api/create/', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-CSRFToken': getCsrfToken()
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        // Success - show toast and redirect
                        showToast('Session published successfully ✓', 'success');
                        
                        // Redirect after a short delay
                        setTimeout(() => {
                            window.location.href = data.session.redirect_url;
                        }, 1000);
                        
                        return data;
                    } else {
                        // Server returned success=false
                        showToast(data.errors.__all__[0] || 'Failed to publish session', 'error');
                        return null;
                    }
                } else {
                    // Handle specific error status codes
                    if (response.status === 400) {
                        // Validation errors
                        const errors = await response.json();
                        
                        // Return the errors to display them in the form
                        showToast('Failed to publish session—please fix errors.', 'error');
                        return { success: false, errors: errors.errors };
                    } else {
                        throw new Error(`Server error: ${response.status}`);
                    }
                }
            } catch (error) {
                retries++;
                console.error('Error submitting session:', error);
                
                if (retries < maxRetries) {
                    // Create or update retry banner
                    if (banner) banner.remove();
                    
                    banner = createErrorBanner(`Network error. Retrying in 5s... (${retries}/${maxRetries})`);
                    
                    // Wait 5 seconds and retry
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    banner.remove();
                    
                    return attemptSubmit(); // Recursive retry
                } else {
                    // Max retries reached
                    if (banner) banner.remove();
                    banner = createErrorBanner('Failed to save. Network issues detected.', attemptSubmit);
                    return { success: false, errors: { '__all__': ['Network error. Please try again.'] } };
                }
            }
        };
        
        return attemptSubmit();
    },
    
    // Get session details
    getSessionDetails: async function(sessionId) {
        try {
            const response = await fetch(`/sessions/api/session/${sessionId}/`, {
                method: 'GET',
                headers: {
                    'X-CSRFToken': getCsrfToken()
                }
            });
            
            if (response.ok) {
                return await response.json();
            } else {
                console.error('Error fetching session details:', response.status);
                return null;
            }
        } catch (error) {
            console.error('Error fetching session details:', error);
            return null;
        }
    }
};