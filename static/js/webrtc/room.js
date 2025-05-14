/**
 * PeerLearn WebRTC Room Implementation
 * Handles WebRTC connections for live video sessions between mentors and learners
 */

// Initialize the WebRTC room with Alpine.js
function initWebRTCRoom(roomCode, userId, userName, userRole, iceServers) {
    // Add Alpine.js data component
    window.webRTCRoom = function() {
        return {
            // Connection state
            websocket: null,
            peerConnections: {},
            localStream: null,
            screenStream: null,
            mainStream: null,
            mainStreamUser: userName,
            mainStreamUserId: null,
            remoteUserRole: 'learner',  // Role of remote user (mentor/learner)
            otherParticipants: [], // Array of connected participants
            participantMediaStatus: {}, // Keep track of participants' media status
            chatMessages: [],
            newMessage: "",
            isAudioEnabled: true, // Flag to track audio state
            isVideoEnabled: true, // Flag to track video state
            isScreenSharing: false,
            sessionStatus: "connecting",
            sessionStartTime: null,
            sessionDuration: 0,
            sessionTimer: "00:00:00",
            connectionStatus: "Connecting...",
            connectionStatusClass: "connecting",
            
            // Computed properties
            get participantsLabel() {
                const count = this.otherParticipants.length + 1; // +1 for self
                return `${count} participant${count !== 1 ? 's' : ''} in session`;
            },
            
            // Initialize
            init() {
                // Set up autoplay detection handlers first
                this.checkForAutoplayIssues();
                
                // Set up WebRTC
                this.setupWebRTC();
                
                // Update session timer every second
                this.updateSessionTimer();
                setInterval(() => this.updateSessionTimer(), 1000);
                
                // Auto-scroll chat messages when new messages arrive
                this.$watch('chatMessages', () => {
                    setTimeout(() => {
                        if (this.$refs.chatMessages) {
                            this.$refs.chatMessages.scrollTop = this.$refs.chatMessages.scrollHeight;
                        }
                    }, 50);
                });
                
                // Handle page unload (cleanup)
                window.addEventListener('beforeunload', () => {
                    this.cleanup();
                });
                
                // Add debugging helper function
                window.debugVideoElements = () => this.debugVideoElements();
            },
            
            // Set up WebRTC
            // Check for browser autoplay policy issues
            checkForAutoplayIssues() {
                try {
                    const localVideo = document.getElementById('local-video');
                    const mainVideo = document.getElementById('main-video');
                    
                    if (!localVideo || !mainVideo) {
                        console.error("Could not find video elements for autoplay check");
                        return;
                    }
                    
                    // Add autoplay failure handlers
                    localVideo.addEventListener('loadedmetadata', () => {
                        console.log("Local video loadedmetadata event fired");
                        this.tryPlayVideo(localVideo, 'local');
                    });
                    
                    mainVideo.addEventListener('loadedmetadata', () => {
                        console.log("Main video loadedmetadata event fired");
                        this.tryPlayVideo(mainVideo, 'main');
                    });
                    
                    // Add click handler to page to help with autoplay
                    document.addEventListener('click', () => {
                        this.tryPlayAllVideos();
                    }, { once: true });
                    
                    console.log("Added autoplay issue detection handlers");
                } catch (e) {
                    console.error("Error setting up autoplay detection:", e);
                }
            },
            
            // Try to play a video and handle autoplay issues
            async tryPlayVideo(videoElement, description) {
                if (!videoElement) return;
                
                try {
                    if (videoElement.paused) {
                        console.log(`Attempting to play ${description} video...`);
                        const playPromise = videoElement.play();
                        
                        if (playPromise !== undefined) {
                            playPromise.then(() => {
                                console.log(`${description} video playing successfully`);
                            }).catch(err => {
                                console.warn(`Autoplay prevented for ${description} video:`, err);
                                // Show user interaction required message
                                showToast('info', 'Interaction Required', 'Please click anywhere on the screen to enable video and audio.', 8000);
                                
                                // Add a play button overlay
                                this.addPlayButtonOverlay();
                            });
                        }
                    } else {
                        console.log(`${description} video is already playing`);
                    }
                } catch (e) {
                    console.error(`Error trying to play ${description} video:`, e);
                }
            },
            
            // Try to play all videos
            tryPlayAllVideos() {
                const localVideo = document.getElementById('local-video');
                const mainVideo = document.getElementById('main-video');
                
                this.tryPlayVideo(localVideo, 'local');
                this.tryPlayVideo(mainVideo, 'main');
                
                // Remove any play button overlays
                this.removePlayButtonOverlay();
            },
            
            // Add a play button overlay to help with autoplay
            addPlayButtonOverlay() {
                if (document.getElementById('play-overlay')) return;
                
                const overlay = document.createElement('div');
                overlay.id = 'play-overlay';
                overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50';
                overlay.innerHTML = `
                    <div class="text-center p-6 bg-white rounded-lg shadow-xl">
                        <h3 class="text-xl font-bold mb-4">Start Video and Audio</h3>
                        <p class="mb-4">Your browser needs permission to play audio and video.</p>
                        <button id="overlay-play-btn" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline mr-1" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                            </svg>
                            Click to Enable
                        </button>
                    </div>
                `;
                
                document.body.appendChild(overlay);
                
                // Add click event to play button
                document.getElementById('overlay-play-btn').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.tryPlayAllVideos();
                    this.removePlayButtonOverlay();
                });
            },
            
            // Remove play button overlay
            removePlayButtonOverlay() {
                const overlay = document.getElementById('play-overlay');
                if (overlay) {
                    overlay.remove();
                }
            },
            
            // Debug video elements
            debugVideoElements() {
                try {
                    const localVideo = document.getElementById('local-video');
                    const mainVideo = document.getElementById('main-video');
                    
                    console.log("=== VIDEO DEBUG INFO ===");
                    
                    console.log("Local video:", {
                        element: localVideo,
                        srcObject: localVideo.srcObject,
                        paused: localVideo.paused,
                        muted: localVideo.muted,
                        videoTracks: localVideo.srcObject ? localVideo.srcObject.getVideoTracks().length : 0,
                        videoTrackEnabled: localVideo.srcObject && localVideo.srcObject.getVideoTracks().length > 0 ? 
                            localVideo.srcObject.getVideoTracks()[0].enabled : 'N/A',
                        readyState: localVideo.srcObject && localVideo.srcObject.getVideoTracks().length > 0 ? 
                            localVideo.srcObject.getVideoTracks()[0].readyState : 'N/A'
                    });
                    
                    console.log("Main video:", {
                        element: mainVideo,
                        srcObject: mainVideo.srcObject,
                        paused: mainVideo.paused,
                        muted: mainVideo.muted,
                        videoTracks: mainVideo.srcObject ? mainVideo.srcObject.getVideoTracks().length : 0
                    });
                    
                    console.log("Alpine data:", {
                        localStream: this.localStream ? {
                            id: this.localStream.id,
                            active: this.localStream.active,
                            videoTracks: this.localStream.getVideoTracks().length
                        } : null,
                        mainStream: this.mainStream ? {
                            id: this.mainStream.id,
                            active: this.mainStream.active,
                            videoTracks: this.mainStream.getVideoTracks().length
                        } : null,
                        videoEnabled: this.videoEnabled,
                        audioEnabled: this.audioEnabled
                    });
                    
                    return "Debug info logged to console";
                } catch (e) {
                    console.error("Error debugging video elements:", e);
                    return "Error debugging video elements: " + e.message;
                }
            },
            
            async setupWebRTC() {
                try {
                    console.log("Setting up WebRTC room...");
                    
                    // Connect to WebSocket
                    this.connectWebSocket(roomCode);
                    
                    // Wait a moment for the WebSocket to connect before requesting media
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Check if WebSocket is connected
                    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
                        console.warn("WebSocket not connected when trying to access media. Attempting to proceed anyway.");
                    }
                    
                    console.log("Requesting user media permissions...");
                    
                    // Request media permissions - this is a critical step
                    const mediaSuccess = await this.requestUserMedia();
                    
                    if (!mediaSuccess) {
                        throw new Error("Failed to get user media");
                    }
                    
                    // Update UI
                    this.connectionStatus = "Connected";
                    this.connectionStatusClass = "connected";
                    this.sessionStatus = "live";
                    
                    console.log("WebRTC setup completed successfully");
                    
                    // If mentor, update session status to live
                    if (userRole === 'mentor') {
                        console.log("Updating session status to live (mentor role)");
                        this.updateSessionStatus('live');
                    }
                    
                    // Show success message
                    showToast('success', 'Connected', 'You have joined the session successfully.');
                } catch (error) {
                    console.error("Error setting up WebRTC:", error);
                    this.connectionStatus = "Error";
                    this.connectionStatusClass = "error";
                    
                    // Handle specific errors
                    if (error.name === 'NotAllowedError') {
                        showToast('error', 'Permission Denied', 'You need to grant camera and microphone permissions to join the session. Please check your browser settings and try again.');
                    } else if (error.name === 'NotFoundError') {
                        showToast('error', 'Device Not Found', 'Camera or microphone not found. Please check your device connections and try again.');
                    } else if (error.name === 'NotReadableError' || error.name === 'AbortError') {
                        showToast('error', 'Device Error', 'Cannot access your camera or microphone. The device might be in use by another application.');
                    } else {
                        showToast('error', 'Connection Error', `Failed to connect to the session: ${error.message}. Please try refreshing the page.`);
                    }
                }
            },
            
            // Connect to WebSocket server
            connectWebSocket(roomCode) {
                // Create WebSocket connection - support multiple endpoint formats for maximum compatibility
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                
                // Try all possible endpoint formats
                const wsUrlPlural = `${protocol}//${window.location.host}/ws/sessions/${roomCode}/`;
                const wsUrlSingular = `${protocol}//${window.location.host}/ws/session/${roomCode}/`;
                const wsUrlRoom = `${protocol}//${window.location.host}/ws/room/${roomCode}/`;
                
                console.log(`Starting WebSocket connection attempts for room: ${roomCode}`);
                
                // Connection state tracking
                this.connectionStatus = "Connecting";
                this.connectionStatusClass = "connecting";
                this.wsReconnectTimer = null;
                this.wsLastMessageTime = Date.now();
                this.wsCurrentEndpoint = null;
                this.wsConnectedOnce = false;
                this.roomCode = roomCode;
                
                // Connection attempts counter and endpoint list
                let attemptCount = 0;
                const maxAttempts = 3;
                const endpoints = [wsUrlPlural, wsUrlSingular, wsUrlRoom];
                
                // Function to try the next endpoint in sequence
                const tryNextEndpoint = () => {
                    if (attemptCount < maxAttempts) {
                        const currentUrl = endpoints[attemptCount];
                        this.wsCurrentEndpoint = currentUrl;
                        
                        // Update UI with connection attempt status
                        this.connectionStatus = `Connecting (${attemptCount + 1}/${maxAttempts})`;
                        console.log(`WebSocket connection attempt ${attemptCount + 1}/${maxAttempts} at: ${currentUrl}`);
                        
                        try {
                            // Close previous connection if it exists but isn't in OPEN state
                            if (this.websocket && this.websocket.readyState !== WebSocket.OPEN) {
                                try {
                                    this.websocket.close();
                                } catch (e) {
                                    console.warn("Error closing previous socket:", e);
                                }
                            }
                            
                            // Create new WebSocket connection
                            this.websocket = new WebSocket(currentUrl);
                            
                            // Handle connection success
                            this.websocket.onopen = (event) => {
                                console.log(`WebSocket connection established successfully to ${currentUrl}`);
                                this.wsConnectedOnce = true;
                                this.onWebSocketOpen(event);
                                
                                // Start heartbeat mechanism
                                this.startHeartbeat();
                            };
                            
                            // Handle messages
                            this.websocket.onmessage = (event) => {
                                // Update last message timestamp for heartbeat checking
                                this.wsLastMessageTime = Date.now();
                                // Process the message
                                this.onWebSocketMessage(event);
                            };
                            
                            // Handle connection close
                            this.websocket.onclose = (event) => {
                                // Stop heartbeat checking
                                if (this.heartbeatInterval) {
                                    clearInterval(this.heartbeatInterval);
                                    this.heartbeatInterval = null;
                                }
                                
                                // If we've connected successfully before, try to reconnect to the same endpoint
                                if (this.wsConnectedOnce) {
                                    console.warn(`WebSocket connection lost (code ${event.code}), will attempt to reconnect`);
                                    this.connectionStatus = "Reconnecting";
                                    this.connectionStatusClass = "connecting";
                                    
                                    // Show toast notification
                                    showToast('warning', 'Connection Lost', 'Connection to the session was lost. Attempting to reconnect automatically...');
                                    
                                    // Schedule reconnection attempt (with increasing backoff)
                                    const reconnectDelay = Math.min(3000 + (this.reconnectAttempts * 1000), 10000);
                                    this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
                                    
                                    this.wsReconnectTimer = setTimeout(() => {
                                        console.log(`Attempting to reconnect to ${this.wsCurrentEndpoint}`);
                                        
                                        try {
                                            this.websocket = new WebSocket(this.wsCurrentEndpoint);
                                            
                                            // Copy over the same handlers
                                            this.websocket.onopen = this.onWebSocketOpen.bind(this);
                                            this.websocket.onmessage = this.onWebSocketMessage.bind(this);
                                            this.websocket.onclose = this.onWebSocketClose.bind(this);
                                            this.websocket.onerror = this.onWebSocketError.bind(this);
                                        } catch (err) {
                                            console.error("Error during reconnection attempt:", err);
                                            
                                            // If we're in a room, try to reload the page after too many failed attempts
                                            if (this.reconnectAttempts >= 5) {
                                                showToast('error', 'Connection Failed', 
                                                    'Failed to reconnect after multiple attempts. The page will reload in 5 seconds.',
                                                    0 // Don't auto-dismiss
                                                );
                                                
                                                // Add reload button 
                                                const reloadBtn = document.createElement('button');
                                                reloadBtn.className = 'ml-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded';
                                                reloadBtn.textContent = 'Reload Now';
                                                reloadBtn.addEventListener('click', () => window.location.reload());
                                                
                                                // Find last toast
                                                const toast = document.querySelector('.toast:last-child .toast-content');
                                                if (toast) {
                                                    toast.appendChild(reloadBtn);
                                                }
                                                
                                                // Schedule page reload
                                                setTimeout(() => window.location.reload(), 5000);
                                            } else {
                                                // Schedule another reconnection attempt
                                                this.wsReconnectTimer = setTimeout(() => {
                                                    this.connectWebSocket(this.roomCode);
                                                }, reconnectDelay);
                                            }
                                        }
                                    }, reconnectDelay);
                                    
                                    return;
                                }
                                
                                // Only try next endpoint if this wasn't a normal closure and we haven't connected before
                                if (event.code !== 1000 && event.code !== 1001) {
                                    attemptCount++;
                                    if (attemptCount < maxAttempts) {
                                        console.warn(`WebSocket connection to ${currentUrl} failed (code ${event.code}), trying next endpoint...`);
                                        setTimeout(tryNextEndpoint, 500); // Add delay between attempts
                                    } else {
                                        console.error("All WebSocket connection attempts failed");
                                        this.onWebSocketClose(event);
                                    }
                                } else {
                                    this.onWebSocketClose(event);
                                }
                            };
                            
                            // Handle errors
                            this.websocket.onerror = (error) => {
                                console.warn(`WebSocket error on ${currentUrl}:`, error);
                                // Error handler is lightweight - we let onclose handle the fallback
                                // Only manually trigger next attempt if this is the first try and we get an immediate error
                                if (!this.wsConnectedOnce && attemptCount === 0) {
                                    setTimeout(() => {
                                        if (this.websocket && this.websocket.readyState !== WebSocket.OPEN) {
                                            attemptCount++;
                                            tryNextEndpoint();
                                        }
                                    }, 1000);
                                }
                                
                                this.onWebSocketError(error);
                            };
                            
                        } catch (e) {
                            console.error(`Error creating WebSocket connection to ${currentUrl}:`, e);
                            attemptCount++;
                            if (attemptCount < maxAttempts) {
                                setTimeout(tryNextEndpoint, 500);
                            } else {
                                // All attempts failed
                                this.connectionStatus = "Connection Error";
                                this.connectionStatusClass = "error";
                                showToast('error', 'Connection Error', 'Failed to connect to the session. Please refresh the page and try again.');
                            }
                        }
                    } else {
                        // All attempts failed
                        this.connectionStatus = "Connection Error";
                        this.connectionStatusClass = "error";
                        showToast('error', 'Connection Error', 'Failed to connect to the room after multiple attempts. Please refresh the page or try again later.');
                    }
                };
                
                // Start connection attempt sequence
                tryNextEndpoint();
            },
            
            // Start heartbeat to detect silent disconnections
            startHeartbeat() {
                // Clear any existing interval
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                }
                
                // Check every 15 seconds if we're still receiving messages
                this.heartbeatInterval = setInterval(() => {
                    // Calculate time since last message or pong
                    const now = Date.now();
                    const timeSinceLastMessage = now - this.wsLastMessageTime;
                    
                    // If it's been more than 30 seconds, the connection might be dead
                    if (timeSinceLastMessage > 30000) {
                        console.warn(`No WebSocket activity detected for ${Math.round(timeSinceLastMessage/1000)}s, connection may be stale`);
                        
                        // Send a ping to check connection
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            try {
                                this.websocket.send(JSON.stringify({
                                    type: 'ping',
                                    timestamp: now
                                }));
                                console.log('Sent WebSocket ping to check connection');
                            } catch (e) {
                                console.error('Error sending ping:', e);
                                
                                // If ping fails, close the socket to trigger reconnection
                                try {
                                    this.websocket.close();
                                } catch (closeError) {
                                    console.error('Error closing stale WebSocket:', closeError);
                                }
                            }
                        }
                        
                        // If it's been more than 45 seconds, force reconnection
                        if (timeSinceLastMessage > 45000) {
                            console.error('Connection appears dead, forcing reconnection');
                            
                            // Clear this interval
                            clearInterval(this.heartbeatInterval);
                            this.heartbeatInterval = null;
                            
                            // Force close and reconnect
                            try {
                                if (this.websocket) {
                                    this.websocket.close();
                                }
                            } catch (e) {
                                console.warn('Error closing socket during forced reconnection:', e);
                            }
                            
                            // Reconnect using the last known endpoint
                            setTimeout(() => {
                                if (this.wsCurrentEndpoint) {
                                    this.connectWebSocket(this.roomCode);
                                }
                            }, 1000);
                        }
                    }
                }, 15000);
            },
            
            // WebSocket open event handler
            onWebSocketOpen(event) {
                console.log("WebSocket connection established successfully");
                
                // Update UI status
                this.connectionStatus = "Connected to signaling server";
                this.connectionStatusClass = "connected";
                
                // Send join message
                const joinMessage = {
                    type: 'join',
                    user_id: userId,
                    username: userName,
                    role: userRole
                };
                
                console.log("Sending join message:", joinMessage);
                this.websocket.send(JSON.stringify(joinMessage));
                
                // Show toast notification
                showToast('info', 'Connected', 'Connected to session room. Setting up video...');
            },
            
            // WebSocket message event handler
            async onWebSocketMessage(event) {
                try {
                    const message = JSON.parse(event.data);
                    
                    // Don't log ping/pong messages to avoid console clutter
                    if (message.type !== 'ping' && message.type !== 'pong') {
                        console.log("Received message:", message);
                    }
                    
                    // Update the last message timestamp (used for connection health monitoring)
                    this.wsLastMessageTime = Date.now();
                    
                    switch (message.type) {
                        case 'ping':
                            // Respond to ping with pong to keep connection alive
                            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                                this.websocket.send(JSON.stringify({
                                    type: 'pong',
                                    timestamp: Date.now(),
                                    original_timestamp: message.timestamp
                                }));
                            }
                            break;
                            
                        case 'pong':
                            // Calculate latency if we're tracking it
                            if (message.original_timestamp) {
                                const latency = Date.now() - message.original_timestamp;
                                console.log(`WebSocket connection latency: ${latency}ms`);
                                
                                // Update connection status if latency is high
                                if (latency > 500) {
                                    this.connectionQuality = 'poor';
                                } else if (latency > 200) {
                                    this.connectionQuality = 'fair';
                                } else {
                                    this.connectionQuality = 'good';
                                }
                            }
                            break;
                            
                        case 'heartbeat':
                            // Server-initiated heartbeat, just acknowledge receipt
                            break;
                            
                        case 'user_join':
                            // New user joined
                            if (message.user_id !== userId) {
                                const newParticipant = {
                                    id: message.user_id,
                                    username: message.username,
                                    role: message.role,
                                    audioEnabled: true,  // Initialize with audio enabled
                                    videoEnabled: true   // Initialize with video enabled
                                };
                                this.otherParticipants.push(newParticipant);
                                
                                // Initialize media status tracking for this participant
                                this.participantMediaStatus[message.user_id] = {
                                    audioEnabled: true,
                                    videoEnabled: true
                                };
                                
                                try {
                                    // Make sure we have local media first
                                    if (!this.localStream) {
                                        console.log("Requesting user media before creating peer connection");
                                        await this.requestUserMedia();
                                    }
                                    
                                    // Create peer connection for new user with better error handling
                                    console.log(`Creating peer connection for ${message.username} (${message.role})`);
                                    await this.createPeerConnection(message.user_id, message.username);
                                    
                                    // Determine who should send the offer to avoid simultaneous offers
                                    // Mentor always initiates with learner, or use IDs to break ties between same roles
                                    const shouldInitiate = 
                                        (userRole === 'mentor' && message.role === 'learner') || 
                                        (userRole === message.role && parseInt(userId) > parseInt(message.user_id));
                                    
                                    console.log(`Connection negotiation: ${shouldInitiate ? 'We initiate' : 'They initiate'}`);
                                    
                                    if (shouldInitiate) {
                                        console.log(`Creating offer for ${message.username}`);
                                        
                                        try {
                                            // Create offer with explicit constraints for better connectivity
                                            const offer = await this.peerConnections[message.user_id].createOffer({
                                                offerToReceiveAudio: true, 
                                                offerToReceiveVideo: true,
                                                iceRestart: true // More reliable for difficult network conditions
                                            });
                                            
                                            console.log("Offer created, setting local description");
                                            await this.peerConnections[message.user_id].setLocalDescription(offer);
                                            
                                            console.log("Sending offer to remote peer");
                                            this.websocket.send(JSON.stringify({
                                                type: 'offer',
                                                target: message.user_id,
                                                user_id: userId,
                                                username: userName,
                                                role: userRole,
                                                sdp: this.peerConnections[message.user_id].localDescription
                                            }));
                                        } catch (offerError) {
                                            console.error("Failed to create or send offer:", offerError);
                                            showToast('error', 'Connection Error', 'Failed to initiate connection. Try refreshing.');
                                        }
                                    } else {
                                        console.log(`Waiting for offer from ${message.username}`);
                                    }
                                } catch (peerError) {
                                    console.error("Error in peer connection setup:", peerError);
                                    showToast('error', 'Connection Error', 'Problem setting up video connection. Try refreshing.');
                                }
                                
                                // Send our current media state to the new participant
                                this.websocket.send(JSON.stringify({
                                    type: 'media_status',
                                    target: message.user_id,
                                    user_id: userId,
                                    username: userName,
                                    audioEnabled: this.audioEnabled,
                                    videoEnabled: this.videoEnabled
                                }));
                                
                                // Show toast
                                showToast('info', 'User Joined', `${message.username} joined the session.`);
                            }
                            break;
                            
                        case 'user_leave':
                            // User left
                            if (message.user_id !== userId) {
                                // Remove peer connection
                                if (this.peerConnections[message.user_id]) {
                                    this.peerConnections[message.user_id].close();
                                    delete this.peerConnections[message.user_id];
                                }
                                
                                // Remove from participants list and media status tracking
                                this.otherParticipants = this.otherParticipants.filter(
                                    participant => participant.id !== message.user_id
                                );
                                
                                // Remove from media status tracking
                                if (this.participantMediaStatus[message.user_id]) {
                                    delete this.participantMediaStatus[message.user_id];
                                }
                                
                                // Show toast
                                showToast('info', 'User Left', `${message.username} left the session.`);
                            }
                            break;
                            
                        case 'offer':
                            // Received an offer
                            if (message.target === userId) {
                                // Create peer connection if it doesn't exist
                                try {
                                    if (!this.peerConnections[message.user_id]) {
                                        const username = this.otherParticipants.find(p => p.id === message.user_id)?.username || 'Unknown';
                                        console.log(`Creating new peer connection for user ${username} (${message.user_id}) to respond to offer`);
                                        await this.createPeerConnection(message.user_id, username);
                                    }
                                    
                                    console.log(`Setting remote description from offer by ${message.user_id}`);
                                    
                                    // Set remote description with explicit error handling
                                    try {
                                        await this.peerConnections[message.user_id].setRemoteDescription(new RTCSessionDescription(message.sdp));
                                    } catch (sdpError) {
                                        console.error("Error setting remote description:", sdpError);
                                        showToast('error', 'Connection Error', 'Failed to process connection data. Please refresh.');
                                        return;
                                    }
                                    
                                    // Make sure we have our local stream before creating an answer
                                    if (!this.localStream) {
                                        console.log("Requesting user media before creating answer");
                                        await this.requestUserMedia();
                                    }
                                    
                                    // Create answer with explicit timeout and error handling
                                    console.log("Creating answer");
                                    let answerCreated = false;
                                    
                                    try {
                                        const answer = await this.peerConnections[message.user_id].createAnswer();
                                        console.log("Answer created successfully");
                                        answerCreated = true;
                                        
                                        await this.peerConnections[message.user_id].setLocalDescription(answer);
                                        console.log("Local description set from answer");
                                    } catch (answerError) {
                                        console.error("Error creating/setting answer:", answerError);
                                        showToast('error', 'Connection Error', 'Failed to create connection response. Please refresh.');
                                        return;
                                    }
                                    
                                    if (!answerCreated) {
                                        console.error("Answer creation timed out");
                                        showToast('error', 'Connection Timeout', 'Connection setup timed out. Please refresh.');
                                        return;
                                    }
                                    
                                    console.log("Sending answer");
                                    this.websocket.send(JSON.stringify({
                                    type: 'answer',
                                    target: message.user_id,
                                    user_id: userId,
                                    sdp: this.peerConnections[message.user_id].localDescription
                                }));
                            }
                            break;
                            
                        case 'answer':
                            // Received an answer to our offer
                            if (message.target === userId && this.peerConnections[message.user_id]) {
                                await this.peerConnections[message.user_id].setRemoteDescription(new RTCSessionDescription(message.sdp));
                            }
                            break;
                            
                        case 'ice_candidate':
                            // Received ICE candidate
                            if (message.target === userId && this.peerConnections[message.user_id]) {
                                await this.peerConnections[message.user_id].addIceCandidate(new RTCIceCandidate(message.candidate));
                            }
                            break;
                            
                        case 'chat_message':
                            // Received chat message
                            this.chatMessages.push({
                                sender: message.username,
                                content: message.content,
                                timestamp: new Date()
                            });
                            
                            // Play notification sound if not from self
                            if (message.user_id !== userId) {
                                this.playNotificationSound();
                            }
                            break;
                            
                        case 'media_status':
                            // Update media status of a participant
                            if (message.user_id !== userId) {
                                // Update participant's media status
                                if (!this.participantMediaStatus[message.user_id]) {
                                    this.participantMediaStatus[message.user_id] = {};
                                }
                                
                                this.participantMediaStatus[message.user_id].audioEnabled = message.audioEnabled;
                                this.participantMediaStatus[message.user_id].videoEnabled = message.videoEnabled;
                                
                                // Update the participant in the otherParticipants array to refresh the UI
                                const participantIndex = this.otherParticipants.findIndex(p => p.id === message.user_id);
                                if (participantIndex !== -1) {
                                    // Create a new object reference to trigger Alpine.js reactivity
                                    const updatedParticipant = {
                                        ...this.otherParticipants[participantIndex],
                                        audioEnabled: message.audioEnabled,
                                        videoEnabled: message.videoEnabled
                                    };
                                    
                                    // Replace the participant with the updated one
                                    this.otherParticipants.splice(participantIndex, 1, updatedParticipant);
                                }
                                
                                // Play notification sound for mute/unmute
                                if (this.participantMediaStatus[message.user_id].prevAudioEnabled !== undefined && 
                                    this.participantMediaStatus[message.user_id].prevAudioEnabled !== message.audioEnabled) {
                                    this.playNotificationSound();
                                }
                                
                                // Store previous state for future comparisons
                                this.participantMediaStatus[message.user_id].prevAudioEnabled = message.audioEnabled;
                                this.participantMediaStatus[message.user_id].prevVideoEnabled = message.videoEnabled;
                                
                                console.log(`Participant ${message.username} media status updated:`, 
                                    `audio=${message.audioEnabled}, video=${message.videoEnabled}`);
                            }
                            break;
                            
                        case 'session_ended':
                            // Session was ended by the mentor
                            if (message.user_id !== userId) {
                                showToast('info', 'Session Ended', 'The session has been ended by the mentor.');
                                setTimeout(() => {
                                    window.location.href = userRole === 'mentor' ? '/users/dashboard/mentor/' : '/users/dashboard/learner/';
                                }, 3000);
                            }
                            break;
                    }
                } catch (error) {
                    console.error("Error handling signaling message:", error);
                }
            },
            
            // WebSocket close event handler
            onWebSocketClose(event) {
                console.log("WebSocket connection closed:", event);
                
                if (event.code !== 1000) {
                    // Unexpected close
                    this.connectionStatus = "Disconnected";
                    this.connectionStatusClass = "disconnected";
                    
                    showToast('error', 'Connection Lost', 'The connection to the session has been lost. Trying to reconnect...');
                    
                    // Try to reconnect after 5 seconds
                    setTimeout(() => {
                        this.connectWebSocket(roomCode);
                    }, 5000);
                }
            },
            
            // WebSocket error event handler
            onWebSocketError(error) {
                console.error("WebSocket error:", error);
                this.connectionStatus = "Error";
                this.connectionStatusClass = "error";
                
                showToast('error', 'Connection Error', 'An error occurred with the connection. Please try refreshing the page.');
            },
            
            // Create a peer connection for a user
            async createPeerConnection(userId, username) {
                try {
                    // ICE servers configuration with multiple STUN servers for better connectivity
                    const configuration = {
                        iceServers: []
                    };
                    
                    // Add STUN servers (either array or single string)
                    if (iceServers.stunServers && Array.isArray(iceServers.stunServers)) {
                        // Use the array of STUN servers
                        configuration.iceServers.push({ 
                            urls: iceServers.stunServers 
                        });
                        console.log("Using multiple STUN servers:", iceServers.stunServers);
                    } else if (iceServers.stun) {
                        // Backward compatibility for single STUN server
                        configuration.iceServers.push({ 
                            urls: iceServers.stun 
                        });
                        console.log("Using single STUN server:", iceServers.stun);
                    } else {
                        // Fallback to Google's public STUN servers
                        configuration.iceServers.push({ 
                            urls: [
                                'stun:stun.l.google.com:19302',
                                'stun:stun1.l.google.com:19302'
                            ] 
                        });
                        console.log("Using fallback STUN servers");
                    }
                    
                    // Add TURN server if provided (for NAT traversal)
                    if (iceServers.turn) {
                        configuration.iceServers.push({
                            urls: iceServers.turn,
                            username: iceServers.turnUsername,
                            credential: iceServers.turnCredential
                        });
                        console.log("Added TURN server for NAT traversal");
                    }
                    
                    // Create peer connection
                    this.peerConnections[userId] = new RTCPeerConnection(configuration);
                    
                    // Add local stream to peer connection
                    if (this.localStream) {
                        this.localStream.getTracks().forEach(track => {
                            this.peerConnections[userId].addTrack(track, this.localStream);
                        });
                    }
                    
                    // Handle ICE candidates
                    this.peerConnections[userId].onicecandidate = (event) => {
                        if (event.candidate) {
                            this.websocket.send(JSON.stringify({
                                type: 'ice_candidate',
                                target: userId,
                                user_id: window.userId,
                                candidate: event.candidate
                            }));
                        }
                    };
                    
                    // Handle connection state changes
                    this.peerConnections[userId].onconnectionstatechange = (event) => {
                        console.log(`Connection state change for ${username}:`, this.peerConnections[userId].connectionState);
                    };
                    
                    // Handle ICE connection state changes
                    this.peerConnections[userId].oniceconnectionstatechange = (event) => {
                        console.log(`ICE connection state change for ${username}:`, this.peerConnections[userId].iceConnectionState);
                    };
                    
                    // Handle remote stream
                    this.peerConnections[userId].ontrack = (event) => {
                        console.log(`Received remote track from ${username}:`, event.streams[0]);
                        
                        // Check if we have a valid stream
                        if (!event.streams || !event.streams[0]) {
                            console.error(`No stream object in track event from ${username}`);
                            showToast('error', 'Connection Issue', `Problem receiving video from ${username}. Try refreshing.`);
                            return;
                        }
                        
                        const remoteStream = event.streams[0];
                        
                        // Log tracks received
                        console.log(`Remote stream from ${username} has ${remoteStream.getTracks().length} tracks`);
                        remoteStream.getTracks().forEach((track, i) => {
                            console.log(`Remote track ${i} kind: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
                        });
                        
                        // Find or create video element for this user
                        let videoElement = document.getElementById(`video-${userId}`);
                        
                        if (!videoElement) {
                            console.log(`Creating new video element for user ${username} (ID: ${userId})`);
                            
                            videoElement = document.createElement('video');
                            videoElement.id = `video-${userId}`;
                            videoElement.autoplay = true;
                            videoElement.playsInline = true;
                            videoElement.muted = false;
                            videoElement.classList.add('remote-video');
                            
                            // Add video element to DOM
                            const participantsContainer = document.getElementById('participants-videos');
                            if (!participantsContainer) {
                                console.error('Participants container not found');
                                showToast('error', 'UI Error', 'Could not find video container element.');
                                return;
                            }
                            
                            const videoContainer = document.createElement('div');
                            videoContainer.classList.add('participant-tile');
                            videoContainer.id = `video-container-${userId}`;
                            
                            const usernameLabel = document.createElement('div');
                            usernameLabel.classList.add('username-label');
                            usernameLabel.textContent = username;
                            
                            // Add role badge 
                            const roleBadge = document.createElement('div');
                            roleBadge.classList.add('role-badge');
                            roleBadge.textContent = this.getParticipantRole(userId);
                            roleBadge.className = this.getParticipantRole(userId) === 'mentor' ? 
                                'absolute top-2 right-2 px-2 py-1 bg-blue-600 text-white text-xs rounded-full' :
                                'absolute top-2 right-2 px-2 py-1 bg-purple-600 text-white text-xs rounded-full';
                            
                            videoContainer.appendChild(videoElement);
                            videoContainer.appendChild(usernameLabel);
                            videoContainer.appendChild(roleBadge);
                            participantsContainer.appendChild(videoContainer);
                            
                            // Add this user to participants list if not already there
                            if (!this.otherParticipants.find(p => p.id === userId)) {
                                this.otherParticipants.push({
                                    id: userId,
                                    username: username,
                                    role: this.getParticipantRole(userId),
                                    audioEnabled: true,
                                    videoEnabled: true
                                });
                            }
                            
                            console.log(`Added ${username} to participants list:`, this.otherParticipants);
                        } else {
                            console.log(`Using existing video element for user ${username} (ID: ${userId})`);
                        }
                        
                        // Set remote stream
                        try {
                            // Clear any existing srcObject first
                            if (videoElement.srcObject) {
                                try {
                                    videoElement.srcObject.getTracks().forEach(track => track.stop());
                                } catch (e) {
                                    console.warn("Error stopping existing remote tracks", e);
                                }
                                videoElement.srcObject = null;
                            }
                            
                            console.log(`Setting remote stream for ${username} with ${remoteStream.getTracks().length} tracks`);
                            
                            // Set new srcObject with explicit error handling
                            try {
                                videoElement.srcObject = remoteStream;
                                
                                // Also set main video if this is the mentor's stream and local user is a learner
                                // Or if this is any participant and we're the mentor
                                const mainVideoElement = document.getElementById('main-video');
                                const isRemoteUserMentor = this.getParticipantRole(userId) === 'mentor';
                                
                                if (mainVideoElement) {
                                    if ((isRemoteUserMentor && userRole === 'learner') || userRole === 'mentor') {
                                        console.log(`Setting main video to ${username}'s stream (${isRemoteUserMentor ? 'mentor' : 'participant'})`);
                                        
                                        try {
                                            // First stop any existing tracks
                                            if (mainVideoElement.srcObject) {
                                                mainVideoElement.srcObject.getTracks().forEach(track => {
                                                    // Don't stop tracks that belong to our local stream
                                                    if (!this.localStream || !this.localStream.getTracks().includes(track)) {
                                                        track.stop();
                                                    }
                                                });
                                            }
                                            
                                            // Set new stream (clone it to avoid issues)
                                            const clonedStream = new MediaStream();
                                            remoteStream.getTracks().forEach(track => clonedStream.addTrack(track));
                                            mainVideoElement.srcObject = clonedStream;
                                            mainVideoElement.muted = false;
                                            mainVideoElement.play().catch(e => console.warn("Main video autoplay prevented:", e));
                                        } catch (mainErr) {
                                            console.error("Error setting main video:", mainErr);
                                        }
                                    }
                                }
                            } catch (srcErr) {
                                console.error(`Error setting srcObject for ${username}:`, srcErr);
                                showToast('error', 'Video Error', `Could not display ${username}'s video.`);
                            }
                            
                            // Ensure we have the video orientation correctly set
                            videoElement.style.transform = 'scaleX(1)'; // Don't mirror remote video
                            
                            // Add a visible play button overlay for better user interaction
                            const playOverlayId = `play-overlay-${userId}`;
                            let playOverlay = document.getElementById(playOverlayId);
                            
                            if (!playOverlay) {
                                playOverlay = document.createElement('div');
                                playOverlay.id = playOverlayId;
                                playOverlay.classList.add('video-play-overlay');
                                playOverlay.innerHTML = `
                                    <div class="bg-black bg-opacity-50 rounded-full p-3 cursor-pointer">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-white" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                                        </svg>
                                    </div>
                                `;
                                playOverlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; z-index:5;';
                                
                                const videoContainer = videoElement.parentElement;
                                if (videoContainer) {
                                    videoContainer.style.position = 'relative';
                                    videoContainer.appendChild(playOverlay);
                                    
                                    // Function to attempt video playback with better error handling
                                    const attemptPlay = () => {
                                        console.log(`Attempting to play video for ${username}`);
                                        videoElement.muted = false; // Ensure remote video is not muted
                                        
                                        // Try playing with detailed error handling
                                        videoElement.play()
                                            .then(() => {
                                                console.log(`✓ Remote video for ${username} playing successfully`);
                                                // Remove the play overlay once playing
                                                if (playOverlay.parentElement) {
                                                    playOverlay.remove();
                                                }
                                            })
                                            .catch(err => {
                                                console.error(`Error playing remote video for ${username}:`, err);
                                                
                                                // Check if this is an autoplay restriction
                                                if (err.name === 'NotAllowedError') {
                                                    showToast('warning', 'Video Autoplay Blocked', 
                                                              'Your browser blocked autoplay. Click the video to start it.', 5000);
                                                    playOverlay.querySelector('div').classList.add('animate-pulse');
                                                } else {
                                                    showToast('error', 'Video Error', 
                                                             `Could not display ${username}'s video: ${err.message}`, 5000);
                                                }
                                            });
                                    };
                                    
                                    // Add click handler to the overlay for user-initiated playback
                                    playOverlay.addEventListener('click', () => {
                                        attemptPlay();
                                    });
                                    
                                    // Add click handler to the video itself as well
                                    videoElement.addEventListener('click', () => {
                                        attemptPlay();
                                    });
                                    
                                    // Attempt automatic playback first
                                    attemptPlay();
                                    
                                    // Auto-remove overlay after 10 seconds even if not playing
                                    // This improves user experience if the video is actually playing 
                                    // but the play promise failed for some reason
                                    setTimeout(() => {
                                        if (playOverlay.parentElement) {
                                            playOverlay.remove();
                                        }
                                    }, 10000);
                                }
                            }
                            
                            // Update the main video if this is the first remote stream 
                            // or if we don't have a main stream yet
                            if (this.mainStreamUserId !== userId && (!this.mainStream || this.mainStreamUser === userName)) {
                                this.switchMainVideo(userId, username);
                            }
                            
                            // Mark remote participant's video status
                            this.updateParticipantMediaStatus(userId, 'video', true);
                            
                            // Display success message
                            showToast('success', 'User Connected', `${username} has joined the session.`);
                        } catch (err) {
                            console.error(`Error setting remote stream for ${username}:`, err);
                            showToast('error', 'Connection Issue', `Problem displaying ${username}'s video: ${err.message}`);
                        }
                    };
                    
                } catch (error) {
                    console.error(`Error creating peer connection for ${username}:`, error);
                    throw error;
                }
            },
            
            // Request user media (camera and microphone) - Improved implementation
            async requestUserMedia() {
                try {
                    console.log("Requesting access to camera and microphone", {
                        userId: window.USER_ID,
                        userRole: window.USER_ROLE,
                        roomCode: window.ROOM_CODE
                    });
                    
                    // Create camera access prompt message with more information
                    showToast('info', 'Camera Access', 'PeerLearn needs access to your camera and microphone for this session. Please click "Allow" when prompted by your browser.', 7000);
                    
                    // Add camera permission button to help with permission prompting
                    const cameraButton = document.createElement('button');
                    cameraButton.id = 'camera-permission-button';
                    cameraButton.className = 'fixed bottom-4 left-4 px-4 py-2 bg-blue-600 text-white rounded-lg z-50 shadow-lg flex items-center';
                    cameraButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            <path d="M14 6a2 2 0 00-2 2v4a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2h-4z" />
                        </svg>
                        Enable Camera & Mic
                    `;
                    
                    // Only add if not already present
                    if (!document.getElementById('camera-permission-button')) {
                        document.body.appendChild(cameraButton);
                        cameraButton.addEventListener('click', async () => {
                            try {
                                await navigator.mediaDevices.getUserMedia({video: true, audio: true});
                                showToast('success', 'Permissions Granted', 'Camera and microphone access granted!', 3000);
                                cameraButton.remove();
                            } catch (err) {
                                showToast('error', 'Permission Error', 'Could not access camera/microphone. Check browser permissions.', 5000);
                            }
                        });
                        
                        // Remove after 15 seconds
                        setTimeout(() => {
                            if (document.getElementById('camera-permission-button')) {
                                document.getElementById('camera-permission-button').remove();
                            }
                        }, 15000);
                    }
                    
                    // Debug permissions
                    try {
                        const permStatus = await navigator.permissions.query({name: 'camera'});
                        console.log("Camera permission status:", permStatus.state);
                        
                        permStatus.onchange = function() {
                            console.log("Camera permission changed to:", this.state);
                            if (this.state === 'granted') {
                                showToast('success', 'Camera Access', 'Camera access granted!', 3000);
                            }
                        };
                    } catch (err) {
                        console.log("Permission API not supported:", err);
                    }
                    
                    // First check if getUserMedia is supported
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        console.error("getUserMedia is not supported in this browser");
                        showToast('error', 'Browser Not Supported', 'Your browser does not support camera access. Please try a modern browser like Chrome, Firefox, or Safari.');
                        // Continue with audio-only as fallback
                        showToast('info', 'Audio Only Mode', 'Continuing with audio-only mode due to camera limitations.');
                        return false;
                    }
                    
                    // Check if browser is secure context (required for modern browsers)
                    if (!window.isSecureContext) {
                        console.warn("Not in secure context - getUserMedia might not work");
                        showToast('warning', 'Security Warning', 'Your browser may block camera access because this site isn\'t using HTTPS. Try connecting via HTTPS for better compatibility.');
                    }
                    
                    // Get list of available devices first to check if we have cameras/mics
                    let devices = [];
                    try {
                        devices = await navigator.mediaDevices.enumerateDevices();
                        const hasCamera = devices.some(device => device.kind === 'videoinput');
                        const hasMic = devices.some(device => device.kind === 'audioinput');
                        
                        console.log(`Available devices - Camera: ${hasCamera}, Microphone: ${hasMic}`);
                        
                        if (!hasCamera && !hasMic) {
                            showToast('error', 'No Media Devices', 'No camera or microphone found. Please check your device connections.');
                            return false;
                        }
                        
                        if (!hasCamera) {
                            showToast('warning', 'No Camera', 'No camera detected. Session will continue with audio only.');
                        }
                        
                        if (!hasMic) {
                            showToast('warning', 'No Microphone', 'No microphone detected. You won\'t be able to speak in the session.');
                        }
                    } catch (enumError) {
                        console.warn("Could not enumerate devices:", enumError);
                        // Continue anyway, getUserMedia will give more specific errors
                    }
                    
                    // Try multiple fallbacks in case of issues - start with more robust constraints
                    let stream = null;
                    
                    // Enhanced fallback options based on device and best practices
                    // Check if we're on mobile for device-specific optimizations
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    const isLowEndDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
                    
                    console.log(`Device info - Mobile: ${isMobile}, Low-end: ${isLowEndDevice}, Cores: ${navigator.hardwareConcurrency || 'unknown'}`);
                    
                    const fallbackOptions = [
                        // Option 1: Optimized constraints based on device capability
                        {
                            audio: {
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true
                            },
                            video: isMobile ? {
                                // Mobile-optimized video (lower resolution, lower framerate)
                                width: { ideal: 480 },
                                height: { ideal: 360 },
                                frameRate: { max: 15 },
                                facingMode: 'user'
                            } : {
                                // Desktop-optimized video
                                width: { ideal: 640 },
                                height: { ideal: 480 },
                                frameRate: { ideal: 24 }
                            }
                        },
                        
                        // Option 2: Basic video/audio (most compatible)
                        {
                            audio: true,
                            video: true
                        },
                        
                        // Option 3: Reduced quality for compatibility
                        {
                            audio: true,
                            video: {
                                width: { ideal: 320 },
                                height: { ideal: 240 },
                                frameRate: { ideal: 10 }
                            }
                        },
                        
                        // Option 4: HD only for high-end devices
                        {
                            audio: true,
                            video: (!isMobile && !isLowEndDevice) ? {
                                width: { ideal: 1280 },
                                height: { ideal: 720 },
                                facingMode: 'user'
                            } : true
                        },
                        
                        // Option 5: Audio only with video placeholder (last resort)
                        {
                            audio: true,
                            video: false
                        }
                    ];
                    
                    // Try each option until one works
                    let lastError = null;
                    for (let i = 0; i < fallbackOptions.length; i++) {
                        try {
                            console.log(`Trying media constraints option ${i+1}:`, fallbackOptions[i]);
                            
                            // Add a timeout for getUserMedia to prevent hanging
                            const mediaPromise = navigator.mediaDevices.getUserMedia(fallbackOptions[i]);
                            
                            // Wait for the media with a generous timeout
                            stream = await Promise.race([
                                mediaPromise,
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Media access timeout')), 10000)
                                )
                            ]);
                            
                            console.log(`Successfully obtained media stream with option ${i+1}`);
                            
                            // If we got here, we have a working stream
                            this.localStream = stream;
                            
                            // Check if we actually got video tracks
                            const hasVideoTracks = stream.getVideoTracks().length > 0;
                            this.videoEnabled = hasVideoTracks;
                            
                            if (!hasVideoTracks && fallbackOptions[i].video !== false) {
                                console.warn("No video tracks in stream despite requesting video");
                                showToast('warning', 'Video Unavailable', 'Could not access your camera. Continuing with audio only.');
                            }
                            
                            // Set up local video element if we have video
                            if (hasVideoTracks) {
                                console.log("Setting up local video with video tracks");
                                const localVideoElement = document.getElementById('local-video');
                                
                                if (!localVideoElement) {
                                    console.error("Local video element not found in DOM");
                                    showToast('error', 'Video Element Missing', 'Could not find video element on page. Please refresh the page.');
                                } else {
                                    console.log("Setting srcObject on local video element");
                                    
                                    try {
                                        // Clear any existing srcObject first
                                        if (localVideoElement.srcObject) {
                                            try {
                                                localVideoElement.srcObject.getTracks().forEach(track => track.stop());
                                            } catch (e) {
                                                console.warn("Error stopping existing tracks", e);
                                            }
                                            localVideoElement.srcObject = null;
                                        }
                                        
                                        // Set new srcObject with explicit error handling
                                        try {
                                            localVideoElement.srcObject = stream;
                                            console.log("Successfully set local video srcObject");
                                            
                                            // Explicitly play the video to handle autoplay issues
                                            const playPromise = localVideoElement.play();
                                            if (playPromise !== undefined) {
                                                playPromise.catch(err => {
                                                    console.warn("Auto-play prevented for local video:", err);
                                                    // Add a manual play button overlay
                                                    this.addPlayButtonOverlay();
                                                });
                                            }
                                        } catch (srcError) {
                                            console.error("Error setting srcObject on local video:", srcError);
                                            showToast('error', 'Video Error', 'Could not display video. Please refresh and try again.');
                                        }
                                        
                                        // Set main stream to the local stream initially (for display in the main video area)
                                        this.mainStream = stream;
                                        
                                        // Also try to set the main video, which might help with some browser issues
                                        const mainVideoElement = document.getElementById('main-video');
                                        if (mainVideoElement && userRole === 'learner') {
                                            try {
                                                // For learners, show their own video in main area temporarily
                                                // until the mentor connects
                                                mainVideoElement.muted = true;  // Important for self-view
                                                mainVideoElement.srcObject = new MediaStream(stream.getTracks());
                                                mainVideoElement.play().catch(() => console.log("Could not autoplay main video"));
                                            } catch (e) {
                                                console.warn("Could not set main video for learner:", e);
                                            }
                                        }
                                        
                                        // Explicitly log video tracks
                                        const videoTracks = stream.getVideoTracks();
                                        console.log(`Video tracks (${videoTracks.length}):`, videoTracks);
                                        videoTracks.forEach((track, i) => {
                                            console.log(`Track ${i} enabled:`, track.enabled, "readyState:", track.readyState);
                                            
                                            // Add track listener for when it ends
                                            track.onended = () => {
                                                console.warn(`Video track ${i} ended`);
                                                showToast('warning', 'Camera Disconnected', 'Your camera has been disconnected. Please refresh the page to reconnect.');
                                            };
                                        });
                                        
                                        // Auto-play the video when metadata is loaded
                                        localVideoElement.onloadedmetadata = () => {
                                            console.log("Local video metadata loaded, attempting to play");
                                            
                                            // Force autoplay even if browser has restrictions
                                            localVideoElement.muted = true; // Mute to help with autoplay
                                            
                                            // Try playing the video
                                            const playPromise = localVideoElement.play();
                                            
                                            if (playPromise !== undefined) {
                                                playPromise.then(() => {
                                                    console.log("Local video playback started successfully");
                                                    
                                                    // Set main video source too
                                                    const mainVideoElement = document.getElementById('main-video');
                                                    if (mainVideoElement) {
                                                        if (mainVideoElement.srcObject) {
                                                            console.log("Main video already has srcObject, not replacing");
                                                        } else {
                                                            console.log("Setting main video srcObject");
                                                            mainVideoElement.srcObject = stream;
                                                            mainVideoElement.play().catch(e => {
                                                                console.error("Error playing main video:", e);
                                                                showToast('warning', 'Video Display Issue', 'Could not display video. Try clicking the video area.');
                                                            });
                                                        }
                                                    } else {
                                                        console.error("Main video element not found");
                                                    }
                                                    
                                                    // Make videos visible
                                                    document.querySelectorAll('.video-container').forEach(container => {
                                                        container.style.visibility = 'visible';
                                                    });
                                                    
                                                }).catch(e => {
                                                    console.error("Error auto-playing local video:", e);
                                                    
                                                    // Try again with user interaction
                                                    showToast('warning', 'Camera Permission Required', 'Click anywhere on the screen to enable your camera view.');
                                                    
                                                    // Create very visible click prompt
                                                    const clickPrompt = document.createElement('div');
                                                    clickPrompt.className = 'click-to-enable-video';
                                                    clickPrompt.innerHTML = `
                                                        <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50 cursor-pointer">
                                                            <div class="text-white text-center p-4">
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                                <h3 class="text-xl font-bold mb-2">Click to Enable Camera</h3>
                                                                <p>Your browser requires an interaction before enabling video</p>
                                                            </div>
                                                        </div>
                                                    `;
                                                    
                                                    // Add click prompt to page and set up click handler
                                                    document.body.appendChild(clickPrompt);
                                                    
                                                    document.addEventListener('click', () => {
                                                        // Try playing the video again
                                                        localVideoElement.play()
                                                            .then(() => {
                                                                console.log("Local video playback started after user interaction");
                                                                clickPrompt.remove();
                                                                
                                                                // Also play main video
                                                                const mainVideoElement = document.getElementById('main-video');
                                                                if (mainVideoElement && !mainVideoElement.playing) {
                                                                    mainVideoElement.play().catch(e => console.error("Error playing main video after click:", e));
                                                                }
                                                            })
                                                            .catch(e => {
                                                                console.error("Error playing video after click:", e);
                                                                showToast('error', 'Video Playback Failed', 'Could not start your camera. Please check your browser permissions and try again.');
                                                            });
                                                    }, {once: true});
                                                });
                                            }
                                        };
                                        
                                        // Add error handler for the video element
                                        localVideoElement.onerror = (e) => {
                                            console.error("Local video element error:", e);
                                            showToast('error', 'Video Error', 'An error occurred with your camera feed. Please refresh the page.');
                                        };
                                    } catch (err) {
                                        console.error("Error setting srcObject on video element:", err);
                                        showToast('error', 'Video Setup Error', `Could not set up video: ${err.message}`);
                                    }
                                }
                            } else {
                                console.warn("No video tracks available, setting up audio-only mode");
                                showToast('info', 'Audio Only Mode', 'Continuing with audio-only communication.');
                            }
                            
                            // Update UI video status
                            this.updateVideoStatus();
                            
                            // Successfully got media - return true
                            return true;
                        } catch (error) {
                            lastError = error;
                            console.warn(`Failed with option ${i+1}:`, error.name, error.message);
                            
                            // Log full error details
                            console.error('Detailed error:', error);
                            
                            // If this is a permission error, no need to try other options
                            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                                showToast('error', 'Camera Permission Denied', 'You must allow camera and microphone access to join the session. Please check your browser settings and try again.');
                                throw error;
                            }
                            
                            // If this is a device not found error, try audio only
                            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                                if (i < fallbackOptions.length - 1 && fallbackOptions[i+1].video === false) {
                                    console.log("No camera found, will try audio-only next");
                                    showToast('warning', 'Camera Not Found', 'No camera detected. Trying audio-only mode.');
                                    continue;
                                }
                            }
                        }
                    }
                    
                    // If we couldn't get a stream with any options
                    if (!this.localStream) {
                        console.error("Failed to get user media with all options");
                        
                        // Create a fallback audio-only stream as last resort
                        try {
                            console.log("Attempting audio-only fallback");
                            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                            this.videoEnabled = false;
                            
                            showToast('warning', 'Audio Only Mode', 'Using audio-only mode due to camera issues.');
                            
                            // Update UI
                            this.updateVideoStatus();
                            return true;
                        } catch (finalError) {
                            console.error("Final audio-only fallback also failed:", finalError);
                            showToast('error', 'Connection Failed', 'Could not access microphone or camera. Please check your device permissions in browser settings.');
                            
                            const errorMessage = lastError ? `${lastError.name}: ${lastError.message}` : "Unknown error";
                            console.error("All getUserMedia options failed:", errorMessage);
                            return false;
                        }
                    }
                    
                    // Log tracks for debugging
                    const videoTracks = this.localStream.getVideoTracks();
                    const audioTracks = this.localStream.getAudioTracks();
                    console.log(`Got media stream with ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
                    
                    if (videoTracks.length > 0) {
                        console.log("Video track:", videoTracks[0].label, "enabled:", videoTracks[0].enabled);
                        
                        // Add track event listener to detect if track ends unexpectedly
                        videoTracks[0].addEventListener('ended', () => {
                            console.warn("Video track ended unexpectedly");
                            this.videoEnabled = false;
                            showToast('warning', 'Camera Disconnected', 'Your camera was disconnected. Please check your device and refresh.');
                            
                            // Show placeholder since video is no longer available
                            const placeholderElements = document.querySelectorAll('.video-placeholder');
                            placeholderElements.forEach(el => el.classList.remove('hidden'));
                        });
                        
                    } else {
                        // If no video tracks but we're in a video call, create a placeholder
                        console.log("No video tracks available, using placeholder");
                        this.videoEnabled = false;
                        
                        // Show placeholder image/message in UI (more comprehensive selection)
                        const placeholderElements = document.querySelectorAll('.video-placeholder');
                        placeholderElements.forEach(el => el.classList.remove('hidden'));
                    }
                    
                    // Helper function to safely set up video elements
                    const setupVideoElement = (element, stream, isMuted = false, name = 'Video') => {
                        if (!element) {
                            console.warn(`${name} element not found!`);
                            return false;
                        }
                        
                        console.log(`Setting ${name.toLowerCase()} source`);
                        
                        try {
                            // First stop any existing streams
                            if (element.srcObject) {
                                const existingStream = element.srcObject;
                                const tracks = existingStream.getTracks();
                                tracks.forEach(track => track.stop());
                            }
                            
                            // Set the new stream
                            element.srcObject = stream;
                            
                            // Mute if needed (to prevent echo)
                            element.muted = isMuted;
                            
                            // Ensure proper playback of video
                            element.onloadedmetadata = () => {
                                console.log(`${name} metadata loaded, attempting playback`);
                                
                                // Use promise to handle autoplay restrictions
                                const playPromise = element.play();
                                
                                if (playPromise !== undefined) {
                                    playPromise
                                        .then(() => {
                                            console.log(`${name} playing successfully`);
                                        })
                                        .catch(error => {
                                            console.error(`Error playing ${name.toLowerCase()}:`, error);
                                            
                                            // Handle autoplay restrictions
                                            if (error.name === 'NotAllowedError') {
                                                console.warn(`Autoplay prevented for ${name.toLowerCase()}`);
                                                
                                                // Create play button overlay if needed
                                                const container = element.parentElement;
                                                if (container) {
                                                    const playButton = document.createElement('button');
                                                    playButton.className = 'play-video-button absolute inset-0 w-full h-full flex items-center justify-center bg-black bg-opacity-50 z-10';
                                                    playButton.innerHTML = `
                                                        <svg class="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                                                        </svg>
                                                    `;
                                                    playButton.onclick = () => {
                                                        element.play()
                                                            .then(() => {
                                                                playButton.remove();
                                                            })
                                                            .catch(e => console.error(`Error playing ${name.toLowerCase()} on click:`, e));
                                                    };
                                                    container.appendChild(playButton);
                                                }
                                            }
                                        });
                                }
                            };
                            
                            // Handle errors
                            element.onerror = (e) => {
                                console.error(`${name} element error:`, e);
                            };
                            
                            return true;
                        } catch (error) {
                            console.error(`Error setting up ${name.toLowerCase()} element:`, error);
                            return false;
                        }
                    };
                    
                    // Set local video
                    const localVideo = document.getElementById('local-video');
                    setupVideoElement(localVideo, this.localStream, true, 'Local video');
                    
                    // Set main stream (initially local stream)
                    this.mainStream = this.localStream;
                    const mainVideo = this.$refs.mainVideo;
                    setupVideoElement(mainVideo, this.mainStream, true, 'Main video');
                    
                    // Update peer connections with the new media stream
                    this.updatePeerConnections();
                    
                    console.log("Local media stream acquired and set up successfully");
                    return true;
                } catch (error) {
                    console.error("Error requesting user media:", error);
                    
                    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                        showToast('error', 'Permission Denied', 'You need to grant camera and microphone permissions to join the session. Please check your browser settings and try again.');
                    } else if (error.name === 'NotFoundError') {
                        showToast('error', 'Device Not Found', 'Camera or microphone not found. Please check your device connections and try again.');
                    } else if (error.name === 'NotReadableError' || error.name === 'AbortError') {
                        showToast('error', 'Device In Use', 'Camera or microphone is already in use by another application or not accessible.');
                    } else if (error.name === 'OverconstrainedError') {
                        showToast('error', 'Device Constraints Error', 'Your camera does not support the required resolution. Try with different settings.');
                    } else {
                        showToast('error', 'Media Error', `Could not access media devices: ${error.message}`);
                    }
                    
                    return false;
                }
            },
            
            // Update peer connections with current media stream
            updatePeerConnections() {
                console.log("Updating peer connections with media stream");
                if (!this.localStream) {
                    console.warn("No local stream available to add to peer connections");
                    return;
                }
                
                for (const id in this.peerConnections) {
                    const connection = this.peerConnections[id];
                    console.log(`Updating peer connection for user ${id}`);
                    
                    // Remove existing tracks
                    const senders = connection.getSenders();
                    senders.forEach(sender => {
                        if (sender.track) {
                            console.log(`Removing existing ${sender.track.kind} track`);
                            connection.removeTrack(sender);
                        }
                    });
                    
                    // Add new tracks
                    this.localStream.getTracks().forEach(track => {
                        console.log(`Adding ${track.kind} track to peer connection`);
                        connection.addTrack(track, this.localStream);
                    });
                    
                    // Create new offer if we're the mentor or the initiator
                    if (userRole === 'mentor') {
                        console.log("Creating new offer after track update");
                        connection.createOffer()
                            .then(offer => connection.setLocalDescription(offer))
                            .then(() => {
                                // Send the offer via WebSocket
                                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                                    this.websocket.send(JSON.stringify({
                                        type: 'offer',
                                        user_id: userId,
                                        recipient_id: id,
                                        sdp: connection.localDescription
                                    }));
                                }
                            })
                            .catch(error => console.error("Error creating offer:", error));
                    }
                }
            },
            
            // Toggle audio mute
            toggleAudio() {
                console.log("Toggle audio called, current state:", this.audioEnabled);
                
                // Toggle audio state
                this.audioEnabled = !this.audioEnabled;
                console.log("New audio state:", this.audioEnabled);
                
                if (this.localStream) {
                    const audioTracks = this.localStream.getAudioTracks();
                    console.log(`Local stream has ${audioTracks.length} audio tracks`);
                    
                    if (audioTracks.length > 0) {
                        // Update track enabled state
                        audioTracks.forEach(track => {
                            console.log(`Setting audio track "${track.label}" enabled:`, this.audioEnabled);
                            track.enabled = this.audioEnabled;
                        });
                        
                        // Play a notification sound when unmuting
                        if (this.audioEnabled) {
                            this.playNotificationSound();
                        }
                        
                        // Show UI feedback using our dedicated method
                        this.updateAudioStatus();
                        
                        // Also update the legacy UI elements if they exist
                        const audioToggleBtn = document.getElementById('toggle-audio-btn');
                        if (audioToggleBtn) {
                            const iconElement = audioToggleBtn.querySelector('svg');
                            if (iconElement) {
                                // Update icon classes based on audio state
                                if (this.audioEnabled) {
                                    iconElement.classList.remove('text-red-500');
                                    iconElement.classList.add('text-green-500');
                                } else {
                                    iconElement.classList.remove('text-green-500');
                                    iconElement.classList.add('text-red-500');
                                }
                            }
                        }
                    } else {
                        console.warn("No audio tracks available to toggle");
                        // Try to request microphone if we're turning on but have no tracks
                        if (this.audioEnabled) {
                            console.log("Attempting to request microphone access");
                            navigator.mediaDevices.getUserMedia({ audio: true })
                                .then(audioStream => {
                                    const audioTrack = audioStream.getAudioTracks()[0];
                                    if (audioTrack) {
                                        console.log("New audio track acquired:", audioTrack.label);
                                        
                                        // Add to existing stream or create new stream
                                        if (this.localStream) {
                                            const videoTrack = this.localStream.getVideoTracks()[0];
                                            
                                            // Create a new stream with both tracks
                                            const newStream = new MediaStream();
                                            newStream.addTrack(audioTrack);
                                            if (videoTrack) newStream.addTrack(videoTrack);
                                            
                                            // Replace the local stream
                                            this.localStream = newStream;
                                            
                                            // Update video elements
                                            const localVideo = document.getElementById('local-video');
                                            if (localVideo) {
                                                localVideo.srcObject = this.localStream;
                                            }
                                            
                                            // Update peer connections
                                            this.updatePeerConnections();
                                        }
                                    }
                                })
                                .catch(error => {
                                    console.error("Failed to get audio stream after toggle:", error);
                                    this.audioEnabled = false; // Revert state on failure
                                    showToast('error', 'Microphone Error', 'Could not access your microphone. Please check your device settings.');
                                });
                        }
                    }
                } else {
                    console.warn("No local stream available for audio toggle");
                }
                
                // Call our dedicated method to update audio UI and notify peers
                this.updateAudioStatus();
            },
            
            // Get participant role (mentor/learner) based on userId
            getParticipantRole(userId) {
                // Find role based on userId in the known participants
                const existingParticipant = this.otherParticipants.find(p => p.id === userId);
                if (existingParticipant && existingParticipant.role) {
                    return existingParticipant.role;
                }
                
                // Default to opposite of current user role if we can't determine
                const currentUserRole = window.USER_ROLE || userRole; // Fallback to userRole if window.USER_ROLE not defined
                if (currentUserRole === 'mentor') {
                    return 'learner';
                } else {
                    return 'mentor';
                }
            },
            
            // Update participant media status (video/audio)
            updateParticipantMediaStatus(userId, mediaType, enabled) {
                const participantIndex = this.otherParticipants.findIndex(p => p.id === userId);
                if (participantIndex !== -1) {
                    if (mediaType === 'video') {
                        this.otherParticipants[participantIndex].videoEnabled = enabled;
                    } else if (mediaType === 'audio') {
                        this.otherParticipants[participantIndex].audioEnabled = enabled;
                    }
                }
            },
            
            // Switch the main video display to a different user
            switchMainVideo(userId, username) {
                console.log(`Switching main video to user ${username} (ID: ${userId})`);
                
                // Store the user ID of the main stream
                this.mainStreamUserId = userId;
                
                const videoElement = document.getElementById(`video-${userId}`);
                if (videoElement && videoElement.srcObject) {
                    const mainVideo = document.getElementById('main-video');
                    if (mainVideo) {
                        // Update main video source
                        this.mainStream = videoElement.srcObject;
                        this.mainStreamUser = username;
                        mainVideo.srcObject = videoElement.srcObject;
                        
                        // Set the remote user role for styling
                        this.remoteUserRole = this.getParticipantRole(userId);
                        
                        // Add zoom effect class for mentor (only if it's not the local user)
                        const localUserId = window.USER_ID || userId; // Fallback to userId if USER_ID not defined
                        if (this.remoteUserRole === 'mentor' && userId !== localUserId) {
                            mainVideo.classList.add('mentor-video');
                            mainVideo.classList.remove('learner-video');
                        } else {
                            mainVideo.classList.add('learner-video');
                            mainVideo.classList.remove('mentor-video');
                        }
                        
                        // Play with error handling
                        mainVideo.play().catch(e => {
                            console.error("Error playing main video after switch:", e);
                            showToast('warning', 'Video Display Issue', 'Click to enable main video view');
                            
                            // Add click handler for user interaction
                            document.addEventListener('click', () => {
                                mainVideo.play().catch(e => console.error("Error playing main video after click:", e));
                            }, {once: true});
                        });
                    } else {
                        console.error("Main video element not found when switching");
                    }
                } else {
                    console.error(`Video element for ${username} not found or has no stream`);
                }
            },
            
            // Update the UI to reflect video status
            updateVideoStatus() {
                console.log("Updating video status UI, video enabled:", this.videoEnabled);
                
                // Update video controls UI based on current state
                const videoControlButton = document.getElementById('video-control');
                if (videoControlButton) {
                    if (this.videoEnabled) {
                        videoControlButton.classList.remove('active');
                        videoControlButton.title = 'Turn off camera';
                    } else {
                        videoControlButton.classList.add('active');
                        videoControlButton.title = 'Turn on camera';
                    }
                }
                
                // Update local video container UI
                const localVideoContainer = document.querySelector('.local-video-container');
                if (localVideoContainer) {
                    if (this.videoEnabled) {
                        localVideoContainer.classList.remove('video-disabled');
                    } else {
                        localVideoContainer.classList.add('video-disabled');
                    }
                }
                
                // Notify other participants about media status change
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    console.log("Sending media status update to peers due to video change");
                    this.websocket.send(JSON.stringify({
                        type: 'media_status',
                        user_id: userId,
                        username: userName,
                        audioEnabled: this.audioEnabled,
                        videoEnabled: this.videoEnabled
                    }));
                }
            },
            
            // Update the UI to reflect audio status
            updateAudioStatus() {
                console.log("Updating audio status UI, audio enabled:", this.audioEnabled);
                
                // Update audio controls UI based on current state
                const audioControlButton = document.getElementById('audio-control');
                if (audioControlButton) {
                    if (this.audioEnabled) {
                        audioControlButton.classList.remove('active');
                        audioControlButton.title = 'Mute microphone';
                    } else {
                        audioControlButton.classList.add('active');
                        audioControlButton.title = 'Unmute microphone';
                    }
                }
                
                // Notify other participants about media status change
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    console.log("Sending media status update to peers due to audio change");
                    this.websocket.send(JSON.stringify({
                        type: 'media_status',
                        user_id: userId,
                        username: userName,
                        audioEnabled: this.audioEnabled,
                        videoEnabled: this.videoEnabled
                    }));
                }
            },
            
            // Toggle video
            toggleVideo() {
                console.log("Toggle video called, current state:", this.videoEnabled);
                
                // Toggle video state
                this.videoEnabled = !this.videoEnabled;
                console.log("New video state:", this.videoEnabled);
                
                if (this.localStream) {
                    const videoTracks = this.localStream.getVideoTracks();
                    console.log(`Local stream has ${videoTracks.length} video tracks`);
                    
                    if (videoTracks.length > 0) {
                        // Update track enabled state
                        videoTracks.forEach(track => {
                            console.log(`Setting video track "${track.label}" enabled:`, this.videoEnabled);
                            track.enabled = this.videoEnabled;
                        });
                    } else if (!this.videoEnabled) {
                        console.log("No video tracks available but trying to disable video - need to show placeholder");
                        // Continue to show placeholder even without tracks
                    } else {
                        console.log("No video tracks available and trying to enable video");
                        // Might need to request camera again if user toggled on after denying
                        if (this.videoEnabled) {
                            console.log("Attempting to request camera access again");
                            navigator.mediaDevices.getUserMedia({ video: true })
                                .then(videoStream => {
                                    const videoTrack = videoStream.getVideoTracks()[0];
                                    if (videoTrack) {
                                        console.log("New video track acquired:", videoTrack.label);
                                        
                                        // Replace audio track with the new one
                                        const audioTrack = this.localStream.getAudioTracks()[0];
                                        
                                        // Create a new stream with both tracks
                                        const newStream = new MediaStream();
                                        if (audioTrack) newStream.addTrack(audioTrack);
                                        newStream.addTrack(videoTrack);
                                        
                                        // Replace the local stream
                                        this.localStream = newStream;
                                        
                                        // Update video elements
                                        const localVideo = document.getElementById('local-video');
                                        if (localVideo) {
                                            localVideo.srcObject = this.localStream;
                                        }
                                        
                                        // Update peer connections
                                        this.updatePeerConnections();
                                    }
                                })
                                .catch(error => {
                                    console.error("Failed to get video stream after toggle:", error);
                                    this.videoEnabled = false; // Revert state on failure
                                    showToast('error', 'Camera Error', 'Could not access your camera. Please check your device settings.');
                                });
                        }
                    }
                    
                    // Show/hide placeholder based on video state
                    const localVideo = document.getElementById('local-video');
                    const localVideoContainer = localVideo?.parentElement;
                    
                    if (localVideoContainer) {
                        // Find or create video placeholder
                        let placeholder = localVideoContainer.querySelector('.video-placeholder');
                        
                        if (!this.videoEnabled) {
                            // If video is disabled and no placeholder exists, create one
                            if (!placeholder) {
                                console.log("Creating video placeholder");
                                placeholder = document.createElement('div');
                                placeholder.classList.add('video-placeholder', 'absolute', 'inset-0', 'flex', 'flex-col', 'items-center', 'justify-center', 'bg-gray-800', 'bg-opacity-80', 'text-white', 'z-10');
                                
                                const icon = document.createElement('div');
                                icon.classList.add('flex', 'flex-col', 'items-center', 'justify-center');
                                icon.innerHTML = `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                    </svg>
                                    <span>Camera Off</span>
                                `;
                                placeholder.appendChild(icon);
                                localVideoContainer.appendChild(placeholder);
                            }
                            placeholder.style.display = 'flex';
                        } else if (placeholder) {
                            // If video is enabled, hide the placeholder
                            console.log("Hiding video placeholder");
                            placeholder.style.display = 'none';
                        }
                    }
                } else {
                    console.warn("No local stream available for video toggle");
                    // Attempt to get user media if stream is missing
                    if (this.videoEnabled) {
                        this.requestUserMedia()
                            .then(success => {
                                console.log("Media requested successfully:", success);
                            })
                            .catch(error => {
                                console.error("Failed to get media after toggle:", error);
                                this.videoEnabled = false; // Revert state on failure
                            });
                    }
                }
                
                // Call our dedicated method to update video UI and notify peers
                this.updateVideoStatus();
            },
            
            // Toggle screen sharing
            async toggleScreenShare() {
                if (this.isScreenSharing) {
                    // Stop screen sharing
                    if (this.screenStream) {
                        this.screenStream.getTracks().forEach(track => {
                            track.stop();
                        });
                        this.screenStream = null;
                    }
                    
                    // Switch main view back to camera
                    this.mainStream = this.localStream;
                    this.mainStreamUser = userName;
                    
                    if (this.$refs.mainVideo) {
                        this.$refs.mainVideo.srcObject = this.mainStream;
                        this.$refs.mainVideo.muted = true;
                    }
                    
                    // Update status
                    this.isScreenSharing = false;
                    
                    // Notify other participants
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        this.websocket.send(JSON.stringify({
                            type: 'screen_share_stopped',
                            user_id: userId
                        }));
                    }
                } else {
                    try {
                        // Start screen sharing
                        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                            video: {
                                cursor: "always"
                            },
                            audio: false
                        });
                        
                        // Switch main view to screen share
                        this.mainStream = this.screenStream;
                        this.mainStreamUser = `${userName}'s screen`;
                        
                        if (this.$refs.mainVideo) {
                            this.$refs.mainVideo.srcObject = this.mainStream;
                            this.$refs.mainVideo.muted = true;
                        }
                        
                        // Update status
                        this.isScreenSharing = true;
                        
                        // Handle the end of screen sharing
                        this.screenStream.getVideoTracks()[0].onended = () => {
                            this.toggleScreenShare();
                        };
                        
                        // Add screen share track to all peer connections
                        Object.keys(this.peerConnections).forEach(async (peerId) => {
                            this.screenStream.getTracks().forEach(track => {
                                this.peerConnections[peerId].addTrack(track, this.screenStream);
                            });
                        });
                        
                        // Notify other participants
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            this.websocket.send(JSON.stringify({
                                type: 'screen_share_started',
                                user_id: userId
                            }));
                        }
                    } catch (error) {
                        console.error("Error starting screen share:", error);
                        
                        if (error.name === 'NotAllowedError') {
                            showToast('info', 'Screen Share Cancelled', 'You cancelled screen sharing.');
                        } else {
                            showToast('error', 'Screen Share Error', 'Could not start screen sharing. Please try again.');
                        }
                    }
                }
            },
            
            // Send chat message
            sendChatMessage() {
                if (this.newMessage.trim() === '') return;
                
                // Send via WebSocket
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(JSON.stringify({
                        type: 'chat_message',
                        user_id: userId,
                        username: userName,
                        content: this.newMessage.trim()
                    }));
                    
                    // Add to local chat
                    this.chatMessages.push({
                        sender: userName,
                        content: this.newMessage.trim(),
                        timestamp: new Date()
                    });
                    
                    // Clear input
                    this.newMessage = '';
                } else {
                    showToast('error', 'Connection Error', 'Could not send message. Please check your connection.');
                }
            },
            
            // End session (for mentors only)
            endSession() {
                if (userRole !== 'mentor') return;
                
                if (confirm('Are you sure you want to end this session for all participants?')) {
                    // Send end session message
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        this.websocket.send(JSON.stringify({
                            type: 'session_ended',
                            user_id: userId,
                            username: userName
                        }));
                    }
                    
                    // Update session status
                    this.updateSessionStatus('completed');
                    
                    // Navigate to dashboard
                    setTimeout(() => {
                        window.location.href = '/users/dashboard/mentor/';
                    }, 1000);
                }
            },
            
            // Update session status
            updateSessionStatus(status) {
                // Only mentors can update session status
                if (userRole !== 'mentor') return;
                
                // Send AJAX request to update session status
                fetch(`/sessions/${roomCode}/update-status/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify({
                        status: status
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        this.sessionStatus = status;
                        console.log(`Session status updated to: ${status}`);
                    } else {
                        console.error('Failed to update session status:', data.error);
                    }
                })
                .catch(error => {
                    console.error('Error updating session status:', error);
                });
            },
            
            // Update session timer
            updateSessionTimer() {
                if (!this.sessionStartTime) {
                    this.sessionStartTime = new Date();
                }
                
                const now = new Date();
                const elapsed = Math.floor((now - this.sessionStartTime) / 1000);
                
                const hours = Math.floor(elapsed / 3600);
                const minutes = Math.floor((elapsed % 3600) / 60);
                const seconds = elapsed % 60;
                
                this.sessionTimer = [
                    hours.toString().padStart(2, '0'),
                    minutes.toString().padStart(2, '0'),
                    seconds.toString().padStart(2, '0')
                ].join(':');
                
                // Warn 5 minutes before session ends
                const remaining = this.sessionDuration * 60 - elapsed;
                if (remaining === 300) { // 5 minutes = 300 seconds
                    showToast('warning', 'Session Ending Soon', 'This session will end in 5 minutes.');
                    this.playNotificationSound();
                } else if (remaining === 60) { // 1 minute
                    showToast('warning', 'Session Ending Soon', 'This session will end in 1 minute.');
                    this.playNotificationSound();
                } else if (remaining === 0) {
                    if (userRole === 'mentor') {
                        this.endSession();
                    }
                }
            },
            
            // Play notification sound
            playNotificationSound() {
                try {
                    const audio = new Audio('/static/sounds/notification.mp3');
                    audio.volume = 0.5;
                    audio.play();
                } catch (error) {
                    console.error("Error playing notification sound:", error);
                }
            },
            
            // Get CSRF token from cookies
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
            },
            
            // Clean up resources
            cleanup() {
                // Close all peer connections
                Object.values(this.peerConnections).forEach(pc => {
                    pc.close();
                });
                
                // Stop local stream
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => {
                        track.stop();
                    });
                }
                
                // Stop screen share stream
                if (this.screenStream) {
                    this.screenStream.getTracks().forEach(track => {
                        track.stop();
                    });
                }
                
                // Close WebSocket
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.close();
                }
            }
        };
    };
}