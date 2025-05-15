/**
 * Notification Sound System for PeerLearn
 * Provides audio notifications for WebSocket events
 */

(function() {
    // Don't re-initialize if already defined
    if (typeof window.NotificationSounds !== 'undefined') {
        return;
    }

    // Audio assets paths
    const SOUND_PATHS = {
        NEW_NOTIFICATION: '/static/sounds/notification.mp3',
        SESSION_START: '/static/sounds/session-start.mp3',
        SESSION_JOIN: '/static/sounds/session-join.mp3',
        SESSION_END: '/static/sounds/session-end.mp3',
        MESSAGE: '/static/sounds/message.mp3',
        ERROR: '/static/sounds/error.mp3'
    };

    // Audio objects cache
    const audioCache = {};

    // User preferences (default to enabled)
    let soundsEnabled = localStorage.getItem('notification_sounds_enabled') !== 'false';

    /**
     * Notification Sound System
     */
    class NotificationSoundSystem {
        /**
         * Initialize the notification sound system
         */
        constructor() {
            this.preloadSounds();
            this.initDashboardConsumer();
            this.initSessionConsumer();
        }

        /**
         * Preload audio files
         */
        preloadSounds() {
            // Only preload sounds if they're enabled
            if (!soundsEnabled) return;

            Object.entries(SOUND_PATHS).forEach(([key, path]) => {
                try {
                    const audio = new Audio(path);
                    audio.preload = 'auto';
                    audio.load();
                    audioCache[key] = audio;
                } catch (error) {
                    console.warn(`Failed to preload sound: ${path}`, error);
                }
            });
            
            console.log('Notification sounds preloaded');
        }

        /**
         * Play a notification sound
         * @param {string} soundType - The type of sound to play
         */
        playSound(soundType) {
            // Check if sounds are enabled
            if (!soundsEnabled) return;
            
            // Get the sound from cache or create a new Audio object
            let audio = audioCache[soundType];
            
            if (!audio) {
                const path = SOUND_PATHS[soundType];
                if (!path) {
                    console.warn(`Unknown sound type: ${soundType}`);
                    return;
                }
                
                try {
                    audio = new Audio(path);
                    audioCache[soundType] = audio;
                } catch (error) {
                    console.warn(`Failed to create audio: ${path}`, error);
                    return;
                }
            }
            
            // Try to play the sound
            try {
                // Reset the audio to the beginning if it's already playing
                audio.pause();
                audio.currentTime = 0;
                
                // Play the sound with a promise to catch any errors
                const playPromise = audio.play();
                
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn(`Failed to play sound: ${error.message}`);
                        
                        // If autoplay is blocked, we might need user interaction first
                        if (error.name === 'NotAllowedError') {
                            console.warn('Audio playback requires user interaction first');
                        }
                    });
                }
            } catch (error) {
                console.warn(`Error playing sound: ${error.message}`);
            }
        }

        /**
         * Toggle notification sounds on/off
         * @returns {boolean} The new state
         */
        toggleSounds() {
            soundsEnabled = !soundsEnabled;
            localStorage.setItem('notification_sounds_enabled', soundsEnabled);
            console.log(`Notification sounds ${soundsEnabled ? 'enabled' : 'disabled'}`);
            return soundsEnabled;
        }

        /**
         * Get current sound status
         * @returns {boolean} Whether sounds are enabled
         */
        getSoundStatus() {
            return soundsEnabled;
        }

        /**
         * Initialize dashboard WebSocket consumer
         * This connects to the user's dashboard WebSocket
         */
        initDashboardConsumer() {
            // Wait for the dashboard page to be ready
            document.addEventListener('DOMContentLoaded', () => {
                // Check if we're on a dashboard page with a user-id meta tag
                const userIdMeta = document.querySelector('meta[name="user-id"]');
                if (!userIdMeta) return;
                
                const userId = userIdMeta.getAttribute('content');
                if (!userId) return;
                
                // Wait for Alpine.js to initialize
                setTimeout(() => {
                    // Hook into Alpine's dashboard socket event handlers
                    document.querySelectorAll('[x-data]').forEach(el => {
                        if (el.__x && el.__x.$data.dashboardSocket) {
                            const originalOnMessage = el.__x.$data.dashboardSocket.onmessage;
                            
                            // Override the onmessage handler
                            el.__x.$data.dashboardSocket.onmessage = (event) => {
                                // Call the original handler
                                if (originalOnMessage) {
                                    originalOnMessage.call(el.__x.$data.dashboardSocket, event);
                                }
                                
                                // Process event for sounds
                                this.handleDashboardSocketMessage(event);
                            };
                        }
                    });
                }, 1000);
            });
        }

        /**
         * Initialize session/room WebSocket consumer
         * This connects to the room WebSocket
         */
        initSessionConsumer() {
            // Wait for the room page to be ready
            document.addEventListener('DOMContentLoaded', () => {
                // Check if we're on a room page with a socket connection
                setTimeout(() => {
                    // Check for WebRTC connection object
                    if (window.webRTCConnection && window.webRTCConnection.socket) {
                        const originalOnMessage = window.webRTCConnection.socket.onmessage;
                        
                        // Override the onmessage handler
                        window.webRTCConnection.socket.onmessage = (event) => {
                            // Call the original handler
                            if (originalOnMessage) {
                                originalOnMessage.call(window.webRTCConnection.socket, event);
                            }
                            
                            // Process event for sounds
                            this.handleSessionSocketMessage(event);
                        };
                    }
                }, 1000);
            });
        }

        /**
         * Handle dashboard WebSocket messages
         * @param {MessageEvent} event - The WebSocket message event
         */
        handleDashboardSocketMessage(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Play sounds based on event type
                switch (data.type) {
                    case 'notification_update':
                        // New notification
                        this.playSound('NEW_NOTIFICATION');
                        break;
                    
                    case 'session_update':
                        // Session status update
                        if (data.status === 'live') {
                            this.playSound('SESSION_START');
                        } else if (data.status === 'completed') {
                            this.playSound('SESSION_END');
                        }
                        break;
                    
                    case 'booking_update':
                        // Booking update (new booking)
                        if (data.status === 'confirmed') {
                            this.playSound('NEW_NOTIFICATION');
                        }
                        break;
                }
            } catch (error) {
                console.warn('Error handling dashboard socket message:', error);
            }
        }

        /**
         * Handle session WebSocket messages
         * @param {MessageEvent} event - The WebSocket message event 
         */
        handleSessionSocketMessage(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Play sounds based on event type
                switch (data.type) {
                    case 'user_join':
                        // User joined the session
                        this.playSound('SESSION_JOIN');
                        break;
                    
                    case 'chat_message':
                        // New chat message
                        this.playSound('MESSAGE');
                        break;
                    
                    case 'session_ended':
                        // Session ended
                        this.playSound('SESSION_END');
                        break;
                    
                    case 'error':
                        // Error occurred
                        this.playSound('ERROR');
                        break;
                }
            } catch (error) {
                console.warn('Error handling session socket message:', error);
            }
        }
    }

    // Create and export the notification sound system
    window.NotificationSounds = new NotificationSoundSystem();
})();