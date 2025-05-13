/**
 * Toast notification system for PeerLearn
 * Provides a consistent way to show notifications to users
 */

// Toast defaults
const TOAST_DEFAULTS = {
    duration: 5000,      // Default duration in ms
    position: 'bottom',  // Position on screen (bottom or top)
    dismissible: true    // Whether toast can be dismissed by clicking
};

let toastContainer = null;
let toastIdCounter = 0;

/**
 * Initialize toast notification system
 */
function initToasts() {
    // Check if container already exists
    if (document.getElementById('toast-container')) {
        toastContainer = document.getElementById('toast-container');
        return;
    }
    
    // Create toast container if it doesn't exist
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed z-50 p-4 flex flex-col items-center w-full md:max-w-md';
    
    // Set position (bottom or top)
    if (TOAST_DEFAULTS.position === 'top') {
        toastContainer.classList.add('top-0', 'right-0');
    } else {
        toastContainer.classList.add('bottom-0', 'right-0');
    }
    
    document.body.appendChild(toastContainer);
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast (success, error, info, warning)
 * @param {Object} options - Optional configuration options
 */
function showToast(message, type = 'info', options = {}) {
    if (!message) return;
    
    // Ensure container is initialized
    if (!toastContainer) {
        initToasts();
    }
    
    // Merge default options with provided options
    const settings = { ...TOAST_DEFAULTS, ...options };
    
    // Create toast element
    const toastId = `toast-${++toastIdCounter}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = 'mb-3 p-4 rounded-lg shadow-lg min-w-full md:min-w-[320px] flex items-start toast-enter';
    toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    
    // Set appropriate background color based on type
    switch (type.toLowerCase()) {
        case 'success':
            toast.classList.add('bg-green-100', 'text-green-800', 'border-l-4', 'border-green-500');
            break;
        case 'error':
            toast.classList.add('bg-red-100', 'text-red-800', 'border-l-4', 'border-red-500');
            break;
        case 'warning':
            toast.classList.add('bg-yellow-100', 'text-yellow-800', 'border-l-4', 'border-yellow-500');
            break;
        case 'info':
        default:
            toast.classList.add('bg-blue-100', 'text-blue-800', 'border-l-4', 'border-blue-500');
            break;
    }
    
    // Create toast content
    const content = document.createElement('div');
    content.className = 'flex-grow pr-3';
    content.textContent = message;
    
    // Create dismiss button if dismissible
    const dismissButton = document.createElement('button');
    dismissButton.className = 'text-gray-500 hover:text-gray-700 focus:outline-none';
    dismissButton.innerHTML = '&times;';
    dismissButton.onclick = () => dismissToast(toastId);
    
    // Assemble toast
    toast.appendChild(content);
    if (settings.dismissible) {
        toast.appendChild(dismissButton);
    }
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Set auto-dismiss timeout
    if (settings.duration > 0) {
        setTimeout(() => {
            if (document.getElementById(toastId)) {
                dismissToast(toastId);
            }
        }, settings.duration);
    }
    
    // Add click handler to dismiss
    if (settings.dismissible) {
        toast.addEventListener('click', () => dismissToast(toastId));
    }
    
    return toastId;
}

/**
 * Dismiss a toast notification
 * @param {string} toastId - The ID of the toast to dismiss
 */
function dismissToast(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;
    
    // Animate dismissal
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    
    // Remove after animation completes
    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

/**
 * Clear all toast notifications
 */
function clearToasts() {
    if (!toastContainer) return;
    
    // Get all toasts
    const toasts = toastContainer.querySelectorAll('[id^="toast-"]');
    
    // Dismiss each toast
    toasts.forEach(toast => {
        dismissToast(toast.id);
    });
}

// Initialize toast system when DOM is loaded
document.addEventListener('DOMContentLoaded', initToasts);

// Make toast functions available globally
window.showToast = showToast;
window.dismissToast = dismissToast;
window.clearToasts = clearToasts;