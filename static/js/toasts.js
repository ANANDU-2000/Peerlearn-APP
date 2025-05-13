/**
 * Toast notification system for PeerLearn
 * Provides a standardized way to show notification toasts across the application
 */

// Toast container setup
let toastContainer;

document.addEventListener('DOMContentLoaded', function() {
    // Create toast container if it doesn't exist
    if (!document.getElementById('toast-container')) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col items-end space-y-4';
        document.body.appendChild(toastContainer);
    } else {
        toastContainer = document.getElementById('toast-container');
    }
});

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast: 'success', 'error', 'info', 'warning'
 * @param {number} duration - Duration in milliseconds
 */
function showToast(message, type = 'info', duration = 5000) {
    if (!toastContainer) {
        // Create container if it doesn't exist yet (page might still be loading)
        toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col items-end space-y-4';
            document.body.appendChild(toastContainer);
        }
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'transform transition-all duration-300 ease-in-out translate-x-full';
    toast.style.minWidth = '300px';
    toast.style.maxWidth = '500px';
    
    // Set appropriate styling based on toast type
    let icon, bgColor, textColor;
    switch(type) {
        case 'success':
            icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
            bgColor = 'bg-green-100';
            textColor = 'text-green-800';
            break;
        case 'error':
            icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
            bgColor = 'bg-red-100';
            textColor = 'text-red-800';
            break;
        case 'warning':
            icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
            bgColor = 'bg-yellow-100';
            textColor = 'text-yellow-800';
            break;
        default: // info
            icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            bgColor = 'bg-blue-100';
            textColor = 'text-blue-800';
    }
    
    // Create toast inner HTML
    toast.innerHTML = `
        <div class="rounded-lg shadow-lg overflow-hidden ${bgColor} p-4">
            <div class="flex items-start">
                <div class="flex-shrink-0 ${textColor}">
                    ${icon}
                </div>
                <div class="ml-3 w-0 flex-1 ${textColor}">
                    <p class="text-sm font-medium">
                        ${message}
                    </p>
                </div>
                <div class="ml-4 flex-shrink-0 flex">
                    <button class="inline-flex ${textColor} focus:outline-none focus:text-gray-700">
                        <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Slide in animation
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    }, 10);
    
    // Setup close button
    const closeButton = toast.querySelector('button');
    const closeToast = () => {
        toast.classList.remove('translate-x-0');
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            toast.remove();
        }, 300);
    };
    
    closeButton.addEventListener('click', closeToast);
    
    // Auto close after duration
    setTimeout(closeToast, duration);
    
    return toast;
}

// Make functions available globally
window.showToast = showToast;