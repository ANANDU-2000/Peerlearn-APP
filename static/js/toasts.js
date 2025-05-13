/**
 * Toasts and notification system for PeerLearn
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize Alpine component for toasts
  window.toastSystem = function() {
    return {
      toasts: [],
      visible: [],
      
      // Add a new toast notification
      add(message, type = 'info', duration = 5000) {
        const id = Date.now();
        const toast = { id, message, type };
        
        this.toasts.push(toast);
        this.visible.push(id);
        
        // Auto remove after duration
        if (duration > 0) {
          setTimeout(() => {
            this.remove(id);
          }, duration);
        }
        
        return id;
      },
      
      // Remove a toast by ID
      remove(id) {
        const index = this.visible.indexOf(id);
        if (index !== -1) {
          this.visible.splice(index, 1);
          
          // Clean up toasts array after some delay
          setTimeout(() => {
            const toastIndex = this.toasts.findIndex(t => t.id === id);
            if (toastIndex !== -1) {
              this.toasts.splice(toastIndex, 1);
            }
          }, 500);
        }
      },
      
      // Get toast icon based on type
      getIcon(type) {
        switch(type) {
          case 'success':
            return `<svg class="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>`;
          case 'error':
            return `<svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>`;
          case 'warning':
            return `<svg class="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>`;
          default:
            return `<svg class="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>`;
        }
      },
      
      // Get background color based on type
      getBgColor(type) {
        switch(type) {
          case 'success': return 'bg-green-50';
          case 'error': return 'bg-red-50';
          case 'warning': return 'bg-yellow-50';
          default: return 'bg-blue-50';
        }
      },
      
      // Get border color based on type
      getBorderColor(type) {
        switch(type) {
          case 'success': return 'border-green-400';
          case 'error': return 'border-red-400';
          case 'warning': return 'border-yellow-400';
          default: return 'border-blue-400';
        }
      }
    };
  };
});