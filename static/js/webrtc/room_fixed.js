/**
 * PeerLearn WebRTC Room Implementation - ENHANCED VERSION
 * Handles WebRTC connections for live video sessions between mentors and learners
 * With improved camera access, signaling, and video display
 */

// Initialize the WebRTC room with Alpine.js
function initWebRTCRoom(roomCode, userId, userName, userRole, iceServers) {
    // Create Alpine.js store for global state management
    Alpine.store('webRTCRoom', {
            // State variables
            roomCode: roomCode,
            localStream: null,
            mainStream: null,
            mainStreamUserId: null,
            mainStreamUser: null,
            peerConnections: {},
            otherParticipants: [],
            websocket: null,
            // Session timing and status
            sessionStartTime: null,
            sessionTime: '00:00:00',
            sessionTimerInterval: null,
            sessionStatus: 'connecting',
            // UI state
            videoEnabled: true,
            audioEnabled: true,
            isScreenSharing: false,
            showChat: false,
            layoutType: 'speaker',
            screenShareStream: null,
            chatMessages: [],
            newMessage: '',
            isInitializing: true,
            sessionStatus: 'waiting',
            sessionTimer: '00:00',
            sessionStartTime: null,
            participantMediaStatus: {},
            connectionStatus: 'Connecting',
            connectionStatusClass: 'connecting',
            wsReconnectTimer: null,
            wsLastMessageTime: null,
            wsCurrentEndpoint: null,
            wsConnectedOnce: false,
            wsReconnectAttempts: 0,
            isReconnecting: false,
            
            // DOM element getters
            get mainVideo() {
                return document.getElementById('main-video');
            },
            
            get localVideo() {
                return document.getElementById('local-video');
            },
            
            get participantsLabel() {
                const count = this.otherParticipants.length;
                return `Participants (${count + 1})`; // +1 for the local user
            },
            
            // Lifecycle hooks
            init() {
                console.log("Initializing WebRTC room with Alpine.store:", {
                    roomCode: roomCode,
                    userId: userId,
                    userName: userName,
                    userRole: userRole
                });
                
                // Store user info in the store instance
                this.userId = userId;
                this.userName = userName;
                this.userRole = userRole;
                this.isInitializing = false;
                
                // Ensure consistent connection status display
                this.connectionStatus = 'Connecting';
                this.connectionStatusClass = 'connecting';
                
                // Register cleanup on page unload
                window.addEventListener('beforeunload', this.cleanup.bind(this));
                
                // Setup WebRTC connections
                this.setupWebRTC().then(() => {
                    console.log("WebRTC setup completed");
                }).catch(err => {
                    console.error("WebRTC setup failed:", err);
                    showToast('error', 'Connection Error', 'Failed to initialize WebRTC connections', 5000);
                });
                
                // Check for autoplay issues with videos
                setTimeout(() => {
                    this.checkForAutoplayIssues();
                }, 1000);
            },
            
            // Check for autoplay issues with videos
            checkForAutoplayIssues() {
                // Give some time for videos to initialize
                setTimeout(() => {
                    this.tryPlayAllVideos();
                }, 1000);
            },
            
            // Try to play a video element and handle autoplay issues
            async tryPlayVideo(videoElement, description) {
                if (!videoElement) return;
                
                try {
                    // Only try to play if it has a source
                    if (videoElement.srcObject) {
                        const playPromise = videoElement.play();
                        if (playPromise !== undefined) {
                            try {
                                await playPromise;
                                console.log(`${description} playing successfully`);
                            } catch (e) {
                                console.warn(`Autoplay prevented for ${description}:`, e);
                                this.addPlayButtonOverlay();
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error playing ${description}:`, e);
                }
            },
            
            // Try to play all video elements
            tryPlayAllVideos() {
                try {
                    // Debug all video elements
                    this.debugVideoElements();
                    
                    // Try to play local video
                    this.tryPlayVideo(this.localVideo, 'local video');
                    
                    // Try to play main video
                    this.tryPlayVideo(this.mainVideo, 'main video');
                    
                    // Try to play all participant videos
                    document.querySelectorAll('.remote-video').forEach((video, index) => {
                        this.tryPlayVideo(video, `remote video ${index}`);
                    });
                } catch (e) {
                    console.error("Error during autoplay check:", e);
                }
            },
            
            // Add a play button overlay to help with autoplay issues
            addPlayButtonOverlay() {
                try {
                    const roomContainer = document.querySelector('.room-container');
                    if (!roomContainer) return;
                    
                    // Only add if not already present
                    if (document.getElementById('autoplay-overlay')) return;
                    
                    const overlay = document.createElement('div');
                    overlay.id = 'autoplay-overlay';
                    overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50';
                    overlay.innerHTML = `
                        <div class="bg-white p-8 rounded-lg max-w-md text-center">
                            <h3 class="text-xl font-bold mb-4">Video Playback Blocked</h3>
                            <p class="mb-6">Your browser has blocked automatic video playback. Click the button below to enable video and audio.</p>
                            <button id="enable-media-btn" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                Enable Video & Audio
                            </button>
                        </div>
                    `;
                    
                    roomContainer.appendChild(overlay);
                    
                    // Add click handler
                    document.getElementById('enable-media-btn').addEventListener('click', () => {
                        this.removePlayButtonOverlay();
                        this.tryPlayAllVideos();
                    });
                } catch (e) {
                    console.error("Error adding play button overlay:", e);
                }
            },
            
            // Remove the play button overlay
            removePlayButtonOverlay() {
                try {
                    const overlay = document.getElementById('autoplay-overlay');
                    if (overlay) {
                        overlay.remove();
                    }
                } catch (e) {
                    console.error("Error removing play button overlay:", e);
                }
            },
            
            // Debug video elements
            debugVideoElements() {
                try {
                    console.log("-- VIDEO ELEMENTS DEBUG --");
                    
                    // Local video
                    if (this.localVideo) {
                        console.log("Local video:", {
                            srcObject: !!this.localVideo.srcObject,
                            paused: this.localVideo.paused,
                            muted: this.localVideo.muted,
                            videoTracks: this.localVideo.srcObject ? this.localVideo.srcObject.getVideoTracks().length : 0,
                            audioTracks: this.localVideo.srcObject ? this.localVideo.srcObject.getAudioTracks().length : 0,
                            width: this.localVideo.videoWidth,
                            height: this.localVideo.videoHeight
                        });
                    } else {
                        console.log("Local video element not found");
                    }
                    
                    // Main video
                    if (this.mainVideo) {
                        console.log("Main video:", {
                            srcObject: !!this.mainVideo.srcObject,
                            paused: this.mainVideo.paused,
                            muted: this.mainVideo.muted,
                            videoTracks: this.mainVideo.srcObject ? this.mainVideo.srcObject.getVideoTracks().length : 0,
                            audioTracks: this.mainVideo.srcObject ? this.mainVideo.srcObject.getAudioTracks().length : 0,
                            width: this.mainVideo.videoWidth,
                            height: this.mainVideo.videoHeight
                        });
                    } else {
                        console.log("Main video element not found");
                    }
                    
                    // Remote videos
                    const remoteVideos = document.querySelectorAll('.remote-video');
                    console.log(`Found ${remoteVideos.length} remote video elements`);
                    
                    remoteVideos.forEach((video, index) => {
                        console.log(`Remote video ${index}:`, {
                            id: video.id,
                            srcObject: !!video.srcObject,
                            paused: video.paused,
                            muted: video.muted,
                            videoTracks: video.srcObject ? video.srcObject.getVideoTracks().length : 0,
                            audioTracks: video.srcObject ? video.srcObject.getAudioTracks().length : 0,
                            width: video.videoWidth,
                            height: video.videoHeight
                        });
                    });
                    
                    console.log("-- END VIDEO ELEMENTS DEBUG --");
                } catch (e) {
                    console.error("Error checking video elements:", e);
                }
                
                // Make variables available globally
                window.USER_ID = userId;
                window.USER_NAME = userName;
                window.USER_ROLE = userRole;
                window.ROOM_CODE = roomCode;
            },
            
            // Toggle video stream on/off
            toggleVideoStream() {
                try {
                    console.log("Toggling video stream, current state:", this.videoEnabled);
                    
                    if (this.localStream) {
                        const videoTracks = this.localStream.getVideoTracks();
                        if (videoTracks.length > 0) {
                            const track = videoTracks[0];
                            track.enabled = !track.enabled;
                            this.videoEnabled = track.enabled;
                            
                            // Broadcast media status update
                            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                                this.websocket.send(JSON.stringify({
                                    type: 'media_status',
                                    video: this.videoEnabled,
                                    audio: this.audioEnabled
                                }));
                            }
                            
                            showToast(
                                'info', 
                                this.videoEnabled ? 'Camera Enabled' : 'Camera Disabled',
                                this.videoEnabled ? 'Your camera is now on.' : 'Your camera is now off.'
                            );
                        }
                    }
                } catch (e) {
                    console.error("Error toggling video:", e);
                    showToast('error', 'Camera Error', 'Could not toggle camera state.', 5000);
                }
            },
            
            // Toggle audio stream on/off
            toggleAudioStream() {
                try {
                    console.log("Toggling audio stream, current state:", this.audioEnabled);
                    
                    if (this.localStream) {
                        const audioTracks = this.localStream.getAudioTracks();
                        if (audioTracks.length > 0) {
                            const track = audioTracks[0];
                            track.enabled = !track.enabled;
                            this.audioEnabled = track.enabled;
                            
                            // Broadcast media status update
                            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                                this.websocket.send(JSON.stringify({
                                    type: 'media_status',
                                    video: this.videoEnabled,
                                    audio: this.audioEnabled
                                }));
                            }
                            
                            showToast(
                                'info', 
                                this.audioEnabled ? 'Microphone Enabled' : 'Microphone Muted',
                                this.audioEnabled ? 'Your microphone is now on.' : 'Your microphone is now muted.'
                            );
                        }
                    }
                } catch (e) {
                    console.error("Error toggling audio:", e);
                    showToast('error', 'Microphone Error', 'Could not toggle microphone state.', 5000);
                }
            },
            
            // Toggle chat panel visibility
            toggleChat() {
                this.showChat = !this.showChat;
                console.log("Chat panel visibility toggled:", this.showChat);
            },
            
            // Toggle layout between grid and speaker view
            toggleLayout() {
                this.layoutType = this.layoutType === 'speaker' ? 'grid' : 'speaker';
                console.log("Layout changed to:", this.layoutType);
            },
            
            // Toggle screen sharing on/off
            async toggleScreenSharing() {
                try {
                    if (this.isScreenSharing) {
                        // Stop screen sharing
                        console.log("Stopping screen sharing");
                        if (this.screenShareStream) {
                            const tracks = this.screenShareStream.getTracks();
                            tracks.forEach(track => {
                                track.stop();
                            });
                            this.screenShareStream = null;
                        }
                        this.isScreenSharing = false;
                        
                        // Switch back to camera
                        if (this.localStream) {
                            // Replace screen share track with camera track
                            if (this.peerConnections) {
                                for (const userId in this.peerConnections) {
                                    const pc = this.peerConnections[userId];
                                    const senders = pc.getSenders();
                                    const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
                                    if (videoSender && this.localStream && this.localStream.getVideoTracks().length > 0) {
                                        videoSender.replaceTrack(this.localStream.getVideoTracks()[0]);
                                    }
                                }
                            }
                            
                            // Update UI
                            if (this.localVideo && this.localVideo.srcObject !== this.localStream) {
                                this.localVideo.srcObject = this.localStream;
                            }
                        }
                        
                        showToast('info', 'Screen Sharing Stopped', 'Returned to camera view', 3000);
                    } else {
                        // Start screen sharing
                        console.log("Starting screen sharing");
                        try {
                            const stream = await navigator.mediaDevices.getDisplayMedia({
                                video: {
                                    cursor: "always"
                                },
                                audio: false
                            });
                            
                            // Save screen share stream
                            this.screenShareStream = stream;
                            this.isScreenSharing = true;
                            
                            // Replace video track in all peer connections
                            const videoTrack = stream.getVideoTracks()[0];
                            if (videoTrack && this.peerConnections) {
                                for (const userId in this.peerConnections) {
                                    const pc = this.peerConnections[userId];
                                    const senders = pc.getSenders();
                                    const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
                                    if (videoSender) {
                                        videoSender.replaceTrack(videoTrack);
                                    }
                                }
                            }
                            
                            // Update local video preview
                            if (this.localVideo) {
                                this.localVideo.srcObject = stream;
                            }
                            
                            // Handle end of screen sharing by browser UI
                            videoTrack.onended = () => {
                                this.toggleScreenSharing();
                            };
                            
                            showToast('success', 'Screen Sharing Started', 'Your screen is now visible to other participants', 3000);
                        } catch (err) {
                            console.error("Error getting screen:", err);
                            this.isScreenSharing = false;
                            showToast('error', 'Screen Sharing Failed', err.message || 'Could not access your screen', 5000);
                        }
                    }
                } catch (e) {
                    console.error("Error toggling screen share:", e);
                    this.isScreenSharing = false;
                    showToast('error', 'Screen Sharing Error', 'An error occurred while managing screen sharing', 5000);
                }
            },
            
            // Send a chat message
            sendChatMessage() {
                if (!this.newMessage.trim()) return;
                
                try {
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        this.websocket.send(JSON.stringify({
                            type: 'chat',
                            message: this.newMessage
                        }));
                        
                        // Add to local chat display
                        this.chatMessages.push({
                            sender: USER_NAME,
                            message: this.newMessage,
                            timestamp: new Date().toISOString()
                        });
                        
                        // Clear input
                        this.newMessage = '';
                    } else {
                        showToast('error', 'Connection Error', 'Cannot send message. Connection lost.', 5000);
                    }
                } catch (e) {
                    console.error("Error sending chat message:", e);
                    showToast('error', 'Message Error', 'Failed to send message.', 5000);
                }
            },
            
            // Setup WebRTC functionality - returns a promise
            async setupWebRTC() {
                return new Promise(async (resolve, reject) => {
                    try {
                        console.log("Setting up WebRTC with user ID:", userId);
                    
                    // Clear any existing peer connections
                    for (const id in this.peerConnections) {
                        if (this.peerConnections[id]) {
                            try {
                                this.peerConnections[id].close();
                            } catch (e) {
                                console.warn("Error closing peer connection:", e);
                            }
                        }
                    }
                    this.peerConnections = {};
                    
                    // Reset state
                    this.otherParticipants = [];
                    this.isInitializing = true;
                    this.connectionStatus = "Connecting";
                    this.connectionStatusClass = "connecting";
                    this.isReconnecting = false;
                    
                    // Check for permissions before connecting
                    try {
                        // Pre-check camera/mic permissions to improve UX
                        const permStatus = await navigator.permissions.query({name: 'camera'});
                        console.log("Camera permission status:", permStatus.state);
                        
                        if (permStatus.state === 'denied') {
                            showToast('error', 'Camera Access Denied', 
                                     'Camera access has been blocked. Please change permissions in your browser settings.', 10000);
                        }
                    } catch (err) {
                        console.log("Permission API not supported, continuing anyway");
                    }
                    
                    // Connect to WebSocket for signaling
                    this.connectWebSocket(roomCode);
                    
                    // Request camera and mic access with fallback chain
                    console.log("Requesting camera/mic access");
                    showToast('info', 'Camera Setup', 'Setting up your camera and microphone...', 5000);
                    
                    const mediaSuccess = await this.requestUserMedia();
                    
                    if (!mediaSuccess) {
                        showToast('error', 'Camera Error', 'Could not access your camera or microphone. Please check your device settings.', 10000);
                        throw new Error("Failed to get user media");
                    }
                    
                    // Update UI
                    this.connectionStatus = "Connected";
                    this.connectionStatusClass = "connected";
                    this.sessionStatus = "live";
                    
                    // Start session timer
                    this.startSessionTimer();
                    
                    console.log("WebRTC setup completed successfully");
                        
                        // If mentor, update session status to live
                        if (userRole === 'mentor') {
                            console.log("Updating session status to live (mentor role)");
                            this.updateSessionStatus('live');
                        }
                        
                        // Show success message
                        showToast('success', 'Connected', 'You have joined the session successfully.');
                        
                        // Resolve the promise
                        resolve();
                    } catch (e) {
                        console.error("Error during WebRTC setup:", e);
                        showToast('error', 'Connection Error', 'Failed to set up video connection. Please refresh the page.');
                        this.connectionStatus = "Error";
                        this.connectionStatusClass = "error";
                        
                        // Reject the promise
                        reject(e);
                    } finally {
                        this.isInitializing = false;
                    }
                });
            },
            
            // Connect to WebSocket server for signaling
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
                            this.websocket.onmessage = this.onWebSocketMessage.bind(this);
                            
                            // Handle connection close
                            this.websocket.onclose = (event) => {
                                console.log(`WebSocket connection closed from ${currentUrl} with code ${event.code}`);
                                
                                // Handle reconnection logic
                                if (this.wsConnectedOnce) {
                                    // If we were previously connected, try to reconnect to the same endpoint
                                    this.onWebSocketClose(event);
                                } else {
                                    // If we were never connected, try the next endpoint
                                    attemptCount++;
                                    tryNextEndpoint();
                                }
                            };
                            
                            // Handle connection errors
                            this.websocket.onerror = (error) => {
                                console.error(`WebSocket connection error on ${currentUrl}:`, error);
                                
                                // Don't call onWebSocketError here as it might trigger reconnection
                                // We'll let onclose handle that
                            };
                            
                        } catch (e) {
                            console.error(`Error creating WebSocket to ${currentUrl}:`, e);
                            
                            // Try next endpoint
                            attemptCount++;
                            
                            // Small delay before trying next endpoint
                            setTimeout(tryNextEndpoint, 500);
                        }
                        
                    } else {
                        console.error("All WebSocket connection attempts failed");
                        this.connectionStatus = "Connection Failed";
                        this.connectionStatusClass = "error";
                        showToast('error', 'Connection Failed', 'Could not connect to the session. Please refresh the page to try again.');
                    }
                };
                
                // Start connection attempts
                tryNextEndpoint();
            },
            
            // Start heartbeat mechanism
            startHeartbeat() {
                // Clear any existing timer
                if (this.wsHeartbeatTimer) {
                    clearInterval(this.wsHeartbeatTimer);
                }
                
                // Set up new heartbeat interval
                this.wsHeartbeatTimer = setInterval(() => {
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        // Send ping message
                        this.websocket.send(JSON.stringify({
                            type: 'ping',
                            timestamp: Date.now(),
                            user_id: userId
                        }));
                    }
                }, 15000); // Send heartbeat every 15 seconds
            },
            
            // WebSocket open event handler
            onWebSocketOpen(event) {
                console.log("WebSocket connection opened");
                
                // Reset reconnection attempts
                this.wsReconnectAttempts = 0;
                
                // Update UI
                this.connectionStatus = "Connected";
                this.connectionStatusClass = "connected";
                
                // Send join message
                const joinMessage = {
                    type: 'user_join',
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
                        console.log("WebSocket message received:", message);
                    }
                    
                    // Update last message time for monitoring connection health
                    this.wsLastMessageTime = Date.now();
                    
                    // Handle different message types
                    switch (message.type) {
                        case 'ping':
                            // Respond to ping with pong to keep connection alive
                            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                                this.websocket.send(JSON.stringify({
                                    type: 'pong',
                                    timestamp: Date.now(),
                                    original_timestamp: message.timestamp,
                                    user_id: userId
                                }));
                            }
                            break;
                        
                        case 'pong':
                            // Calculate latency if we're tracking it
                            if (message.original_timestamp) {
                                const latency = Date.now() - message.original_timestamp;
                                console.log(`WebSocket connection latency: ${latency}ms`);
                                
                                // If latency is too high, show warning
                                if (latency > 1000) {
                                    console.warn(`High latency detected: ${latency}ms`);
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
                                
                                // Add to participants list if not already there
                                if (!this.otherParticipants.find(p => p.id === message.user_id)) {
                                    console.log(`Adding ${message.username} to participants list`);
                                    this.otherParticipants.push(newParticipant);
                                }
                                
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
                                
                                // Remove from participants list
                                this.otherParticipants = this.otherParticipants.filter(p => p.id !== message.user_id);
                                
                                // Remove video container if it exists
                                const videoContainer = document.getElementById(`video-container-${message.user_id}`);
                                if (videoContainer) {
                                    videoContainer.remove();
                                }
                                
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
                                } catch (e) {
                                    console.error("Error processing offer:", e);
                                    showToast('error', 'Connection Error', 'An error occurred with the connection. Please try refreshing the page.');
                                }
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
                            
                            // Play notification sound
                            this.playNotificationSound();
                            
                            break;
                            
                        case 'media_status':
                            // Update media status of a participant
                            if (message.user_id !== userId) {
                                // Update participant's media status
                                if (!this.participantMediaStatus[message.user_id]) {
                                    this.participantMediaStatus[message.user_id] = {};
                                }
                                
                                // Update audio status
                                if (message.audioEnabled !== undefined) {
                                    this.updateParticipantMediaStatus(message.user_id, 'audio', message.audioEnabled);
                                }
                                
                                // Update video status
                                if (message.videoEnabled !== undefined) {
                                    this.updateParticipantMediaStatus(message.user_id, 'video', message.videoEnabled);
                                }
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
                            
                        case 'session_status':
                            // Session status update
                            if (message.status) {
                                this.sessionStatus = message.status;
                                
                                if (message.status === 'live' && !this.sessionStartTime) {
                                    this.sessionStartTime = new Date();
                                    
                                    // Start session timer
                                    setInterval(() => {
                                        this.updateSessionTimer();
                                    }, 1000);
                                }
                            }
                            break;
                            
                        case 'error':
                            // Error message
                            showToast('error', message.title || 'Error', message.message || 'An error occurred.');
                            break;
                            
                        default:
                            console.log("Unknown message type:", message.type);
                    }
                } catch (e) {
                    console.error("Error processing WebSocket message:", e);
                }
            },
            
            // WebSocket close event handler
            onWebSocketClose(event) {
                console.log("WebSocket connection closed:", event);
                
                // Check if we should attempt to reconnect
                if (!this.isReconnecting && this.wsConnectedOnce) {
                    this.isReconnecting = true;
                    this.connectionStatus = "Reconnecting";
                    this.connectionStatusClass = "reconnecting";
                    
                    console.log("Attempting to reconnect WebSocket...");
                    
                    // Clear any existing reconnect timer
                    if (this.wsReconnectTimer) {
                        clearTimeout(this.wsReconnectTimer);
                    }
                    
                    // Exponential backoff for reconnection
                    const backoffTime = Math.min(1000 * (Math.pow(2, this.wsReconnectAttempts) + Math.random()), 10000);
                    this.wsReconnectAttempts++;
                    
                    console.log(`Reconnecting in ${backoffTime / 1000}s (attempt ${this.wsReconnectAttempts}/5)`);
                    
                    this.wsReconnectTimer = setTimeout(() => {
                        if (this.wsReconnectAttempts < 5) {
                            this.connectWebSocket(this.roomCode);
                        } else {
                            console.error("Maximum reconnection attempts reached");
                            this.connectionStatus = "Disconnected";
                            this.connectionStatusClass = "error";
                            showToast('error', 'Connection Lost', 'Could not reconnect to the session. Please refresh the page.');
                        }
                        this.isReconnecting = false;
                    }, backoffTime);
                }
            },
            
            // WebSocket error event handler
            onWebSocketError(error) {
                console.error("WebSocket connection error:", error);
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
                    
                    // Enhanced remote stream handling for better video appearance
                    this.peerConnections[userId].ontrack = (event) => {
                        console.log(`Received remote track from ${username}:`, event.track.kind, event.streams[0]);
                        
                        // Check if we have a valid stream
                        if (!event.streams || !event.streams[0]) {
                            console.error(`No stream object in track event from ${username}`);
                            showToast('error', 'Connection Issue', `Problem receiving video from ${username}. Try refreshing.`);
                            return;
                        }
                        
                        // Log important track information for debugging
                        console.log(`Track details from ${username}: type=${event.track.kind}, enabled=${event.track.enabled}, muted=${event.track.muted}, readyState=${event.track.readyState}`);
                        
                        const remoteStream = event.streams[0];
                        
                        // Log tracks received
                        console.log(`Remote stream from ${username} has ${remoteStream.getTracks().length} tracks`);
                        remoteStream.getTracks().forEach((track, i) => {
                            console.log(`Remote track ${i} kind: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
                        });
                        
                        // Set the remote user's stream directly to the main video element for better connection
                        // This ensures the remote video appears more reliably
                        const mainVideo = document.getElementById('main-video');
                        
                        if (mainVideo) {
                            console.log(`Setting remote stream from ${username} directly to main video element`);
                            
                            // Set srcObject directly to ensure it appears
                            mainVideo.srcObject = remoteStream;
                            
                            // Force playback attempts in case of autoplay issues
                            this.tryPlayVideo(mainVideo, `remote video from ${username}`).then(() => {
                                console.log(`Successfully playing remote video from ${username}`);
                                
                                // Update UI to show connection is established
                                this.remoteVideoEnabled = true;
                                this.remoteUserRole = this.getParticipantRole(userId);
                                this.remoteUserName = username;
                                
                                // Set a flag to track that remote video is connected
                                window.remoteVideoConnected = true;
                                
                                // Show successful connection toast
                                showToast('success', 'Connected', `You are now connected with ${username}`, 3000);
                            }).catch(err => {
                                console.error(`Error playing remote video: ${err}`);
                                showToast('warning', 'Video Issue', 'Remote video may be paused due to autoplay restrictions. Click the screen to enable.', 5000);
                            });
                        } else {
                            console.error('Main video element not found');
                            showToast('error', 'UI Error', 'Could not find main video element.');
                            return;
                        }
                        
                        // Also create a smaller thumbnail for the participants container
                        const participantsContainer = document.getElementById('participants-videos');
                        if (participantsContainer) {
                            let videoElement = document.getElementById(`video-${userId}`);
                            
                            // Create video element if it doesn't exist
                            if (!videoElement) {
                                videoElement = document.createElement('video');
                                videoElement.id = `video-${userId}`;
                                videoElement.autoplay = true;
                                videoElement.playsInline = true;
                                videoElement.muted = false;
                                videoElement.classList.add('remote-video');
                                
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
                                
                                // Set srcObject for this video element too
                                videoElement.srcObject = remoteStream;
                                this.tryPlayVideo(videoElement, `thumbnail video from ${username}`);
                            }
                        }
                        
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
                                console.log(`Setting ${username} as main video`);
                                
                                // Update main video with remote stream
                                const mainVideo = document.getElementById('main-video');
                                if (mainVideo) {
                                    // Create a new MediaStream to clone the tracks
                                    const mainStream = new MediaStream();
                                    remoteStream.getTracks().forEach(track => {
                                        mainStream.addTrack(track);
                                    });
                                    
                                    // Set main video
                                    mainVideo.srcObject = mainStream;
                                    mainVideo.muted = false;
                                    
                                    // Try to play, handle autoplay issues
                                    mainVideo.play().catch(e => {
                                        console.warn("Main video autoplay prevented:", e);
                                        
                                        // Add click handler to document to try to play main video
                                        document.addEventListener('click', () => {
                                            mainVideo.play().catch(err => {
                                                console.error("Still failed to play main video after click:", err);
                                            });
                                        }, {once: true});
                                    });
                                    
                                    // Update main stream info
                                    this.mainStream = mainStream;
                                    this.mainStreamUserId = userId;
                                    this.mainStreamUser = username;
                                }
                            }
                            
                            // Add click event to switch this user to main video
                            videoElement.addEventListener('click', () => {
                                this.switchMainVideo(userId, username);
                            });
                            
                        } catch (e) {
                            console.error(`Error displaying remote video for ${username}:`, e);
                            showToast('error', 'Video Display Error', `Problem displaying video from ${username}. Try refreshing.`);
                        }
                    };
                    
                    console.log(`Peer connection created for ${username}`);
                    return this.peerConnections[userId];
                } catch (e) {
                    console.error(`Error creating peer connection for ${username}:`, e);
                    showToast('error', 'Connection Error', 'Failed to create video connection. Please refresh the page.');
                    return null;
                }
            },
            
            // Request user media (camera and microphone)
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
                                width: { ideal: 640, min: 320 },
                                height: { ideal: 480, min: 240 },
                                frameRate: { max: 24, ideal: 15 },
                                facingMode: 'user'
                            } : {
                                // Desktop-optimized video with better quality
                                width: { ideal: 1280, min: 640 },
                                height: { ideal: 720, min: 480 },
                                frameRate: { ideal: 30, min: 15 }
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
                    
                    // Try each fallback option until one works
                    for (let i = 0; i < fallbackOptions.length; i++) {
                        try {
                            console.log(`Trying getUserMedia with option ${i+1}:`, fallbackOptions[i]);
                            stream = await navigator.mediaDevices.getUserMedia(fallbackOptions[i]);
                            
                            if (stream) {
                                console.log(`getUserMedia succeeded with option ${i+1}`);
                                
                                // Remove camera permission button since we succeeded
                                if (document.getElementById('camera-permission-button')) {
                                    document.getElementById('camera-permission-button').remove();
                                }
                                
                                break;
                            }
                        } catch (e) {
                            console.warn(`getUserMedia option ${i+1} failed:`, e);
                            
                            if (i === fallbackOptions.length - 1) {
                                // Last option failed
                                if (e.name === 'NotAllowedError') {
                                    console.error("Camera/microphone access denied by user or system");
                                    showToast('error', 'Permission Denied', 'You denied access to your camera/microphone. Please allow access and refresh the page.', 10000);
                                } else if (e.name === 'NotFoundError') {
                                    console.error("No camera/microphone found");
                                    showToast('error', 'Device Not Found', 'No camera or microphone found. Please check your device connections.', 7000);
                                } else {
                                    console.error("getUserMedia error:", e.name, e.message);
                                    showToast('error', 'Media Error', `Could not access camera/microphone: ${e.message}`, 7000);
                                }
                                return false;
                            }
                        }
                    }
                    
                    // Check if we got a stream
                    if (!stream) {
                        console.error("Failed to get user media with all fallback options");
                        showToast('error', 'Camera Access Failed', 'Could not access your camera or microphone after multiple attempts. Try refreshing.', 7000);
                        return false;
                    }
                    
                    // Log stream and tracks
                    console.log("Got user media stream:", stream);
                    console.log("Audio tracks:", stream.getAudioTracks().length);
                    console.log("Video tracks:", stream.getVideoTracks().length);
                    
                    stream.getVideoTracks().forEach((track, i) => {
                        console.log(`Video track ${i} settings:`, track.getSettings());
                    });
                    
                    // Save the local stream
                    this.localStream = stream;
                    
                    // In this function we set the local media stream to the <video> element
                    const localVideoElement = document.getElementById('local-video');
                    
                    if (!localVideoElement) {
                        console.error("Local video element not found");
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
                                
                                // Add event listener for track ended
                                track.onended = () => {
                                    console.log("Video track ended");
                                    showToast('warning', 'Video Stopped', 'Your camera has stopped. Try enabling it again or refresh the page.');
                                };
                                
                                // Add event listener for track muted
                                track.onmute = () => {
                                    console.log("Video track muted");
                                };
                            });
                        } catch (e) {
                            console.error("Error setting up local video:", e);
                            showToast('error', 'Video Setup Error', 'Error setting up your video. Please refresh the page.');
                            return false;
                        }
                    }
                    
                    // Update our peerConnections with the new stream
                    this.updatePeerConnections();
                    
                    // Success!
                    return true;
                } catch (e) {
                    console.error("Error requesting user media:", e);
                    showToast('error', 'Camera Error', `Could not access camera: ${e.message}`);
                    return false;
                }
            },
            
            // Update peer connections with new local stream
            updatePeerConnections() {
                if (!this.localStream) return;
                
                // Loop through all peer connections
                Object.entries(this.peerConnections).forEach(([userId, pc]) => {
                    // Get all senders
                    const senders = pc.getSenders();
                    
                    // Loop through all tracks in local stream
                    this.localStream.getTracks().forEach(track => {
                        // Check if we already have a sender for this track kind
                        const existingSender = senders.find(sender => 
                            sender.track && sender.track.kind === track.kind
                        );
                        
                        if (existingSender) {
                            // If we already have a sender for this track kind, replace the track
                            existingSender.replaceTrack(track).catch(e => {
                                console.error(`Error replacing ${track.kind} track in peer connection:`, e);
                            });
                        } else {
                            // Otherwise add the track
                            pc.addTrack(track, this.localStream);
                        }
                    });
                });
            },
            
            // Toggle audio
            toggleAudio() {
                if (this.localStream) {
                    const audioTracks = this.localStream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        const enabled = !audioTracks[0].enabled;
                        audioTracks.forEach(track => {
                            track.enabled = enabled;
                        });
                        this.audioEnabled = enabled;
                        
                        // Send audio status update to all participants
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            this.websocket.send(JSON.stringify({
                                type: 'media_status',
                                user_id: userId,
                                username: userName,
                                audioEnabled: enabled
                            }));
                        }
                        
                        // Show toast notification
                        showToast('info', 'Microphone', enabled ? 'Microphone turned on' : 'Microphone muted');
                        this.updateAudioStatus();
                    } else {
                        showToast('warning', 'No Microphone', 'No microphone available to toggle.');
                    }
                } else {
                    showToast('error', 'No Stream', 'No media stream available. Please refresh the page.');
                }
            },
            
            // Get participant role
            getParticipantRole(userId) {
                // If it's the local user, use the userRole variable
                if (userId === window.userId) return userRole;
                
                // Otherwise find the participant in the list
                const participant = this.otherParticipants.find(p => p.id === userId);
                return participant ? participant.role : 'unknown';
            },
            
            // Update participant media status
            updateParticipantMediaStatus(userId, mediaType, enabled) {
                // Find the participant
                const participant = this.otherParticipants.find(p => p.id === userId);
                if (!participant) return;
                
                // Update the status
                if (mediaType === 'audio') {
                    participant.audioEnabled = enabled;
                } else if (mediaType === 'video') {
                    participant.videoEnabled = enabled;
                }
                
                // Re-render
                this.otherParticipants = [...this.otherParticipants];
                
                // Find the video element for this participant
                const videoElement = document.getElementById(`video-${userId}`);
                if (videoElement) {
                    if (mediaType === 'video') {
                        videoElement.classList.toggle('video-disabled', !enabled);
                    }
                }
            },
            
            // Switch main video
            switchMainVideo(userId, username) {
                console.log(`Switching main video to ${username}`);
                
                // Find the remote stream for this user
                const peerConnection = this.peerConnections[userId];
                if (!peerConnection) {
                    console.error(`No peer connection found for user ${username} (ID: ${userId})`);
                    return;
                }
                
                // Get the main video element
                const mainVideo = document.getElementById('main-video');
                if (!mainVideo) {
                    console.error("Main video element not found");
                    return;
                }
                
                // Find the participant's video element as fallback
                const videoElement = document.getElementById(`video-${userId}`);
                
                // Use the remote stream directly from peer connection or the video element
                let remoteStream;
                
                // Check if we can get receivers from the peer connection (most reliable)
                const receivers = peerConnection.getReceivers();
                if (receivers && receivers.length > 0) {
                    console.log(`Found ${receivers.length} receivers for ${username}`);
                    
                    // Create a new MediaStream with all tracks
                    remoteStream = new MediaStream();
                    receivers.forEach(receiver => {
                        if (receiver.track) {
                            remoteStream.addTrack(receiver.track);
                        }
                    });
                } 
                // Fallback to video element's srcObject if available
                else if (videoElement && videoElement.srcObject) {
                    console.log(`Using existing video element stream for ${username}`);
                    remoteStream = videoElement.srcObject;
                } else {
                    console.error("Can't switch main video: no stream available");
                    return;
                }
                
                // Save previous srcObject to stop its tracks later
                const previousSrcObject = mainVideo.srcObject;
                
                // Set the main video stream
                mainVideo.srcObject = mainStream;
                mainVideo.muted = false;
                
                // Play the main video
                const playPromise = mainVideo.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.error("Error playing main video:", e);
                        showToast('warning', 'Video Autoplay Blocked', 'Click the video to start playback.');
                    });
                }
                
                // Update main stream info
                this.mainStream = mainStream;
                this.mainStreamUserId = userId;
                this.mainStreamUser = username;
                
                // Show toast notification
                showToast('info', 'Main View', `Switched main view to ${username}`);
            },
            
            // Update video status for UI
            updateVideoStatus() {
                const videoControls = document.getElementById('video-controls');
                if (videoControls) {
                    // Update video icon
                    const videoIcon = videoControls.querySelector('.video-icon');
                    if (videoIcon) {
                        videoIcon.innerHTML = this.videoEnabled ? 
                            `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>` : 
                            `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>`;
                        
                        // Update button styles
                        const videoButton = document.getElementById('video-toggle');
                        if (videoButton) {
                            if (this.videoEnabled) {
                                videoButton.classList.remove('bg-red-500', 'hover:bg-red-600');
                                videoButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
                            } else {
                                videoButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                                videoButton.classList.add('bg-red-500', 'hover:bg-red-600');
                            }
                        }
                    }
                }
            },
            
            // Update audio status for UI
            updateAudioStatus() {
                const audioControls = document.getElementById('audio-controls');
                if (audioControls) {
                    // Update audio icon
                    const audioIcon = audioControls.querySelector('.audio-icon');
                    if (audioIcon) {
                        audioIcon.innerHTML = this.audioEnabled ? 
                            `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>` : 
                            `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>`;
                        
                        // Update button styles
                        const audioButton = document.getElementById('audio-toggle');
                        if (audioButton) {
                            if (this.audioEnabled) {
                                audioButton.classList.remove('bg-red-500', 'hover:bg-red-600');
                                audioButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
                            } else {
                                audioButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                                audioButton.classList.add('bg-red-500', 'hover:bg-red-600');
                            }
                        }
                    }
                }
            },
            
            // Toggle video
            toggleVideo() {
                if (this.localStream) {
                    const videoTracks = this.localStream.getVideoTracks();
                    if (videoTracks.length > 0) {
                        const enabled = !videoTracks[0].enabled;
                        videoTracks.forEach(track => {
                            track.enabled = enabled;
                        });
                        this.videoEnabled = enabled;
                        
                        // Send video status update to all participants
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            this.websocket.send(JSON.stringify({
                                type: 'media_status',
                                user_id: userId,
                                username: userName,
                                videoEnabled: enabled
                            }));
                        }
                        
                        // Show toast notification
                        showToast('info', 'Camera', enabled ? 'Camera turned on' : 'Camera turned off');
                        this.updateVideoStatus();
                    } else {
                        showToast('warning', 'No Camera', 'No camera available to toggle.');
                    }
                } else {
                    showToast('error', 'No Stream', 'No media stream available. Please refresh the page.');
                }
            },
            
            // Toggle screen share
            async toggleScreenShare() {
                try {
                    if (this.screenShareEnabled) {
                        // Stop screen sharing
                        if (this.screenShareStream) {
                            this.screenShareStream.getTracks().forEach(track => track.stop());
                            this.screenShareStream = null;
                        }
                        
                        // Restore local stream to peer connections
                        Object.entries(this.peerConnections).forEach(([userId, pc]) => {
                            // Get all senders
                            const senders = pc.getSenders();
                            
                            // Remove screen share tracks
                            senders.forEach(sender => {
                                if (sender.track && sender.track.kind === 'video') {
                                    pc.removeTrack(sender);
                                }
                            });
                            
                            // Add back local video track
                            if (this.localStream) {
                                const videoTrack = this.localStream.getVideoTracks()[0];
                                if (videoTrack) {
                                    pc.addTrack(videoTrack, this.localStream);
                                }
                            }
                        });
                        
                        // Update UI
                        this.screenShareEnabled = false;
                        showToast('info', 'Screen Share', 'Screen sharing stopped');
                        
                        // Show local video in local view
                        const localVideo = document.getElementById('local-video');
                        if (localVideo && this.localStream) {
                            localVideo.srcObject = this.localStream;
                            localVideo.play().catch(e => console.warn("Could not autoplay local video:", e));
                        }
                    } else {
                        // Start screen sharing
                        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                            showToast('error', 'Not Supported', 'Screen sharing is not supported in your browser.');
                            return;
                        }
                        
                        // Get screen share stream
                        this.screenShareStream = await navigator.mediaDevices.getDisplayMedia({
                            video: true,
                            audio: false // Most browsers don't support audio capture for screen share
                        });
                        
                        // Update all peer connections with screen share track
                        const videoTrack = this.screenShareStream.getVideoTracks()[0];
                        if (videoTrack) {
                            Object.entries(this.peerConnections).forEach(([userId, pc]) => {
                                // Get all senders
                                const senders = pc.getSenders();
                                
                                // Find video sender
                                const videoSender = senders.find(sender => 
                                    sender.track && sender.track.kind === 'video'
                                );
                                
                                if (videoSender) {
                                    // Replace track
                                    videoSender.replaceTrack(videoTrack).catch(e => {
                                        console.error("Error replacing track with screen share:", e);
                                    });
                                } else {
                                    // Add track
                                    pc.addTrack(videoTrack, this.screenShareStream);
                                }
                            });
                            
                            // Update UI
                            this.screenShareEnabled = true;
                            showToast('info', 'Screen Share', 'Screen sharing started');
                            
                            // Show screen share in local view
                            const localVideo = document.getElementById('local-video');
                            if (localVideo) {
                                localVideo.srcObject = this.screenShareStream;
                                localVideo.play().catch(e => console.warn("Could not autoplay screen share:", e));
                            }
                            
                            // Handle screen share ended
                            videoTrack.onended = () => {
                                this.toggleScreenShare();
                            };
                        }
                    }
                } catch (e) {
                    console.error("Error toggling screen share:", e);
                    showToast('error', 'Screen Share Error', e.message || 'Error sharing screen');
                    this.screenShareEnabled = false;
                }
            },
            
            // Send chat message
            sendChatMessage() {
                const chatInput = document.getElementById('chat-input');
                if (!chatInput || !chatInput.value.trim()) return;
                
                const messageContent = chatInput.value.trim();
                
                // Send message via WebSocket
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(JSON.stringify({
                        type: 'chat_message',
                        user_id: userId,
                        username: userName,
                        content: messageContent
                    }));
                    
                    // Add message to local chat
                    this.chatMessages.push({
                        sender: 'You',
                        content: messageContent,
                        timestamp: new Date()
                    });
                    
                    // Clear input
                    chatInput.value = '';
                } else {
                    showToast('error', 'Connection Error', 'Not connected to chat. Please refresh the page.');
                }
            },
            
            // End session (mentor only)
            endSession() {
                // Only mentors can end the session for everyone
                if (userRole !== 'mentor') {
                    showToast('error', 'Permission Denied', 'Only mentors can end the session.');
                    return;
                }
                
                // Confirm before ending
                if (!confirm('Are you sure you want to end this session for all participants?')) return;
                
                console.log('Mentor ending session - sending notifications');
                showToast('info', 'Ending Session', 'Please wait while we end the session...', 3000);
                
                // Update the session status to 'ended'
                this.updateSessionStatus('ended');
                
                // Send session end message via WebSocket for real-time notification
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    console.log('Sending session_ended message via WebSocket');
                    this.websocket.send(JSON.stringify({
                        type: 'session_ended',
                        user_id: userId,
                        username: userName
                    }));
                }
                
                // Make a direct API call to ensure the session is correctly marked as ended in the database
                fetch(`/sessions/${roomCode}/end/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Session ended successfully via direct API call:', data);
                    
                    // Clean up WebRTC connections
                    this.cleanupWebRTC();
                    
                    // Show success message and redirect
                    showToast('success', 'Session Ended', 'The session has been ended successfully. Redirecting to dashboard...');
                    setTimeout(() => {
                        window.location.href = '/users/dashboard/mentor/';
                    }, 3000);
                })
                .catch(error => {
                    console.error('Error ending session via API:', error);
                    
                    // Even if API fails, still clean up and redirect
                    this.cleanupWebRTC();
                    
                    showToast('warning', 'Session Ended', 'The session has been ended with some issues. Redirecting to dashboard...');
                    setTimeout(() => {
                        window.location.href = '/users/dashboard/mentor/';
                    }, 3000);
                });
            },
            
            // Update session status
            // Leave session (for learners)
            leaveSession() {
                if (userRole !== 'learner') {
                    showToast('error', 'Permission Denied', 'This function is for learners only. Mentors should use End Session.');
                    return;
                }
                
                if (!confirm('Are you sure you want to leave this session?')) return;
                
                console.log('Learner leaving session');
                showToast('info', 'Leaving Session', 'Please wait while we disconnect you from the session...', 3000);
                
                // Clean up WebRTC connections
                this.cleanupWebRTC();
                
                // Send notification through WebSocket if connected
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(JSON.stringify({
                        type: 'participant_left',
                        user_id: userId,
                        username: userName,
                        role: userRole
                    }));
                }
                
                // Show success message and redirect to learner dashboard
                showToast('success', 'Left Session', 'You have left the session successfully. Redirecting to dashboard...');
                setTimeout(() => {
                    window.location.href = '/users/dashboard/learner/';
                }, 2000);
            },
            
            updateSessionStatus(status) {
                // Check if user is a mentor
                if (userRole !== 'mentor' && status !== 'participant_joined') {
                    console.log("Only mentors can update session status");
                    return;
                }
                
                // First send via WebSocket for real-time updates
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    console.log(`Sending session_status via WebSocket: ${status}`);
                    this.websocket.send(JSON.stringify({
                        type: 'session_status',
                        user_id: userId,
                        username: userName,
                        status: status
                    }));
                } else {
                    console.warn("WebSocket not connected, status update will only be sent via HTTP");
                }
                
                // Log the request URL and data for debugging
                console.log(`Updating session status to ${status} for room ${roomCode}`);
                console.log(`Calling API: /api/sessions/${roomCode}/status/`);
                
                // Update backend session status via HTTP API
                fetch(`/api/sessions/${roomCode}/status/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify({
                        status: status
                    })
                })
                .then(response => {
                    console.log('Status update response:', response.status);
                    if (!response.ok) {
                        return response.text().then(text => {
                            console.error('Error response text:', text);
                            throw new Error(`HTTP error! Status: ${response.status}, Response: ${text}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Session status updated successfully:', data);
                    
                    // Display status-specific notifications
                    if (status === 'live') {
                        showToast('success', 'Session Started', 'The session is now live!', 5000);
                    } else if (status === 'completed' || status === 'ended') {
                        showToast('info', 'Session Ended', 'The session has been marked as completed.', 5000);
                    }
                })
                .catch(error => {
                    console.error("Error updating session status:", error);
                    showToast('error', 'Status Update Failed', 'Failed to update session status. Please try again.', 5000);
                });
                
                // Update local state
                this.sessionStatus = status;
            },
            
            // Update session timer
            updateSessionTimer() {
                if (!this.sessionStartTime) return;
                
                const now = new Date();
                const diff = now - this.sessionStartTime;
                
                // Calculate hours, minutes, seconds
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                
                // Format timer
                if (hours > 0) {
                    this.sessionTimer = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                } else {
                    this.sessionTimer = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }
            },
            
            // Play notification sound
            playNotificationSound() {
                try {
                    const audio = new Audio('/static/sounds/notification.mp3');
                    audio.volume = 0.5;
                    audio.play().catch(e => console.warn("Could not play notification sound:", e));
                } catch (e) {
                    console.warn("Error playing notification sound:", e);
                }
            },
            
            // Get CSRF token
            getCsrfToken() {
                const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
                return csrfCookie ? csrfCookie.split('=')[1] : '';
            },
            
            // Cleanup on unload
            cleanup() {
                // Stop local stream
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => track.stop());
                }
                
                // Stop screen share stream
                if (this.screenShareStream) {
                    this.screenShareStream.getTracks().forEach(track => track.stop());
                }
                
                // Close peer connections
                Object.values(this.peerConnections).forEach(pc => {
                    try {
                        pc.close();
                    } catch (e) {
                        console.warn("Error closing peer connection:", e);
                    }
                });
                
                // Close WebSocket
                if (this.websocket && this.websocket.readyState !== WebSocket.CLOSED) {
                    this.websocket.close();
                }
                
                // Clear timers
                if (this.wsHeartbeatTimer) clearInterval(this.wsHeartbeatTimer);
                if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
            }
    });
}