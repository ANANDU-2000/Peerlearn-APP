/**
 * Premium WebRTC implementation for PeerLearn room
 * 
 * This implementation uses improved error handling, reconnection logic,
 * robust ICE server configuration, and works with both the SessionConsumer
 * and any new RoomConsumer implementations.
 */

document.addEventListener('alpine:init', () => {
    Alpine.data('webRTCRoom', () => ({
        // Connection state
        localStream: null,
        remoteStream: null,
        peerConnection: null,
        sessionStatus: 'connecting',
        connectionAttempts: 0,
        maxConnectionAttempts: 5,
        reconnectDelay: 2000,
        isConnected: false,
        isLocalStreamReady: false,
        isRemoteStreamReady: false,
        
        // User state
        USER_ROLE: userRole,
        USER_ID: userId,
        videoEnabled: true,
        audioEnabled: true,
        isScreenSharing: false,
        screenStream: null,
        
        // Remote user state
        remoteUserName: null,
        remoteUserRole: null,
        remoteVideoEnabled: true,
        isRemoteMuted: false,
        
        // Session timing
        sessionStartTime: null,
        sessionTime: '00:00:00',
        sessionTimer: null,
        
        // Feedback
        showFeedbackModal: false,
        rating: 0,
        feedbackText: '',
        
        // WebSocket
        socket: null,
        socketReconnectTimer: null,
        socketConnected: false,
        
        /**
         * Initialize the room
         */
        init() {
            console.log('Initializing WebRTC room with role:', this.USER_ROLE);
            
            // Show appropriate roles
            this.remoteUserRole = this.USER_ROLE === 'mentor' ? 'learner' : 'mentor';
            
            // Set initial name for remote user based on role
            this.remoteUserName = this.USER_ROLE === 'mentor' ? 'Learner' : 'Mentor';
            
            // Initialize ICE servers from Django context
            this.iceServers = iceServers || [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ];
            
            // Check browser support for WebRTC
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.showError('Your browser does not support video calls. Please use a modern browser like Chrome, Firefox, or Safari.');
                return;
            }
            
            // Initialize WebSocket connection
            this.initializeWebSocket();
            
            // Start local media stream
            this.initializeLocalStream();
            
            // Set up session timer
            this.startSessionTimer();
            
            // Setup event listeners
            window.addEventListener('beforeunload', () => this.handleBeforeUnload());
            
            // Handle errors and retries
            window.addEventListener('error', (e) => {
                console.error('Global error:', e);
                this.showError('An error occurred. Please refresh the page if video doesn\'t connect.');
            });
            
            // Log initialization complete
            console.log('Room initialization complete');
        },
        
        /**
         * Initialize the WebSocket connection for signaling
         */
        initializeWebSocket() {
            // Close any existing socket
            if (this.socket) {
                this.socket.close();
            }
            
            // Get room code from URL path or the class property
            const pathRoomCode = window.location.pathname.split('/').filter(Boolean).pop();
            this.roomCode = pathRoomCode;
            
            // Try multiple endpoints for compatibility with different consumer implementations
            // Make sure they match the patterns in apps/learning_sessions/routing.py
            const wsEndpoints = [
                `/ws/session/${this.roomCode}/`,   // Primary endpoint (listed first)
                `/ws/sessions/${this.roomCode}/`,
                `/ws/room/${this.roomCode}/`
            ];
            
            console.log('Room code for WebSocket connection:', this.roomCode);
            
            // Try the first endpoint
            this.connectToWebSocketEndpoint(wsEndpoints, 0);
            
            // Set up reconnection mechanism
            this.socketReconnectAttempts = 0;
            this.maxSocketReconnectAttempts = 5;
            
            // Start periodic ping to keep the WebSocket alive
            this.startWebSocketPing();
        },
        
        /**
         * Start periodic ping to keep WebSocket connection alive
         */
        startWebSocketPing() {
            // Clear any existing ping interval
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
            }
            
            // Set up new ping interval
            this.pingInterval = setInterval(() => {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.sendSignal({ type: 'ping' });
                    console.log('Sent WebSocket ping to keep connection alive');
                }
            }, 30000); // 30 seconds
        },
        
        /**
         * Try connecting to each WebSocket endpoint in order
         */
        connectToWebSocketEndpoint(endpoints, index) {
            if (index >= endpoints.length) {
                console.error('Failed to connect to any WebSocket endpoint');
                this.showError('Failed to connect to session. Please refresh the page and try again.');
                return;
            }
            
            // Set up the WebSocket endpoint URL
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}${endpoints[index]}`;
            
            console.log(`Trying WebSocket endpoint (${index + 1}/${endpoints.length}):`, wsUrl);
            
            this.socket = new WebSocket(wsUrl);
            
            // Set up socket event handlers
            this.socket.onopen = (event) => {
                console.log('WebSocket connected successfully to:', wsUrl);
                console.log('WebSocket readyState:', this.socket.readyState);
                
                // Update the connection status immediately
                this.socketConnected = true;
                
                // Show a success message to the user
                this.showSuccessMessage('Connected to session room. Setting up secure video connection...');
                
                // Send join event with both format versions for compatibility
                try {
                    this.sendSignal({
                        type: 'join',
                        user_id: this.USER_ID,
                        user_role: this.USER_ROLE,
                        user_name: userName, 
                        username: userName // For compatibility with older consumer
                    });
                    console.log('Join signal sent successfully');
                } catch (error) {
                    console.error('Error sending join signal:', error);
                }
                
                // Clear any reconnect timers
                if (this.socketReconnectTimer) {
                    clearTimeout(this.socketReconnectTimer);
                    this.socketReconnectTimer = null;
                }
                
                // Reset connection attempts
                this.connectionAttempts = 0;
            };
            
            this.socket.onclose = (event) => {
                console.log('WebSocket closed:', event);
                this.socketConnected = false;
                
                // If never connected successfully, try next endpoint
                if (event.code === 1006 && !this.isConnected) {
                    this.connectToWebSocketEndpoint(endpoints, index + 1);
                    return;
                }
                
                // Attempt to reconnect to the same endpoint
                if (this.connectionAttempts < this.maxConnectionAttempts) {
                    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.connectionAttempts), 10000);
                    console.log(`Reconnecting in ${delay / 1000} seconds (attempt ${this.connectionAttempts + 1}/${this.maxConnectionAttempts})`);
                    
                    this.socketReconnectTimer = setTimeout(() => {
                        this.connectionAttempts++;
                        this.connectToWebSocketEndpoint(endpoints, index);
                    }, delay);
                } else {
                    console.error('Maximum reconnection attempts reached');
                    this.showError('Connection lost. Please refresh the page.');
                }
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
            this.socket.onmessage = (event) => {
                this.handleSignalingMessage(event);
            };
        },
        
        /**
         * Initialize the local media stream (camera & microphone) with enhanced error handling and fallbacks
         */
        async initializeLocalStream() {
            // Show loading indicator to improve user experience while camera initializes
            this.showStatusMessage('Initializing camera and microphone...');
            
            const setupLocalVideo = (stream) => {
                // Helper function to configure local video element with better error handling and retries
                const configureLocalVideo = (attempts = 0) => {
                    const localVideo = document.getElementById('local-video');
                    if (!localVideo) {
                        console.error('Local video element not found');
                        if (attempts < 5) {  // Increased retry attempts
                            setTimeout(() => configureLocalVideo(attempts + 1), 300);  // Faster retry
                        } else {
                            this.showError('Video element not found. Please refresh the page.');
                        }
                        return;
                    }
                    
                    try {
                        // Set the stream as source for video element
                        localVideo.srcObject = stream;
                        
                        // Enhanced configuration for cross-browser compatibility
                        localVideo.setAttribute('autoplay', 'true');
                        localVideo.setAttribute('playsinline', 'true');
                        localVideo.setAttribute('muted', 'true');
                        localVideo.setAttribute('disablePictureInPicture', 'true');  // Prevent PiP which can cause issues
                        
                        // Force muted for local video (critical browser safety requirement)
                        localVideo.muted = true;
                        
                        // Set up loaded metadata event for playback with better error handling
                        localVideo.onloadedmetadata = () => {
                            console.log('Local video metadata loaded, height:', localVideo.videoHeight, 'width:', localVideo.videoWidth);
                            
                            // Improved play error handling with auto-recovery
                            const attemptAutoPlay = (playAttempts = 0) => {
                                localVideo.play()
                                    .then(() => {
                                        console.log('Local video playing successfully');
                                        // Signal success to update UI indicators
                                        this.isLocalStreamReady = true;
                                        this.showStatusMessage('');  // Clear status message
                                        
                                        // Dispatch event that video is actually playing
                                        document.dispatchEvent(new CustomEvent('localVideoPlaying'));
                                    })
                                    .catch(error => {
                                        console.error('Error playing local video:', error);
                                        if (playAttempts < 3) {
                                            // Auto-retry play with delay
                                            setTimeout(() => attemptAutoPlay(playAttempts + 1), 200);
                                            return;
                                        }
                                        
                                        if (error.name === 'NotAllowedError') {
                                            // Show user-friendly error message and add click handler
                                            this.showStatusMessage('Click the video to enable playback');
                                            localVideo.onclick = () => {
                                                localVideo.play()
                                                    .then(() => {
                                                        this.isLocalStreamReady = true;
                                                        this.showStatusMessage('');
                                                    })
                                                    .catch(e => console.error('Play on click failed:', e));
                                            };
                                        }
                                    });
                            };
                            
                            // Start auto-play attempt
                            attemptAutoPlay();
                        };
                        
                        // Enhanced error handler
                        localVideo.onerror = (event) => {
                            console.error('Local video element error:', event);
                            this.showError('Video playback error. Please check your camera permissions.');
                        };
                        
                        console.log('Local video stream attached successfully');
                    } catch (err) {
                        console.error('Error attaching local stream to video element:', err);
                        if (attempts < 5) {
                            setTimeout(() => configureLocalVideo(attempts + 1), 300);
                        } else {
                            this.showError('Could not display your camera. Please refresh and try again.');
                        }
                    }
                };
                
                // Start the local video configuration
                configureLocalVideo();
            };
            
            // Main media access logic with improved constraints and fallbacks
            try {
                console.log('Requesting camera and microphone access...');
                
                // Try with ideal constraints first
                try {
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280, min: 640 },
                            height: { ideal: 720, min: 360 },
                            framerate: { ideal: 30, min: 15 },
                            facingMode: 'user'
                        },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                } catch (initialError) {
                    console.warn('Failed to get media with ideal constraints, trying fallback:', initialError);
                    
                    // Fallback to minimal constraints
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: true
                    });
                }
                
                // Verify camera is working and ready
                const videoTracks = this.localStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    console.log(`Using video device: ${videoTracks[0].label}`);
                    
                    // Pre-warm camera - critical for synchronization
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // Check if track is actually live
                    if (!videoTracks[0].enabled || videoTracks[0].muted) {
                        console.warn('Video track not fully enabled, attempting to fix');
                        videoTracks[0].enabled = true;
                    }
                }
                
                // Set up local video with the stream
                setupLocalVideo(this.localStream);
                
                // Update state variables
                this.videoEnabled = true;
                this.audioEnabled = true;
                
                // Initialize peer connection IMMEDIATELY once camera is ready
                this.initializePeerConnection();
                
                // Speed up connection process by creating offer/answer sooner
                if (this.USER_ROLE === 'mentor') {
                    console.log('Creating offer immediately after camera initialization');
                    if (!this.offerInProgress) {
                        setTimeout(() => this.createOffer(), 300);  // Reduced delay
                    }
                } else if (this.receivedInitialOffer) {
                    console.log('Creating answer immediately after getting media');
                    setTimeout(() => this.createAnswer(), 500);
                }
                
                console.log('Local stream initialized successfully with video and audio');
                
            } catch (initialError) {
                console.error('Error with preferred media constraints:', initialError);
                
                // Determine fallback strategy based on error
                if (initialError.name === 'NotAllowedError' || initialError.name === 'PermissionDeniedError') {
                    this.showError('Camera or microphone permission denied. Please check browser permissions and refresh.');
                    
                    // Try with audio only
                    try {
                        console.log('Attempting audio-only fallback...');
                        this.localStream = await navigator.mediaDevices.getUserMedia({
                            video: false,
                            audio: {
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true
                            }
                        });
                        
                        // Set up audio-only interface
                        setupLocalVideo(this.localStream);
                        
                        this.videoEnabled = false;
                        this.audioEnabled = true;
                        this.isLocalStreamReady = true;
                        
                        // Initialize peer connection with audio only
                        this.initializePeerConnection();
                        
                        // Create offer or answer faster to improve synchronization even in audio-only mode
                        if (this.USER_ROLE === 'mentor') {
                            console.log('Creating audio-only offer immediately');
                            if (!this.offerInProgress) {
                                setTimeout(() => this.createOffer(), 500);
                            }
                        } else if (this.receivedInitialOffer) {
                            console.log('Creating audio-only answer immediately');
                            setTimeout(() => this.createAnswer(), 500);
                        }
                        
                        console.log('Fallback to audio-only successful');
                        this.showSuccessMessage('Connected with audio only. Video is disabled.');
                        
                    } catch (audioError) {
                        console.error('Error accessing audio devices:', audioError);
                        this.showError('Cannot access microphone. Please check browser permissions and refresh.');
                    }
                    
                } else if (initialError.name === 'NotFoundError' || initialError.name === 'DevicesNotFoundError') {
                    // No devices available - try with no media but still connect
                    this.showError('No camera or microphone found. You can still receive the session but cannot send audio/video.');
                    
                    this.videoEnabled = false;
                    this.audioEnabled = false;
                    this.isLocalStreamReady = false;
                    
                    // Still initialize peer connection for receiving
                    this.initializePeerConnection();
                    
                } else if (initialError.name === 'OverconstrainedError') {
                    // Try again with minimal constraints
                    try {
                        console.log('Retrying with minimal constraints...');
                        this.localStream = await navigator.mediaDevices.getUserMedia({
                            video: true,
                            audio: true
                        });
                        
                        setupLocalVideo(this.localStream);
                        
                        this.isLocalStreamReady = true;
                        this.videoEnabled = true;
                        this.audioEnabled = true;
                        
                        this.initializePeerConnection();
                        
                        console.log('Fallback to minimal constraints successful');
                        
                    } catch (fallbackError) {
                        console.error('Error with fallback constraints:', fallbackError);
                        this.showError('Camera or microphone issue. Please check your devices and refresh.');
                    }
                } else {
                    // Generic error handling for other cases
                    this.showError('Error accessing media devices. Please check if another app is using your camera/microphone.');
                }
            }
        },
        
        /**
         * Initialize the WebRTC peer connection
         */
        initializePeerConnection() {
            try {
                // Close any existing peer connection
                if (this.peerConnection) {
                    console.log('Closing existing peer connection');
                    // Remove all event listeners before closing to prevent lingering references
                    this.peerConnection.onicecandidate = null;
                    this.peerConnection.oniceconnectionstatechange = null;
                    this.peerConnection.onicegatheringstatechange = null;
                    this.peerConnection.ontrack = null;
                    this.peerConnection.onnegotiationneeded = null;
                    this.peerConnection.onconnectionstatechange = null;
                    this.peerConnection.onsignalingstatechange = null;
                    
                    // Close the connection
                    this.peerConnection.close();
                    this.peerConnection = null;
                }
                
                // Enhanced ICE server configuration with multiple STUN/TURN options
                // Using multiple public STUN servers for better NAT traversal
                const enhancedIceServers = this.iceServers || [
                    // Google's public STUN servers
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    // Additional STUN servers for better connectivity
                    { urls: 'stun:stun.stunprotocol.org:3478' },
                    { urls: 'stun:stun.voip.blackberry.com:3478' }
                ];
                
                console.log('Creating new peer connection with enhanced ICE server configuration');
                
                // Create new RTCPeerConnection with enhanced configuration
                this.peerConnection = new RTCPeerConnection({
                    iceServers: enhancedIceServers,
                    iceTransportPolicy: 'all',
                    iceCandidatePoolSize: 10, // Increase candidate pool for better connectivity
                    bundlePolicy: 'max-bundle', // Optimize for bundling
                    rtcpMuxPolicy: 'require', // Require RTCP multiplexing
                    sdpSemantics: 'unified-plan' // Ensure future compatibility
                });
                
                console.log('Peer connection initialized with ICE servers:', enhancedIceServers);
                
                // Set up connection state tracking variables
                this.iceCandidatesGathered = 0;
                this.hasRemoteDescription = false;
                this.connectionEstablished = false;
                
                // Add local stream tracks to the peer connection
                if (this.localStream) {
                    console.log('Adding local tracks to peer connection...');
                    const trackPromises = [];
                    
                    this.localStream.getTracks().forEach(track => {
                        try {
                            const sender = this.peerConnection.addTrack(track, this.localStream);
                            console.log(`Added ${track.kind} track to peer connection`);
                            
                            // Store track sender for later reference (useful for replacing tracks)
                            if (track.kind === 'video') {
                                this.videoSender = sender;
                            } else if (track.kind === 'audio') {
                                this.audioSender = sender;
                            }
                        } catch (err) {
                            console.error(`Error adding ${track.kind} track:`, err);
                        }
                    });
                } else {
                    console.warn('No local stream available when initializing peer connection');
                    // We can still receive remote stream even without local tracks
                }
                
                // Monitor connection state for more reliable connection tracking
                this.peerConnection.onconnectionstatechange = () => {
                    const state = this.peerConnection.connectionState;
                    console.log('Connection state changed:', state);
                    
                    // Update UI with connection state
                    this.updateConnectionStatus(`Connection: ${state}`);
                    
                    switch (state) {
                        case 'connected':
                            this.connectionEstablished = true;
                            this.showSuccessMessage('Connection established successfully!');
                            // Reset failure counter on successful connection
                            this.connectionFailureCount = 0;
                            break;
                            
                        case 'disconnected':
                        case 'failed':
                            // Handle disconnection or failure
                            if (this.connectionEstablished) {
                                this.handleConnectionLoss(state);
                            }
                            break;
                            
                        case 'closed':
                            // Connection was intentionally closed
                            this.connectionEstablished = false;
                            break;
                    }
                };
                
                // Monitor signaling state for debugging and recovery
                this.peerConnection.onsignalingstatechange = () => {
                    console.log('Signaling state changed:', this.peerConnection.signalingState);
                    
                    // If we get stuck in a bad signaling state, try to recover
                    if (this.peerConnection.signalingState === 'closed') {
                        console.warn('Signaling state closed unexpectedly - reinitializing connection');
                        setTimeout(() => this.initializePeerConnection(), 1000);
                    }
                };
                
                // Handle ICE candidates with enhanced logic and trickle ICE
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        // Log candidate details for debugging
                        const candidateInfo = event.candidate.candidate || 'unknown';
                        const shortCandidateInfo = candidateInfo.length > 50 ? 
                            candidateInfo.substr(0, 50) + '...' : candidateInfo;
                            
                        console.log('ICE candidate generated:', shortCandidateInfo);
                        this.iceCandidatesGathered++;
                        
                        // Send the ICE candidate to the other peer via WebSocket immediately
                        // (implementing trickle ICE for faster connection establishment)
                        this.sendSignal({
                            type: 'ice_candidate',
                            candidate: event.candidate
                        });
                    } else {
                        console.log('ICE candidate gathering complete, gathered', this.iceCandidatesGathered, 'candidates');
                    }
                };
                
                // Enhanced ICE gathering state monitoring
                this.peerConnection.onicegatheringstatechange = () => {
                    const state = this.peerConnection.iceGatheringState;
                    console.log('ICE gathering state:', state);
                    
                    if (state === 'complete') {
                        console.log('ICE gathering complete - total candidates:', this.iceCandidatesGathered);
                        
                        // If we gathered very few candidates, we might have network issues
                        if (this.iceCandidatesGathered < 2 && !this.connectionEstablished) {
                            console.warn('Very few ICE candidates gathered - possible network issue');
                            this.showError('Network connectivity issue detected. Check your internet connection.');
                        }
                    }
                };
                
                // Handle ICE connection state changes with advanced recovery logic
                this.peerConnection.oniceconnectionstatechange = () => {
                    const state = this.peerConnection.iceConnectionState;
                    console.log('ICE connection state changed:', state);
                    
                    // Update UI indicator for connection status
                    const connectionStatusIndicator = document.getElementById('connection-status');
                    if (connectionStatusIndicator) {
                        connectionStatusIndicator.className = `connection-status-${state}`;
                        connectionStatusIndicator.textContent = `Connection: ${state}`;
                    }
                    
                    // Handle different ICE connection states
                    switch (state) {
                        case 'checking':
                            console.log('Checking ICE connection...');
                            // Show checking status to user
                            this.updateConnectionStatus('Establishing connection...');
                            break;
                            
                        case 'connected':
                        case 'completed':
                            console.log('ICE connection established');
                            this.isConnected = true;
                            this.sessionStatus = 'live';
                            this.connectionEstablished = true;
                            
                            // Play notification sound for successful connection
                            this.playNotificationSound();
                            
                            // Clear any reconnection attempts
                            if (this.reconnectionTimer) {
                                clearTimeout(this.reconnectionTimer);
                                this.reconnectionTimer = null;
                            }
                            
                            // Reset failure counter on successful connection
                            this.connectionFailureCount = 0;
                            
                            // Update UI to show connected state
                            this.showSuccessMessage('Connection established successfully!');
                            break;
                            
                        case 'failed':
                            console.warn('ICE connection failed, attempting to restart');
                            this.handleConnectionFailure('failed');
                            break;
                            
                        case 'disconnected':
                            console.warn('ICE connection disconnected, scheduling reconnection attempt');
                            this.handleConnectionLoss('disconnected');
                            break;
                            
                        case 'closed':
                            console.log('ICE connection closed');
                            this.isConnected = false;
                            break;
                    }
                };
                
                // Handle remote track (when other peer adds stream)
                this.peerConnection.ontrack = (event) => {
                    console.log('Remote track received:', event.track.kind);
                    
                    // Show notification when remote track arrives
                    if (event.track.kind === 'video') {
                        this.showSuccessMessage('Remote video connected!');
                        this.playNotificationSound();
                    }
                    
                    // Set the remote stream
                    this.remoteStream = event.streams[0];
                    
                    // Track when remote tracks get muted/unmuted
                    event.track.onmute = () => {
                        console.log(`Remote ${event.track.kind} track muted`);
                        if (event.track.kind === 'video') {
                            this.remoteVideoEnabled = false;
                            // Update connection status
                            this.updateConnectionStatus('Remote video muted');
                        } else if (event.track.kind === 'audio') {
                            this.remoteAudioEnabled = false;
                            this.isRemoteMuted = true;
                        }
                    };
                    
                    event.track.onunmute = () => {
                        console.log(`Remote ${event.track.kind} track unmuted`);
                        if (event.track.kind === 'video') {
                            this.remoteVideoEnabled = true;
                            // Update connection status
                            this.updateConnectionStatus('Remote video available');
                        } else if (event.track.kind === 'audio') {
                            this.remoteAudioEnabled = true;
                            this.isRemoteMuted = false;
                        }
                    };
                    
                    // Display the remote stream with enhanced error handling and retry logic
                    const displayRemoteStreamWithRetry = (attemptCount = 0) => {
                        console.log(`Attempting to display remote stream (attempt ${attemptCount + 1})`);
                        
                        const mainVideo = document.getElementById('main-video');
                        if (!mainVideo) {
                            console.error('Main video element not found');
                            // Try again after a delay if this is not the last attempt
                            if (attemptCount < 3) {
                                setTimeout(() => displayRemoteStreamWithRetry(attemptCount + 1), 1000);
                            } else {
                                this.showError('Error displaying remote video. Please refresh the page.');
                            }
                            return;
                        }
                        
                        try {
                            // Store current time position if replacing an existing stream
                            const currentTime = mainVideo.currentTime;
                            
                            // Verify the stream is valid
                            if (!this.remoteStream) {
                                console.error('Remote stream is null or undefined');
                                if (attemptCount < 3) {
                                    setTimeout(() => displayRemoteStreamWithRetry(attemptCount + 1), 1000);
                                } else {
                                    this.showError('Remote video stream not available. Please try again.');
                                }
                                return;
                            }
                            
                            console.log('Remote stream info:', {
                                active: this.remoteStream.active,
                                id: this.remoteStream.id,
                                tracks: this.remoteStream.getTracks().map(t => ({
                                    kind: t.kind,
                                    enabled: t.enabled,
                                    readyState: t.readyState
                                }))
                            });
                            
                            // Set the new stream
                            mainVideo.srcObject = this.remoteStream;
                            
                            // Enhanced event listeners
                            mainVideo.onloadedmetadata = () => {
                                console.log('Remote video metadata loaded');
                                
                                // Try to restore playback position
                                if (currentTime > 0) {
                                    mainVideo.currentTime = currentTime;
                                }
                                
                                // Ensure video starts playing with retry logic
                                const tryPlay = (playAttempt = 0) => {
                                    console.log(`Trying to play remote video (attempt ${playAttempt + 1})`);
                                    const playPromise = mainVideo.play();
                                    
                                    if (playPromise !== undefined) {
                                        playPromise
                                            .then(() => {
                                                console.log('Remote video playback started successfully');
                                                this.showSuccessMessage('Remote video connected!');
                                                
                                                // Update state and UI when playback succeeds
                                                this.remoteVideoEnabled = true;
                                                this.isRemoteStreamReady = true;
                                                
                                                // Update placeholder visibility
                                                this.updateVideoPlaceholder();
                                            })
                                            .catch(error => {
                                                console.error('Error playing remote video:', error);
                                                
                                                // If autoplay was prevented, try again or show guidance
                                                if (playAttempt < 2) {
                                                    console.log('Retrying play after autoplay failure...');
                                                    setTimeout(() => tryPlay(playAttempt + 1), 1000);
                                                } else {
                                                    if (error.name === 'NotAllowedError') {
                                                        this.showError('Autoplay was blocked. Please click the video to start playback.');
                                                        
                                                        // Add a click handler to the video to allow manual play
                                                        mainVideo.onclick = () => {
                                                            mainVideo.play()
                                                                .then(() => {
                                                                    console.log('Video played after user interaction');
                                                                    this.remoteVideoEnabled = true;
                                                                    this.updateVideoPlaceholder();
                                                                })
                                                                .catch(e => console.error('Play after click failed:', e));
                                                        };
                                                    } else {
                                                        this.showError('Error playing remote video. Please refresh the page.');
                                                    }
                                                }
                                            });
                                    }
                                };
                                
                                // Start the play attempt chain
                                tryPlay();
                            };
                            
                            // Additional event listeners for reliable video display
                            mainVideo.oncanplay = () => {
                                console.log('Remote video can start playing');
                            };
                            
                            mainVideo.onerror = (error) => {
                                console.error('Video element error:', error);
                                
                                // Try again if there was an error
                                if (attemptCount < 3) {
                                    setTimeout(() => displayRemoteStreamWithRetry(attemptCount + 1), 1000);
                                } else {
                                    this.showError('Video playback error. Please refresh the page.');
                                }
                            };
                            
                            // Set video element attributes for better performance
                            mainVideo.setAttribute('autoplay', 'true');
                            mainVideo.setAttribute('playsinline', 'true');
                            
                            // Log successful remote stream attachment
                            console.log('Remote video stream attached successfully');
                            
                        } catch (error) {
                            console.error('Error setting up remote video:', error);
                            
                            // Try again if there was an exception
                            if (attemptCount < 3) {
                                setTimeout(() => displayRemoteStreamWithRetry(attemptCount + 1), 1000);
                            } else {
                                this.showError('Failed to display remote video. Please refresh the page.');
                            }
                        }
                    };
                    
                    // Helper method to update video placeholder visibility
                    this.updateVideoPlaceholder = () => {
                        const videoPlaceholder = document.querySelector('.video-placeholder');
                        if (videoPlaceholder) {
                            videoPlaceholder.style.display = this.remoteVideoEnabled ? 'none' : 'flex';
                        }
                    };
                    
                    // Start the display attempt
                    displayRemoteStreamWithRetry();
                    
                    // Update state variables
                    this.isRemoteStreamReady = true;
                    this.remoteVideoEnabled = event.track.kind === 'video' ? true : this.remoteVideoEnabled;
                    this.remoteAudioEnabled = event.track.kind === 'audio' ? true : this.remoteAudioEnabled;
                };
                
                // Create offer if this is the mentor (initiator)
                if (this.USER_ROLE === 'mentor') {
                    this.createOffer();
                }
                
            } catch (error) {
                console.error('Error initializing peer connection:', error);
                this.showError('Error setting up connection. Please refresh the page.');
            }
        },
        
        /**
         * Create and send an SDP offer (initiator)
         */
        async createOffer() {
            if (!this.peerConnection) {
                console.error('Cannot create offer: Peer connection not initialized');
                return;
            }
            
            try {
                // Create an offer with constraints for full audio/video reception
                const offer = await this.peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                    voiceActivityDetection: false // Disable VAD for better audio
                });
                
                // Set the local description
                await this.peerConnection.setLocalDescription(offer);
                
                console.log('Offer created and set as local description');
                
                // Send the offer to the remote peer
                this.sendSignal({
                    type: 'offer',
                    sdp: offer
                });
                
                // Set a timeout to recreate the offer if no answer received
                setTimeout(() => {
                    if (this.peerConnection.connectionState !== 'connected' && 
                        this.peerConnection.iceConnectionState !== 'connected') {
                        console.log('No answer received, recreating offer...');
                        this.restartIce();
                    }
                }, 10000); // 10 seconds timeout
            } catch (error) {
                console.error('Error creating offer:', error);
                this.showError('Error creating connection offer. Please try again.');
            }
        },
        
        /**
         * Handle an SDP offer (recipient)
         */
        async handleOffer(offer) {
            if (!this.peerConnection) {
                console.error('Cannot handle offer: Peer connection not initialized');
                return;
            }
            
            try {
                // Set the remote description
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                
                console.log('Offer set as remote description');
                
                // Create an answer
                const answer = await this.peerConnection.createAnswer();
                
                // Set the local description
                await this.peerConnection.setLocalDescription(answer);
                
                console.log('Answer created and set as local description');
                
                // Send the answer back to the offerer
                this.sendSignal({
                    type: 'answer',
                    sdp: answer
                });
            } catch (error) {
                console.error('Error handling offer:', error);
                this.showError('Error responding to connection offer. Please refresh.');
            }
        },
        
        /**
         * Handle an SDP answer (initiator)
         */
        async handleAnswer(answer) {
            if (!this.peerConnection) {
                console.error('Cannot handle answer: Peer connection not initialized');
                return;
            }
            
            try {
                // Set the remote description
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                
                console.log('Answer set as remote description');
            } catch (error) {
                console.error('Error handling answer:', error);
                this.showError('Error establishing connection. Please refresh.');
            }
        },
        
        /**
         * Handle an ICE candidate from remote peer
         */
        async handleIceCandidate(candidate) {
            if (!this.peerConnection) {
                console.error('Cannot handle ICE candidate: Peer connection not initialized');
                return;
            }
            
            try {
                // Add the ICE candidate to the peer connection
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                
                console.log('ICE candidate added successfully');
            } catch (error) {
                console.error('Error handling ICE candidate:', error);
            }
        },
        
        /**
         * Handle incoming WebSocket signaling messages
         */
        handleSignalingMessage(event) {
            try {
                const message = JSON.parse(event.data);
                
                console.log('Signaling message received:', message.type);
                
                // Handle messages from different consumer implementations
                switch (message.type) {
                    // WebRTC messages
                    case 'offer':
                        this.handleOffer(message.sdp);
                        break;
                        
                    case 'answer':
                        this.handleAnswer(message.sdp);
                        break;
                        
                    case 'ice_candidate':
                        this.handleIceCandidate(message.candidate);
                        break;
                    
                    // Compatibility with SessionConsumer
                    case 'signaling_message':
                        // Handle signaling messages from SessionConsumer
                        const signalingMessage = message.message;
                        if (signalingMessage.type === 'offer') {
                            this.handleOffer(signalingMessage.sdp);
                        } else if (signalingMessage.type === 'answer') {
                            this.handleAnswer(signalingMessage.sdp);
                        } else if (signalingMessage.type === 'ice_candidate') {
                            this.handleIceCandidate(signalingMessage.candidate);
                        }
                        break;
                        
                    // Compatibility with SessionConsumer and RoomConsumer
                    case 'user_join':
                    case 'user_joined':
                        // Update remote user info
                        this.remoteUserName = message.username || message.user_name;
                        this.remoteUserRole = message.user_role;
                        
                        // Play notification sound
                        this.playNotificationSound();
                        
                        // If this is the receiver (learner), wait for offer
                        console.log('User joined:', this.remoteUserName, 'with role', this.remoteUserRole);
                        break;
                        
                    // Handle ICE restart request from learner
                    case 'request_ice_restart':
                        console.log('ICE restart requested by remote peer');
                        if (this.USER_ROLE === 'mentor') {
                            // Only mentors should respond to restart requests
                            this.restartIce();
                        }
                        break;
                        
                    case 'user_leave':
                    case 'user_left':
                        console.log('User left:', message.username || message.user_name);
                        this.showError(`${message.username || message.user_name} has left the session.`);
                        
                        // Clear remote stream and user info
                        this.remoteStream = null;
                        this.isRemoteStreamReady = false;
                        
                        const mainVideo = document.getElementById('main-video');
                        if (mainVideo) {
                            mainVideo.srcObject = null;
                        }
                        break;
                        
                    case 'session_ended':
                        console.log('Session ended');
                        this.showFeedbackModal = true;
                        break;
                        
                    case 'media_status':
                        if (message.media_type === 'video') {
                            this.remoteVideoEnabled = message.enabled;
                        } else if (message.media_type === 'audio') {
                            this.isRemoteMuted = !message.enabled;
                        } else if (message.videoEnabled !== undefined) {
                            // Legacy format
                            this.remoteVideoEnabled = message.videoEnabled;
                        }
                        break;
                        
                    case 'ping':
                        // Respond to ping with pong
                        this.sendSignal({
                            type: 'pong'
                        });
                        break;
                        
                    default:
                        console.warn('Unknown signaling message type:', message.type);
                }
            } catch (error) {
                console.error('Error handling signaling message:', error);
            }
        },
        
        /**
         * Send a signaling message via WebSocket with enhanced auto-reconnect
         */
        sendSignal(data) {
            const MAX_RETRIES = 3; // Maximum retries for sending signal
            const RETRY_INTERVAL = 1000; // 1 second between retries
            
            const attemptSend = (attempt = 0) => {
                // Check if websocket exists and is open
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    console.warn('WebSocket not ready - state:', this.socket ? this.socket.readyState : 'No socket');
                    
                    // If socket doesn't exist or is closed and we're not at max retries
                    if (attempt < MAX_RETRIES) {
                        console.log(`Attempting WebSocket reconnection before sending signal (attempt ${attempt+1}/${MAX_RETRIES})...`);
                        
                        // Wait for existing socket to close if it's closing
                        if (this.socket && this.socket.readyState === WebSocket.CLOSING) {
                            console.log('Waiting for existing socket to close completely...');
                            setTimeout(() => attemptSend(attempt + 1), RETRY_INTERVAL);
                            return;
                        }
                        
                        // Initialize new WebSocket connection
                        this.initializeWebSocket();
                        
                        // Set a delay to allow connection to establish before retrying
                        setTimeout(() => attemptSend(attempt + 1), RETRY_INTERVAL);
                        return;
                    } else {
                        console.error('Failed to send signal after multiple attempts:', data.type);
                        return;
                    }
                }
                
                // Socket exists and is open, try sending
                try {
                    const message = JSON.stringify(data);
                    this.socket.send(message);
                    console.log(`Sent signal of type: ${data.type}`);
                } catch (error) {
                    console.error('Error sending signal:', error);
                    
                    // Retry sending if there was an error and we haven't reached max retries
                    if (attempt < MAX_RETRIES) {
                        console.log(`Retrying signal send after error (attempt ${attempt+1}/${MAX_RETRIES})...`);
                        setTimeout(() => attemptSend(attempt + 1), RETRY_INTERVAL);
                    }
                }
            };
            
            // Start send attempt chain
            attemptSend(0);
        },
        
        /**
         * Handle temporary connection loss with progressive recovery
         */
        handleConnectionLoss(stateType) {
            console.log(`Handling connection ${stateType} event`);
            
            // Update UI to show reconnecting status
            this.updateConnectionStatus(`Connection problem detected. Attempting to reconnect...`);
            
            // Clear any existing reconnection timer
            if (this.reconnectionTimer) {
                clearTimeout(this.reconnectionTimer);
            }
            
            // Initialize failure counter if not exists
            if (typeof this.connectionFailureCount === 'undefined') {
                this.connectionFailureCount = 0;
            }
            
            // Try natural recovery first (WebRTC sometimes recovers on its own)
            this.reconnectionTimer = setTimeout(() => {
                // Check if we've naturally recovered
                if (this.peerConnection && 
                    (this.peerConnection.iceConnectionState === 'connected' || 
                     this.peerConnection.iceConnectionState === 'completed')) {
                    console.log('Connection naturally recovered');
                    this.updateConnectionStatus('Connection re-established');
                    this.showSuccessMessage('Connection successfully restored!');
                    return;
                }
                
                // If we haven't recovered naturally, try ICE restart
                console.log('Connection still disconnected after wait period, attempting ICE restart');
                this.restartIce();
                
            }, 3000); // Short wait for natural recovery
        },
        
        /**
         * Handle more serious connection failures with incremental approach
         */
        handleConnectionFailure(stateType) {
            console.warn(`Handling connection ${stateType} event`);
            
            // Initialize or increment failure counter
            if (typeof this.connectionFailureCount === 'undefined') {
                this.connectionFailureCount = 0;
            }
            this.connectionFailureCount++;
            
            // Show appropriate message based on failure count
            if (this.connectionFailureCount === 1) {
                this.showError('Connection issue detected. Attempting to reconnect...');
            } else if (this.connectionFailureCount === 2) {
                this.showError('Still having connection problems. Trying alternative approach...');
            } else {
                this.showError('Connection issues persist. You may need to refresh the page if video doesn\'t reconnect shortly.');
            }
            
            // Update connection status
            this.updateConnectionStatus(`Connection failed (Attempt ${this.connectionFailureCount}). Reconnecting...`);
            
            // Clear any existing reconnection timer
            if (this.reconnectionTimer) {
                clearTimeout(this.reconnectionTimer);
            }
            
            // Implement progressive recovery strategy based on failure count
            if (this.connectionFailureCount === 1) {
                // First failure: try standard ICE restart
                this.restartIce();
                
            } else if (this.connectionFailureCount === 2) {
                // Second failure: small delay then try ICE restart with new options
                setTimeout(() => this.restartIce(true), 1000);
                
            } else if (this.connectionFailureCount === 3) {
                // Third failure: longer delay then reinitialize peer connection completely
                setTimeout(() => {
                    console.log('Multiple failures, reinitializing connection...');
                    this.initializePeerConnection();
                    
                    // If we're the mentor, create a new offer
                    if (this.USER_ROLE === 'mentor') {
                        setTimeout(() => this.createOffer(), 1000);
                    }
                }, 2000);
                
            } else {
                // Beyond three failures: suggest user action
                this.showError('Unable to establish reliable connection. Please check your network and refresh the page.');
            }
        },
        
        /**
         * Restart ICE connection if it fails with enhanced recovery options
         */
        async restartIce(useAlternativeApproach = false) {
            if (!this.peerConnection) {
                console.log('Cannot restart ICE: No peer connection');
                this.initializePeerConnection();
                return;
            }
            
            console.log(`Restarting ICE connection. Alternative approach: ${useAlternativeApproach}`);
            
            try {
                // First try to reset the connection state
                const connectionState = this.peerConnection.connectionState;
                const iceConnectionState = this.peerConnection.iceConnectionState;
                
                console.log('Current connection states before restart - Connection:', 
                           connectionState, 'ICE:', iceConnectionState);
                
                // If we're the mentor (initiator), create a new offer with iceRestart flag
                if (this.USER_ROLE === 'mentor') {
                    // Create offer options with progressive settings
                    const offerOptions = { 
                        iceRestart: true,
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    };
                    
                    // For alternative approach, try different options
                    if (useAlternativeApproach) {
                        // Try with different configuration approach
                        if (this.peerConnection.getConfiguration) {
                            const currentConfig = this.peerConnection.getConfiguration();
                            console.log('Updating RTCPeerConnection configuration for recovery');
                            
                            // Try with different ICE transport policy
                            const newConfig = {...currentConfig};
                            newConfig.iceTransportPolicy = (currentConfig.iceTransportPolicy === 'all') ? 'relay' : 'all';
                            
                            try {
                                this.peerConnection.setConfiguration(newConfig);
                                console.log('Updated peer configuration:', newConfig);
                            } catch (e) {
                                console.error('Error updating peer configuration:', e);
                            }
                        }
                    }
                    
                    // Create and set a new offer
                    const offer = await this.peerConnection.createOffer(offerOptions);
                    
                    await this.peerConnection.setLocalDescription(offer);
                    
                    console.log('New ICE restart offer created and set as local description');
                    
                    // Send the new offer to restart ICE negotiation
                    this.sendSignal({
                        type: 'offer',
                        sdp: offer,
                        is_restart: true
                    });
                    
                    // Log the event to track restarts
                    console.log('ICE restart offer sent to remote peer');
                } else {
                    // For learners, send a signal requesting ICE restart with flag for alternative approach
                    this.sendSignal({
                        type: 'request_ice_restart',
                        use_alternative: useAlternativeApproach
                    });
                    console.log('ICE restart requested from mentor');
                }
                
                // Set a timeout to check if the connection improved
                setTimeout(() => {
                    // Only check if peerConnection still exists
                    if (!this.peerConnection) return;
                    
                    const newConnectionState = this.peerConnection.connectionState;
                    const newIceState = this.peerConnection.iceConnectionState;
                    
                    console.log('Connection states after restart attempt - Connection:', 
                               newConnectionState, 'ICE:', newIceState);
                    
                    // If still disconnected, try progressive approach
                    if ((newConnectionState === 'disconnected' || newConnectionState === 'failed' ||
                         newIceState === 'disconnected' || newIceState === 'failed') && 
                        !useAlternativeApproach) {
                        
                        // Try alternative approach on continued failure
                        console.log('Connection still failing, attempting alternative approach');
                        this.restartIce(true);
                    } else if ((newConnectionState === 'disconnected' || newConnectionState === 'failed' ||
                               newIceState === 'disconnected' || newIceState === 'failed') && 
                              useAlternativeApproach) {
                        
                        // If alternative approach also failed, notify user
                        this.showError('Connection issues detected. Please check your network or refresh the page.');
                    }
                }, 5000);
                
            } catch (error) {
                console.error('Error restarting ICE connection:', error);
                
                // If error during restart, try complete reinitialization
                if (!useAlternativeApproach) {
                    console.log('Error during ICE restart, will try complete reinitialization');
                    setTimeout(() => {
                        this.initializePeerConnection();
                        
                        // If we're the mentor, create a new offer
                        if (this.USER_ROLE === 'mentor') {
                            setTimeout(() => this.createOffer(), 1000);
                        }
                    }, 1000);
                } else {
                    this.showError('Connection error occurred. Please refresh the page to reconnect.');
                }
            }
        },
        
        /**
         * Toggle local video stream
         */
        toggleVideoStream() {
            if (!this.localStream) {
                return;
            }
            
            const videoTracks = this.localStream.getVideoTracks();
            if (videoTracks.length === 0) {
                console.log('No video tracks available');
                return;
            }
            
            // Toggle enabled state
            this.videoEnabled = !this.videoEnabled;
            
            // Update track enabled state
            videoTracks.forEach(track => {
                track.enabled = this.videoEnabled;
            });
            
            // Notify other peer of status change
            this.sendSignal({
                type: 'media_status',
                media_type: 'video',
                enabled: this.videoEnabled,
                videoEnabled: this.videoEnabled // For compatibility
            });
            
            console.log('Video stream toggled:', this.videoEnabled);
        },
        
        /**
         * Toggle local audio stream
         */
        toggleAudioStream() {
            if (!this.localStream) {
                return;
            }
            
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length === 0) {
                console.log('No audio tracks available');
                return;
            }
            
            // Toggle enabled state
            this.audioEnabled = !this.audioEnabled;
            
            // Update track enabled state
            audioTracks.forEach(track => {
                track.enabled = this.audioEnabled;
            });
            
            // Notify other peer of status change
            this.sendSignal({
                type: 'media_status',
                media_type: 'audio',
                enabled: this.audioEnabled,
                audioEnabled: this.audioEnabled // For compatibility
            });
            
            console.log('Audio stream toggled:', this.audioEnabled);
        },
        
        /**
         * Toggle screen sharing
         */
        async toggleScreenSharing() {
            try {
                if (this.isScreenSharing) {
                    // Stop screen sharing
                    if (this.screenStream) {
                        this.screenStream.getTracks().forEach(track => track.stop());
                        this.screenStream = null;
                    }
                    
                    // Restart camera
                    const videoTracks = this.localStream.getVideoTracks();
                    if (videoTracks.length === 0) {
                        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        const videoTrack = newStream.getVideoTracks()[0];
                        
                        const sender = this.peerConnection.getSenders().find(s => 
                            s.track && s.track.kind === 'video'
                        );
                        
                        if (sender) {
                            await sender.replaceTrack(videoTrack);
                            this.localStream.addTrack(videoTrack);
                        }
                    } else {
                        videoTracks.forEach(track => {
                            track.enabled = this.videoEnabled;
                        });
                    }
                    
                    this.isScreenSharing = false;
                } else {
                    // Start screen sharing
                    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: true
                    });
                    
                    // Replace video track with screen track
                    if (this.screenStream) {
                        const screenTrack = this.screenStream.getVideoTracks()[0];
                        
                        const sender = this.peerConnection.getSenders().find(s => 
                            s.track && s.track.kind === 'video'
                        );
                        
                        if (sender) {
                            await sender.replaceTrack(screenTrack);
                            
                            // Stop old video tracks
                            this.localStream.getVideoTracks().forEach(track => track.stop());
                            
                            // Show screen in local video
                            const localVideo = document.getElementById('local-video');
                            if (localVideo) {
                                localVideo.srcObject = this.screenStream;
                            }
                        }
                        
                        // Handle screen sharing stopped by user
                        screenTrack.onended = () => {
                            this.toggleScreenSharing();
                        };
                        
                        this.isScreenSharing = true;
                    }
                }
            } catch (error) {
                console.error('Error toggling screen sharing:', error);
                
                if (error.name === 'NotAllowedError') {
                    this.showError('Screen sharing permission denied.');
                } else {
                    this.showError('Error sharing screen. Please try again.');
                }
                
                this.isScreenSharing = false;
            }
        },
        
        /**
         * Toggle video layout between grid and focus
         */
        toggleLayout() {
            const videoGrid = document.querySelector('.video-grid');
            if (videoGrid) {
                if (videoGrid.style.gridTemplateColumns === '1fr 1fr') {
                    // Switch to focus mode (main video larger)
                    videoGrid.style.gridTemplateColumns = '3fr 1fr';
                } else {
                    // Switch to equal grid
                    videoGrid.style.gridTemplateColumns = '1fr 1fr';
                }
            }
        },
        
        /**
         * End the session
         */
        endSession() {
            // Confirm before ending
            if (!window.confirm('Are you sure you want to end this session?')) {
                return;
            }
            
            // Notify the other peer
            this.sendSignal({
                type: 'end_session'
            });
            
            // Clean up resources
            this.cleanupResources();
            
            // Show feedback modal
            this.showFeedbackModal = true;
        },
        
        /**
         * Submit session feedback
         */
        async submitFeedback() {
            if (this.rating === 0) {
                alert('Please select a rating before submitting.');
                return;
            }
            
            try {
                // Get CSRF token
                const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
                
                // Submit feedback to server
                const response = await fetch(`/sessions/feedback/${roomCode}/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify({
                        rating: this.rating,
                        feedback: this.feedbackText
                    })
                });
                
                if (response.ok) {
                    // Close modal
                    this.showFeedbackModal = false;
                    
                    // Redirect to dashboard
                    const dashboardUrl = this.USER_ROLE === 'mentor' ? '/users/dashboard/mentor/' : '/users/dashboard/learner/';
                    window.location.href = dashboardUrl;
                } else {
                    console.error('Error submitting feedback:', await response.text());
                    alert('Error submitting feedback. Please try again.');
                }
            } catch (error) {
                console.error('Error submitting feedback:', error);
                alert('Error submitting feedback. Please try again.');
            }
        },
        
        /**
         * Start the session timer
         */
        startSessionTimer() {
            this.sessionStartTime = new Date();
            
            // Update timer every second
            this.sessionTimer = setInterval(() => {
                const now = new Date();
                const elapsed = Math.floor((now - this.sessionStartTime) / 1000);
                
                const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
                const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
                const seconds = Math.floor(elapsed % 60).toString().padStart(2, '0');
                
                this.sessionTime = `${hours}:${minutes}:${seconds}`;
            }, 1000);
        },
        
        /**
         * Clean up resources when leaving the room
         */
        cleanupResources() {
            // Stop streams
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            // Close WebSocket
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }
            
            // Clear timers
            if (this.sessionTimer) {
                clearInterval(this.sessionTimer);
            }
            
            if (this.socketReconnectTimer) {
                clearTimeout(this.socketReconnectTimer);
            }
        },
        
        /**
         * Handle page unload event
         */
        handleBeforeUnload() {
            // Send leave message
            this.sendSignal({
                type: 'leave',
                user_id: this.USER_ID,
                user_role: this.USER_ROLE,
                user_name: userName,
                username: userName
            });
            
            this.cleanupResources();
        },
        
        /**
         * Show an error message to the user with enhanced visibility
         */
        showError(message) {
            console.error('Error:', message);
            
            // Play error sound if available
            try {
                const errorSound = document.getElementById('error-sound');
                if (errorSound) {
                    errorSound.play().catch(e => console.log('Could not play error sound:', e));
                }
            } catch (e) {
                console.log('Error playing sound:', e);
            }
            
            // Create error container if it doesn't exist
            let errorContainer = document.getElementById('error-message');
            
            if (!errorContainer) {
                // Create a floating notification element if none exists
                errorContainer = document.createElement('div');
                errorContainer.id = 'error-message';
                errorContainer.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 p-4 rounded-lg shadow-lg border-2 max-w-md w-5/6 flex items-center transition-opacity duration-300';
                document.body.appendChild(errorContainer);
            }
            
            // Make sure the container is visible
            errorContainer.classList.remove('hidden', 'opacity-0');
            
            // Add error icon and format message
            errorContainer.innerHTML = `
                <div class="flex w-full items-center">
                    <div class="text-red-500 mr-3 flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <div class="flex-grow">${message}</div>
                    <button class="ml-auto flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none" onclick="this.parentElement.parentElement.classList.add('hidden');">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            `;
            
            // Add error styling
            errorContainer.classList.add('bg-red-100', 'text-red-800', 'border-red-300');
            errorContainer.classList.remove('bg-green-100', 'text-green-800', 'border-green-300', 'bg-blue-100', 'text-blue-800', 'border-blue-300');
            
            // Clear any existing timeout
            if (this.messageTimeout) {
                clearTimeout(this.messageTimeout);
            }
            
            // Hide after 10 seconds
            this.messageTimeout = setTimeout(() => {
                errorContainer.classList.add('opacity-0');
                setTimeout(() => {
                    errorContainer.classList.add('hidden');
                }, 300);
            }, 10000);
        },
        
        /**
         * Show a success message to the user with enhanced visibility
         */
        showSuccessMessage(message) {
            console.log('Success:', message);
            
            // Play success sound if available
            try {
                const successSound = document.getElementById('success-sound');
                if (successSound) {
                    successSound.play().catch(e => console.log('Could not play success sound:', e));
                }
            } catch (e) {
                console.log('Error playing sound:', e);
            }
            
            // Create message container if it doesn't exist
            let messageContainer = document.getElementById('error-message');
            
            if (!messageContainer) {
                // Create a floating notification element if none exists
                messageContainer = document.createElement('div');
                messageContainer.id = 'error-message';
                messageContainer.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 p-4 rounded-lg shadow-lg border-2 max-w-md w-5/6 flex items-center transition-opacity duration-300';
                document.body.appendChild(messageContainer);
            }
            
            // Make sure the container is visible
            messageContainer.classList.remove('hidden', 'opacity-0');
            
            // Add success icon and format message
            messageContainer.innerHTML = `
                <div class="flex w-full items-center">
                    <div class="text-green-500 mr-3 flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <div class="flex-grow">${message}</div>
                    <button class="ml-auto flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none" onclick="this.parentElement.parentElement.classList.add('hidden');">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            `;
            
            // Add success styling
            messageContainer.classList.add('bg-green-100', 'text-green-800', 'border-green-300');
            messageContainer.classList.remove('bg-red-100', 'text-red-800', 'border-red-300', 'bg-blue-100', 'text-blue-800', 'border-blue-300');
            
            // Clear any existing timeout
            if (this.messageTimeout) {
                clearTimeout(this.messageTimeout);
            }
            
            // Hide after 5 seconds
                setTimeout(() => {
                    messageContainer.classList.add('hidden');
                }, 5000);
            }
        },
        
        /**
         * Play a notification sound
         */
        playNotificationSound() {
            const notificationSound = document.getElementById('notification-sound');
            if (notificationSound) {
                notificationSound.play().catch(error => {
                    console.warn('Error playing notification sound:', error);
                });
            }
        },
        
        /**
         * Update connection status display with appropriate styling
         */
        updateConnectionStatus(status) {
            console.log('Connection status update:', status);
            
            const statusElement = document.getElementById('connection-status');
            if (!statusElement) return;
            
            // Remove all status classes
            statusElement.classList.remove(
                'connection-status-checking',
                'connection-status-connected',
                'connection-status-completed',
                'connection-status-disconnected',
                'connection-status-failed'
            );
            
            // Update text and styling based on status
            statusElement.textContent = status;
            
            if (status.includes('checking') || status.includes('Connecting')) {
                statusElement.classList.add('connection-status-checking');
            } else if (status.includes('connected') || status.includes('Connection established')) {
                statusElement.classList.add('connection-status-connected');
            } else if (status.includes('completed') || status.includes('available')) {
                statusElement.classList.add('connection-status-completed');
            } else if (status.includes('disconnected') || status.includes('closed')) {
                statusElement.classList.add('connection-status-disconnected');
            } else if (status.includes('failed')) {
                statusElement.classList.add('connection-status-failed');
            }
        }
    }));
});