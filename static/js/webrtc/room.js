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
            otherParticipants: [], // Array of connected participants
            participantMediaStatus: {}, // Keep track of participants' media status
            chatMessages: [],
            newMessage: "",
            audioEnabled: true,
            videoEnabled: true,
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
            },
            
            // Set up WebRTC
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
                // Create WebSocket connection
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/ws/session/${roomCode}/`;
                
                this.websocket = new WebSocket(wsUrl);
                
                // Set up event handlers
                this.websocket.onopen = this.onWebSocketOpen.bind(this);
                this.websocket.onmessage = this.onWebSocketMessage.bind(this);
                this.websocket.onclose = this.onWebSocketClose.bind(this);
                this.websocket.onerror = this.onWebSocketError.bind(this);
            },
            
            // WebSocket open event handler
            onWebSocketOpen(event) {
                console.log("WebSocket connection established");
                
                // Send join message
                this.websocket.send(JSON.stringify({
                    type: 'join',
                    user_id: userId,
                    username: userName,
                    role: userRole
                }));
            },
            
            // WebSocket message event handler
            async onWebSocketMessage(event) {
                try {
                    const message = JSON.parse(event.data);
                    console.log("Received message:", message);
                    
                    switch (message.type) {
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
                                
                                // Create peer connection for new user
                                await this.createPeerConnection(message.user_id, message.username);
                                
                                // If we're the mentor or the other user is the mentor, send an offer
                                if (userRole === 'mentor' || message.role === 'mentor') {
                                    const offer = await this.peerConnections[message.user_id].createOffer();
                                    await this.peerConnections[message.user_id].setLocalDescription(offer);
                                    
                                    this.websocket.send(JSON.stringify({
                                        type: 'offer',
                                        target: message.user_id,
                                        user_id: userId,
                                        sdp: this.peerConnections[message.user_id].localDescription
                                    }));
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
                                if (!this.peerConnections[message.user_id]) {
                                    const username = this.otherParticipants.find(p => p.id === message.user_id)?.username || 'Unknown';
                                    await this.createPeerConnection(message.user_id, username);
                                }
                                
                                // Set remote description
                                await this.peerConnections[message.user_id].setRemoteDescription(new RTCSessionDescription(message.sdp));
                                
                                // Create answer
                                const answer = await this.peerConnections[message.user_id].createAnswer();
                                await this.peerConnections[message.user_id].setLocalDescription(answer);
                                
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
                    // ICE servers configuration
                    const configuration = {
                        iceServers: [
                            { urls: iceServers.stun }
                        ]
                    };
                    
                    // Add TURN server if provided
                    if (iceServers.turn) {
                        configuration.iceServers.push({
                            urls: iceServers.turn,
                            username: iceServers.turnUsername,
                            credential: iceServers.turnCredential
                        });
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
                        
                        // Find or create video element for this user
                        let videoElement = document.getElementById(`video-${userId}`);
                        if (!videoElement) {
                            videoElement = document.createElement('video');
                            videoElement.id = `video-${userId}`;
                            videoElement.autoplay = true;
                            videoElement.playsInline = true;
                            videoElement.muted = false;
                            videoElement.classList.add('remote-video');
                            
                            // Add video element to DOM
                            const participantsContainer = document.getElementById('participants-videos');
                            if (participantsContainer) {
                                const videoContainer = document.createElement('div');
                                videoContainer.classList.add('participant-tile');
                                videoContainer.id = `video-container-${userId}`;
                                
                                const usernameLabel = document.createElement('div');
                                usernameLabel.classList.add('username-label');
                                usernameLabel.textContent = username;
                                
                                videoContainer.appendChild(videoElement);
                                videoContainer.appendChild(usernameLabel);
                                participantsContainer.appendChild(videoContainer);
                            }
                        }
                        
                        // Set remote stream
                        videoElement.srcObject = event.streams[0];
                    };
                    
                } catch (error) {
                    console.error(`Error creating peer connection for ${username}:`, error);
                    throw error;
                }
            },
            
            // Request user media (camera and microphone)
            async requestUserMedia() {
                try {
                    console.log("Requesting access to camera and microphone...");
                    
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
                    
                    // Try multiple fallbacks in case of issues - start with simpler constraints first
                    let stream = null;
                    const fallbackOptions = [
                        // Option 1: Basic video/audio (most compatible)
                        {
                            audio: true,
                            video: true
                        },
                        // Option 2: Low resolution video
                        {
                            audio: true,
                            video: {
                                width: { ideal: 640 },
                                height: { ideal: 480 },
                                frameRate: { ideal: 15 }
                            }
                        },
                        // Option 3: HD constraints
                        {
                            audio: true,
                            video: {
                                width: { ideal: 1280 },
                                height: { ideal: 720 },
                                facingMode: 'user'
                            }
                        },
                        // Option 4: Audio only with video placeholder (last resort)
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
                                const localVideoElement = document.getElementById('local-video');
                                if (localVideoElement) {
                                    localVideoElement.srcObject = stream;
                                    localVideoElement.onloadedmetadata = () => {
                                        localVideoElement.play().catch(e => console.error("Error playing local video:", e));
                                    };
                                }
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
                
                // Notify other participants about media status change
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    console.log("Sending media status update to peers");
                    this.websocket.send(JSON.stringify({
                        type: 'media_status',
                        user_id: userId,
                        username: userName,
                        audioEnabled: this.audioEnabled,
                        videoEnabled: this.videoEnabled
                    }));
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
                
                // Notify other participants about media status change
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    console.log("Sending media status update to peers");
                    this.websocket.send(JSON.stringify({
                        type: 'media_status',
                        user_id: userId,
                        username: userName,
                        audioEnabled: this.audioEnabled,
                        videoEnabled: this.videoEnabled
                    }));
                }
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