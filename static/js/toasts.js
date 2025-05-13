/**
 * Toast notification utility for PeerLearn
 * Provides consistent toast notifications throughout the application
 */

// Toast container
let toastContainer = null;

// Initialize toast container
function initToastContainer() {
    if (toastContainer) return;
    
    // Create toast container if it doesn't exist
    toastContainer = document.createElement('div');
    toastContainer.className = 'fixed top-0 right-0 p-4 z-50 space-y-4 max-w-md w-full';
    document.body.appendChild(toastContainer);
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast (success, error, info, warning)
 * @param {number} duration - How long to display the toast in ms (0 for no auto-dismiss)
 * @returns {HTMLElement} - The toast element
 */
function showToast(message, type = 'info', duration = 5000) {
    initToastContainer();
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `transform translate-x-0 transition-all duration-300 ease-in-out 
                      flex items-center justify-between p-4 mb-3 rounded-lg shadow-lg 
                      text-white max-w-md w-full`;
    
    // Set background color based on type
    switch (type) {
        case 'success':
            toast.classList.add('bg-green-600');
            break;
        case 'error':
            toast.classList.add('bg-red-600');
            break;
        case 'warning':
            toast.classList.add('bg-yellow-600');
            break;
        case 'info':
        default:
            toast.classList.add('bg-blue-600');
            break;
    }
    
    // Add icon based on type
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<svg class="w-6 h-6 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
            break;
        case 'error':
            icon = '<svg class="w-6 h-6 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
            break;
        case 'warning':
            icon = '<svg class="w-6 h-6 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
            break;
        case 'info':
        default:
            icon = '<svg class="w-6 h-6 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            break;
    }
    
    // Set content
    toast.innerHTML = `
        <div class="flex items-center">
            ${icon}
            <div class="text-sm font-medium">${message}</div>
        </div>
        <button type="button" class="ml-4 focus:outline-none">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Start with the toast translated
    toast.style.transform = 'translateX(100%)';
    
    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 10);
    
    // Set up dismiss button
    const dismissBtn = toast.querySelector('button');
    dismissBtn.addEventListener('click', () => {
        removeToast(toast);
    });
    
    // Auto dismiss
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
    
    return toast;
}

/**
 * Remove a toast with animation
 * @param {HTMLElement} toast - The toast element to remove
 */
function removeToast(toast) {
    // If toast is already being removed, do nothing
    if (toast.classList.contains('removing')) return;
    
    toast.classList.add('removing');
    toast.style.transform = 'translateX(100%)';
    
    setTimeout(() => {
        toast.remove();
    }, 300);
}

/**
 * Remove all toasts
 */
function clearAllToasts() {
    if (!toastContainer) return;
    
    // Get all toasts
    const toasts = toastContainer.querySelectorAll('div');
    toasts.forEach(toast => {
        removeToast(toast);
    });
}

// Make toast utility available globally
window.showToast = showToast;
window.clearAllToasts = clearAllToasts;