/**
 * Toast notifications system for PeerLearn
 * Displays temporary notifications for user feedback
 */

// Use an IIFE to prevent variable name collisions
(function() {
// Don't re-initialize if already defined
if (typeof window.showToast !== 'undefined') {
    return;
}

// Toast container element - will be created if it doesn't exist
// Use window object to avoid duplicate declaration
if (typeof window.peerLearnToastContainer === 'undefined') {
    window.peerLearnToastContainer = null;
}

// Toast colors based on type
const TOAST_COLORS = {
    success: {
        background: 'bg-green-100',
        border: 'border-green-400',
        text: 'text-green-700',
        icon: `<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>`
    },
    error: {
        background: 'bg-red-100',
        border: 'border-red-400',
        text: 'text-red-700',
        icon: `<svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
              </svg>`
    },
    warning: {
        background: 'bg-yellow-100',
        border: 'border-yellow-400',
        text: 'text-yellow-700',
        icon: `<svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
              </svg>`
    },
    info: {
        background: 'bg-blue-100',
        border: 'border-blue-400',
        text: 'text-blue-700',
        icon: `<svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
              </svg>`
    }
};

// Default toast duration in milliseconds
const DEFAULT_DURATION = 5000;

/**
 * Initialize the toast container
 */
function initToastContainer() {
    // Create container if it doesn't exist
    if (!window.peerLearnToastContainer) {
        window.peerLearnToastContainer = document.createElement('div');
        window.peerLearnToastContainer.id = 'toast-container';
        window.peerLearnToastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col space-y-4';
        document.body.appendChild(window.peerLearnToastContainer);
    }
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast (success, error, warning, info)
 * @param {number} duration - How long to display the toast in ms
 */
function showToast(message, type = 'info', duration = DEFAULT_DURATION) {
    initToastContainer();
    
    // Get color scheme based on type
    const colors = TOAST_COLORS[type] || TOAST_COLORS.info;
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `flex items-center p-4 mb-4 rounded-lg border ${colors.background} ${colors.border} ${colors.text} transition-all duration-300 ease-in-out transform translate-x-0 opacity-0 max-w-xs sm:max-w-sm md:max-w-md`;
    toast.setAttribute('role', 'alert');
    
    // Add content to toast
    toast.innerHTML = `
        <div class="inline-flex flex-shrink-0 justify-center items-center w-8 h-8 mr-3">
            ${colors.icon}
        </div>
        <div class="text-sm font-normal flex-grow">${message}</div>
        <button type="button" class="ml-3 -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 ${colors.text} hover:opacity-75">
            <span class="sr-only">Close</span>
            <svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
            </svg>
        </button>
    `;
    
    // Add to container
    window.peerLearnToastContainer.appendChild(toast);
    
    // Setup close button
    const closeButton = toast.querySelector('button');
    closeButton.addEventListener('click', () => {
        removeToast(toast);
    });
    
    // Show toast with animation
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0');
        toast.classList.add('opacity-100');
    });
    
    // Set auto-dismiss timeout
    const timeout = setTimeout(() => {
        removeToast(toast);
    }, duration);
    
    // Store timeout on element for cleanup
    toast._timeout = timeout;
    
    // Add sound notification
    playNotificationSound();
    
    // Return the toast element
    return toast;
}

/**
 * Remove a toast element with animation
 * @param {HTMLElement} toast - The toast element to remove
 */
function removeToast(toast) {
    // Skip if already being removed
    if (toast._isRemoving) return;
    toast._isRemoving = true;
    
    // Clear timeout if exists
    if (toast._timeout) {
        clearTimeout(toast._timeout);
    }
    
    // Animate out
    toast.classList.add('opacity-0', 'translate-x-full');
    
    // Remove after animation
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

/**
 * Play a notification sound
 */
function playNotificationSound() {
    try {
        const audio = new Audio('/static/sounds/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(err => {
            console.log('Could not play notification sound:', err);
        });
    } catch (err) {
        console.log('Error playing notification sound:', err);
    }
}

/**
 * Clear all toasts
 */
function clearAllToasts() {
    if (window.peerLearnToastContainer) {
        const toasts = window.peerLearnToastContainer.querySelectorAll('div[role="alert"]');
        toasts.forEach(toast => {
            removeToast(toast);
        });
    }
}

// Make functions available globally
window.showToast = showToast;
window.clearAllToasts = clearAllToasts;

// Initialize on load
document.addEventListener('DOMContentLoaded', initToastContainer);