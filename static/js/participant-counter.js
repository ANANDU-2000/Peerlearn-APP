// Participant counter enhancement
document.addEventListener('DOMContentLoaded', function() {
    // Define the Alpine.js component for participant counters
    window.participantCounter = function() {
        return {
            init() {
                // Find all participant counter elements
                const participantCounters = document.querySelectorAll('.participant-counter');
                
                participantCounters.forEach(counter => {
                    // Get current and max values
                    const currentParticipants = parseInt(counter.getAttribute('data-current') || 0);
                    const maxParticipants = parseInt(counter.getAttribute('data-max') || 0);
                    
                    if (maxParticipants > 0) {
                        // Update the display
                        const countDisplay = counter.querySelector('.count-display');
                        if (countDisplay) {
                            // Remove any existing status classes
                            countDisplay.classList.remove('text-primary-600', 'text-amber-600', 'text-red-600');
                            
                            // Add appropriate color based on capacity
                            if (currentParticipants >= maxParticipants) {
                                countDisplay.classList.add('text-red-600');
                                this.addStatusBadge(counter, 'Full', 'red');
                            } else if (currentParticipants >= maxParticipants - 2) {
                                countDisplay.classList.add('text-amber-600');
                                this.addStatusBadge(counter, 'Almost Full', 'amber');
                            } else {
                                countDisplay.classList.add('text-primary-600');
                            }
                        }
                    }
                });
            },
            
            addStatusBadge(counter, text, color) {
                // Check if badge already exists
                if (!counter.querySelector('.status-badge')) {
                    const badge = document.createElement('span');
                    badge.className = `ml-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${color}-100 text-${color}-800 status-badge`;
                    badge.textContent = text;
                    counter.appendChild(badge);
                }
            }
        };
    };
    
    // Initialize if Alpine.js is loaded
    if (window.Alpine) {
        Alpine.data('participantCounter', participantCounter);
    }
});