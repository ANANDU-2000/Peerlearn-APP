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
            
            // Try multiple endpoints for compatibility with different consumer implementations
            const wsEndpoints = [
                `/ws/room/${roomCode}/`,
                `/ws/sessions/${roomCode}/`,
                `/ws/session/${roomCode}/`
            ];
            
            // Try the first endpoint
            this.connectToWebSocketEndpoint(wsEndpoints, 0);
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
                this.socketConnected = true;
                
                // Send join event
                this.sendSignal({
                    type: 'join',
                    user_id: this.USER_ID,
                    user_role: this.USER_ROLE,
                    user_name: userName,
                    username: userName // For compatibility with SessionConsumer
                });
                
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
         * Initialize the local media stream (camera & microphone)
         */
        async initializeLocalStream() {
            try {
                // Request access to camera and microphone
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
                
                // Display the local stream in the video element
                const localVideo = document.getElementById('local-video');
                if (localVideo) {
                    localVideo.srcObject = this.localStream;
                    localVideo.onloadedmetadata = () => {
                        localVideo.play().catch(error => {
                            console.error('Error playing local video:', error);
                        });
                    };
                }
                
                this.isLocalStreamReady = true;
                this.videoEnabled = true;
                this.audioEnabled = true;
                
                // Initialize peer connection once we have the local stream
                this.initializePeerConnection();
                
                console.log('Local stream initialized successfully');
            } catch (error) {
                console.error('Error accessing media devices:', error);
                
                // Try fallback to audio only
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    this.showError('Camera or microphone permission denied. Please enable permissions and refresh.');
                    
                    try {
                        // Try with audio only
                        this.localStream = await navigator.mediaDevices.getUserMedia({
                            video: false,
                            audio: true
                        });
                        
                        this.videoEnabled = false;
                        this.audioEnabled = true;
                        this.isLocalStreamReady = true;
                        
                        // Initialize peer connection with audio only
                        this.initializePeerConnection();
                        
                        console.log('Fallback to audio-only successful');
                    } catch (audioError) {
                        console.error('Error accessing audio devices:', audioError);
                        this.showError('Unable to access microphone. Please check permissions.');
                    }
                } else {
                    this.showError('Error accessing camera or microphone. Please check your devices.');
                }
            }
        },
        
        /**
         * Initialize the WebRTC peer connection
         */
        initializePeerConnection() {
            try {
                // Create a new RTCPeerConnection with ICE servers
                this.peerConnection = new RTCPeerConnection({
                    iceServers: this.iceServers,
                    iceTransportPolicy: 'all'
                });
                
                console.log('Peer connection initialized with ICE servers:', this.iceServers);
                
                // Add local stream tracks to the peer connection
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => {
                        this.peerConnection.addTrack(track, this.localStream);
                    });
                }
                
                // Handle ICE candidates
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('ICE candidate generated:', event.candidate.candidate.substr(0, 50) + '...');
                        
                        // Send the ICE candidate to the other peer via WebSocket
                        this.sendSignal({
                            type: 'ice_candidate',
                            candidate: event.candidate
                        });
                    }
                };
                
                // Handle ICE connection state changes
                this.peerConnection.oniceconnectionstatechange = () => {
                    console.log('ICE connection state changed:', this.peerConnection.iceConnectionState);
                    
                    if (this.peerConnection.iceConnectionState === 'failed') {
                        console.warn('ICE connection failed, attempting to restart');
                        this.restartIce();
                    } else if (this.peerConnection.iceConnectionState === 'disconnected') {
                        console.warn('ICE connection disconnected, waiting for reconnection...');
                        setTimeout(() => {
                            if (this.peerConnection.iceConnectionState === 'disconnected') {
                                this.restartIce();
                            }
                        }, 5000);
                    } else if (this.peerConnection.iceConnectionState === 'connected') {
                        console.log('ICE connection established');
                        this.isConnected = true;
                        this.sessionStatus = 'live';
                    }
                };
                
                // Handle remote track (when other peer adds stream)
                this.peerConnection.ontrack = (event) => {
                    console.log('Remote track received:', event.track.kind);
                    
                    // Set the remote stream
                    this.remoteStream = event.streams[0];
                    
                    // Display the remote stream
                    const mainVideo = document.getElementById('main-video');
                    if (mainVideo) {
                        mainVideo.srcObject = this.remoteStream;
                        mainVideo.onloadedmetadata = () => {
                            mainVideo.play().catch(error => {
                                console.error('Error playing remote video:', error);
                            });
                        };
                    }
                    
                    this.isRemoteStreamReady = true;
                    this.remoteVideoEnabled = true;
                    
                    // Play notification sound
                    this.playNotificationSound();
                    
                    // Track track-specific events
                    event.track.onmute = () => {
                        console.log('Remote track muted:', event.track.kind);
                        if (event.track.kind === 'video') {
                            this.remoteVideoEnabled = false;
                        } else if (event.track.kind === 'audio') {
                            this.isRemoteMuted = true;
                        }
                    };
                    
                    event.track.onunmute = () => {
                        console.log('Remote track unmuted:', event.track.kind);
                        if (event.track.kind === 'video') {
                            this.remoteVideoEnabled = true;
                        } else if (event.track.kind === 'audio') {
                            this.isRemoteMuted = false;
                        }
                    };
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
                // Create an offer with constraints
                const offer = await this.peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                
                // Set the local description
                await this.peerConnection.setLocalDescription(offer);
                
                console.log('Offer created and set as local description');
                
                // Send the offer to the remote peer
                this.sendSignal({
                    type: 'offer',
                    sdp: offer
                });
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
         * Send a signaling message via WebSocket
         */
        sendSignal(data) {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                console.error('Cannot send signal: WebSocket not connected');
                return;
            }
            
            try {
                this.socket.send(JSON.stringify(data));
            } catch (error) {
                console.error('Error sending signal:', error);
            }
        },
        
        /**
         * Restart ICE connection if it fails
         */
        async restartIce() {
            if (!this.peerConnection) {
                return;
            }
            
            console.log('Restarting ICE connection');
            
            try {
                if (this.USER_ROLE === 'mentor') {
                    const offer = await this.peerConnection.createOffer({ iceRestart: true });
                    await this.peerConnection.setLocalDescription(offer);
                    
                    this.sendSignal({
                        type: 'offer',
                        sdp: offer
                    });
                }
            } catch (error) {
                console.error('Error restarting ICE connection:', error);
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
         * Show an error message to the user
         */
        showError(message) {
            alert(message);
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
        }
    }));
});