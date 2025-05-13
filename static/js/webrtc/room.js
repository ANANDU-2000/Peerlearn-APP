/**
 * WebRTC Room - Core implementation for PeerLearn live sessions
 * Handles video calls, screen sharing, chat, and reconnection
 */

function webRTCRoom() {
    return {
        // State Variables
        localStream: null,
        screenStream: null,
        peerConnection: null,
        dataChannel: null,
        websocket: null,
        mainStream: null,
        isScreenSharing: false,
        audioEnabled: true,
        videoEnabled: true,
        connectionStatus: 'Connecting...',
        connectionStatusClass: 'connecting',
        sessionStatus: 'waiting',
        sessionTimer: '00:00:00',
        sessionStartTime: null,
        timerInterval: null,
        participants: [],
        otherParticipants: [],
        mainStreamUser: '',
        chatMessages: [],
        messageText: '',
        chatOpen: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        reconnectInterval: 1000, // Start with 1s, will use exponential backoff
        
        // STUN/TURN servers from environment variables or fallback
        iceServers: [
            { urls: STUN_SERVER || 'stun:stun.l.google.com:19302' }
        ],
        
        /**
         * Initialize the WebRTC room
         */
        async init() {
            // Initialize user data
            const currentUser = {
                id: USER_ID,
                name: USER_NAME,
                role: USER_ROLE
            };
            
            this.mainStreamUser = USER_ROLE === 'mentor' ? 'You (Mentor)' : 'You';
            
            // Add TURN server if available
            if (TURN_SERVER && TURN_USERNAME && TURN_CREDENTIAL) {
                this.iceServers.push({
                    urls: TURN_SERVER,
                    username: TURN_USERNAME,
                    credential: TURN_CREDENTIAL
                });
            }
            
            // Set up event listeners
            window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
            
            // Connect to media devices
            try {
                await this.setupLocalMedia();
                
                // Connect to WebSocket
                this.connectWebSocket();
                
                // Start session timer
                this.startSessionTimer();
                
                // Set up auto-reconnection for offline/online events
                window.addEventListener('online', this.handleOnline.bind(this));
                window.addEventListener('offline', this.handleOffline.bind(this));
            } catch (error) {
                console.error('Error initializing WebRTC room:', error);
                this.showToast('Error initializing video call. Please check your camera and microphone permissions.', 'error');
                
                // Fallback to audio-only mode
                this.tryAudioOnlyFallback();
            }
        },
        
        /**
         * Connect to the WebSocket server
         */
        connectWebSocket() {
            // Close existing connection if any
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.close();
            }
            
            // Create the WebSocket URL
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/session/${ROOM_CODE}/`;
            
            this.websocket = new WebSocket(wsUrl);
            
            // WebSocket event handlers
            this.websocket.onopen = this.handleWebSocketOpen.bind(this);
            this.websocket.onmessage = this.handleWebSocketMessage.bind(this);
            this.websocket.onclose = this.handleWebSocketClose.bind(this);
            this.websocket.onerror = this.handleWebSocketError.bind(this);
        },
        
        /**
         * Handle WebSocket open event
         */
        handleWebSocketOpen() {
            console.log('WebSocket connection established');
            this.reconnectAttempts = 0;
            this.reconnectInterval = 1000;
            
            // Send join message
            this.sendWebSocketMessage({
                type: 'join',
                user: {
                    id: USER_ID,
                    name: USER_NAME,
                    role: USER_ROLE
                }
            });
            
            // Setup peer connection after WebSocket is open
            this.setupPeerConnection();
        },
        
        /**
         * Handle WebSocket close event
         */
        handleWebSocketClose(event) {
            console.log(`WebSocket closed: ${event.code} ${event.reason}`);
            
            // Update connection status
            this.connectionStatus = 'Disconnected';
            this.connectionStatusClass = 'disconnected';
            
            // Show toast notification
            this.showToast('Connection lost. Attempting to reconnect...', 'warning');
            
            // Attempt to reconnect with exponential backoff
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                setTimeout(() => {
                    this.reconnectAttempts++;
                    this.reconnectInterval = Math.min(30000, this.reconnectInterval * 2); // Max 30s
                    console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
                    this.connectWebSocket();
                }, this.reconnectInterval);
            } else {
                // Max attempts reached
                this.showToast('Unable to reconnect. Please reload the page.', 'error');
            }
        },
        
        /**
         * Handle WebSocket error event
         */
        handleWebSocketError(error) {
            console.error('WebSocket error:', error);
            // Update connection status
            this.connectionStatus = 'Connection Error';
            this.connectionStatusClass = 'disconnected';
        },
        
        /**
         * Handle WebSocket messages
         */
        handleWebSocketMessage(event) {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data.type);
            
            switch (data.type) {
                case 'user_join':
                    this.handleUserJoin(data);
                    break;
                case 'user_leave':
                    this.handleUserLeave(data);
                    break;
                case 'offer':
                    this.handleOffer(data);
                    break;
                case 'answer':
                    this.handleAnswer(data);
                    break;
                case 'ice_candidate':
                    this.handleIceCandidate(data);
                    break;
                case 'chat_message':
                    this.handleChatMessage(data);
                    break;
                case 'session_end':
                    this.handleSessionEnd();
                    break;
                case 'ping':
                    // Respond with a pong to keep the connection alive
                    this.sendWebSocketMessage({ type: 'pong' });
                    break;
                default:
                    console.warn('Unknown message type:', data.type);
            }
        },
        
        /**
         * Set up local media (camera and microphone)
         */
        async setupLocalMedia() {
            try {
                // Request access to media devices
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                });
                
                // Set local stream as main stream initially
                this.mainStream = this.localStream;
                
                // Set up video element after Vue has updated the DOM
                this.$nextTick(() => {
                    if (this.$refs.mainVideo) {
                        this.$refs.mainVideo.srcObject = this.localStream;
                    }
                });
                
                this.connectionStatus = 'Connected';
                this.connectionStatusClass = 'connected';
                
                return true;
            } catch (error) {
                console.error('Error accessing media devices:', error);
                
                // Update connection status
                this.connectionStatus = 'Media Error';
                this.connectionStatusClass = 'disconnected';
                
                // Show specific error message based on error type
                if (error.name === 'NotAllowedError') {
                    this.showToast('Camera or microphone access denied. Please check your browser permissions.', 'error');
                } else if (error.name === 'NotFoundError') {
                    this.showToast('No camera or microphone found. Please connect a device.', 'error');
                } else {
                    this.showToast('Error accessing your camera and microphone.', 'error');
                }
                
                throw error;
            }
        },
        
        /**
         * Attempt to connect with audio only if video fails
         */
        async tryAudioOnlyFallback() {
            try {
                console.log('Trying audio-only fallback');
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
                
                // Update state
                this.videoEnabled = false;
                this.mainStream = this.localStream;
                
                // Set up audio-only mode
                this.$nextTick(() => {
                    if (this.$refs.mainVideo) {
                        this.$refs.mainVideo.srcObject = this.localStream;
                    }
                });
                
                this.connectionStatus = 'Connected (Audio Only)';
                this.connectionStatusClass = 'connected';
                
                // Connect to WebSocket after successful audio-only setup
                this.connectWebSocket();
                
                // Show notification
                this.showToast('Connected with audio only. Video is unavailable.', 'info');
                
                return true;
            } catch (error) {
                console.error('Audio-only fallback failed:', error);
                this.connectionStatus = 'Connection Failed';
                this.connectionStatusClass = 'disconnected';
                this.showToast('Could not connect to audio. Please reload and try again.', 'error');
                return false;
            }
        },
        
        /**
         * Set up WebRTC peer connection
         */
        setupPeerConnection() {
            // Create RTCPeerConnection with ICE servers
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers
            });
            
            // Add event listeners to peer connection
            this.peerConnection.onicecandidate = this.handleICECandidate.bind(this);
            this.peerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChange.bind(this);
            this.peerConnection.ontrack = this.handleTrack.bind(this);
            
            // Create data channel for chat
            this.dataChannel = this.peerConnection.createDataChannel('chat', {
                ordered: true
            });
            
            this.dataChannel.onopen = () => console.log('Data channel open');
            this.dataChannel.onclose = () => console.log('Data channel closed');
            this.dataChannel.onmessage = this.handleDataChannelMessage.bind(this);
            
            // Add local media tracks to peer connection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }
            
            // Create and send offer if user is the mentor
            if (USER_ROLE === 'mentor') {
                this.createOffer();
            }
        },
        
        /**
         * Create and send WebRTC offer
         */
        async createOffer() {
            try {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                this.sendWebSocketMessage({
                    type: 'offer',
                    offer: this.peerConnection.localDescription
                });
            } catch (error) {
                console.error('Error creating offer:', error);
                this.showToast('Error establishing connection.', 'error');
            }
        },
        
        /**
         * Handle received WebRTC offer
         */
        async handleOffer(data) {
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                this.sendWebSocketMessage({
                    type: 'answer',
                    answer: this.peerConnection.localDescription
                });
            } catch (error) {
                console.error('Error handling offer:', error);
                this.showToast('Error establishing connection.', 'error');
            }
        },
        
        /**
         * Handle received WebRTC answer
         */
        async handleAnswer(data) {
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        },
        
        /**
         * Handle ICE candidate event
         */
        handleICECandidate(event) {
            if (event.candidate) {
                this.sendWebSocketMessage({
                    type: 'ice_candidate',
                    candidate: event.candidate
                });
            }
        },
        
        /**
         * Handle received ICE candidate
         */
        async handleIceCandidate(data) {
            try {
                if (data.candidate && this.peerConnection) {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        },
        
        /**
         * Handle ICE connection state changes
         */
        handleICEConnectionStateChange() {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            
            switch (this.peerConnection.iceConnectionState) {
                case 'connected':
                case 'completed':
                    this.connectionStatus = 'Connected';
                    this.connectionStatusClass = 'connected';
                    break;
                case 'disconnected':
                    this.connectionStatus = 'Reconnecting...';
                    this.connectionStatusClass = 'connecting';
                    this.showToast('Connection issues detected. Attempting to reconnect...', 'warning');
                    break;
                case 'failed':
                    this.connectionStatus = 'Connection Failed';
                    this.connectionStatusClass = 'disconnected';
                    this.showToast('Connection failed. Please try refreshing the page.', 'error');
                    // Try to restart ICE
                    this.restartIce();
                    break;
                case 'closed':
                    this.connectionStatus = 'Disconnected';
                    this.connectionStatusClass = 'disconnected';
                    break;
            }
        },
        
        /**
         * Restart ICE connection if it fails
         */
        async restartIce() {
            try {
                if (this.peerConnection && USER_ROLE === 'mentor') {
                    const offer = await this.peerConnection.createOffer({ iceRestart: true });
                    await this.peerConnection.setLocalDescription(offer);
                    
                    this.sendWebSocketMessage({
                        type: 'offer',
                        offer: this.peerConnection.localDescription
                    });
                    
                    this.showToast('Attempting to reconnect media...', 'info');
                }
            } catch (error) {
                console.error('Error restarting ICE:', error);
            }
        },
        
        /**
         * Handle received media tracks
         */
        handleTrack(event) {
            console.log('Remote track received:', event.track.kind);
            
            // Update participant list
            const participant = {
                id: 'remote',
                name: USER_ROLE === 'mentor' ? 'Learner' : 'Mentor',
                stream: event.streams[0]
            };
            
            this.participants = [
                ...this.participants.filter(p => p.id !== 'remote'),
                participant
            ];
            
            this.updateParticipantList();
            
            // Set up remote video element
            this.$nextTick(() => {
                const videoElement = document.getElementById('video-remote');
                if (videoElement) {
                    videoElement.srcObject = event.streams[0];
                }
            });
        },
        
        /**
         * Update the participant list in the UI
         */
        updateParticipantList() {
            // Set other participants (excluding the currently displayed main stream)
            this.otherParticipants = this.participants.filter(p => {
                return p.stream !== this.mainStream;
            });
            
            // Update participants label
            this.participantsLabel = `${this.participants.length} participant${this.participants.length !== 1 ? 's' : ''}`;
        },
        
        /**
         * Handle user joining the session
         */
        handleUserJoin(data) {
            console.log('User joined:', data.user);
            
            // Show notification
            this.showToast(`${data.user.name} joined the session`, 'info');
            
            // Update session status if this is the first user to join besides current user
            if (this.sessionStatus === 'waiting') {
                this.sessionStatus = 'live';
                this.showToast('Session is now live!', 'success');
            }
        },
        
        /**
         * Handle user leaving the session
         */
        handleUserLeave(data) {
            console.log('User left:', data.user);
            
            // Show notification
            this.showToast(`${data.user.name} left the session`, 'info');
            
            // Clean up participant from the list
            this.participants = this.participants.filter(p => p.id !== data.user.id);
            this.updateParticipantList();
        },
        
        /**
         * Toggle audio mute/unmute
         */
        toggleAudio() {
            if (this.localStream) {
                const audioTracks = this.localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    audioTracks.forEach(track => {
                        track.enabled = !track.enabled;
                    });
                    this.audioEnabled = audioTracks[0].enabled;
                    
                    // Notify others via data channel
                    this.sendDataChannelMessage({
                        type: 'media_status',
                        audio: this.audioEnabled
                    });
                    
                    // Show toast notification
                    this.showToast(this.audioEnabled ? 'Microphone unmuted' : 'Microphone muted', 'info');
                }
            }
        },
        
        /**
         * Toggle video on/off
         */
        toggleVideo() {
            if (this.localStream) {
                const videoTracks = this.localStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    videoTracks.forEach(track => {
                        track.enabled = !track.enabled;
                    });
                    this.videoEnabled = videoTracks[0].enabled;
                    
                    // Notify others via data channel
                    this.sendDataChannelMessage({
                        type: 'media_status',
                        video: this.videoEnabled
                    });
                    
                    // Show toast notification
                    this.showToast(this.videoEnabled ? 'Camera turned on' : 'Camera turned off', 'info');
                }
            }
        },
        
        /**
         * Share screen instead of camera
         */
        async shareScreen() {
            try {
                // Get screen capture stream
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always'
                    },
                    audio: false
                });
                
                // Update UI state
                this.isScreenSharing = true;
                
                // Replace video track in peer connection
                const videoTrack = this.screenStream.getVideoTracks()[0];
                
                // Get all senders for video
                const senders = this.peerConnection.getSenders();
                const videoSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'video'
                );
                
                if (videoSender) {
                    await videoSender.replaceTrack(videoTrack);
                }
                
                // Update local display
                this.mainStream = this.screenStream;
                this.$nextTick(() => {
                    if (this.$refs.mainVideo) {
                        this.$refs.mainVideo.srcObject = this.screenStream;
                    }
                });
                
                // Show toast notification
                this.showToast('Screen sharing started', 'success');
                
                // Handle screen sharing ended by user
                videoTrack.onended = () => {
                    this.stopShareScreen();
                };
            } catch (error) {
                console.error('Error sharing screen:', error);
                this.showToast('Screen sharing failed. Please try again.', 'error');
                this.isScreenSharing = false;
            }
        },
        
        /**
         * Stop screen sharing and revert to camera
         */
        async stopShareScreen() {
            if (this.isScreenSharing && this.screenStream) {
                // Stop all tracks in screen stream
                this.screenStream.getTracks().forEach(track => track.stop());
                
                // Revert to camera video
                if (this.localStream) {
                    const videoTrack = this.localStream.getVideoTracks()[0];
                    if (videoTrack && this.peerConnection) {
                        // Find video sender
                        const senders = this.peerConnection.getSenders();
                        const videoSender = senders.find(sender => 
                            sender.track && sender.track.kind === 'video'
                        );
                        
                        if (videoSender) {
                            await videoSender.replaceTrack(videoTrack);
                        }
                    }
                    
                    // Update local display
                    this.mainStream = this.localStream;
                    this.$nextTick(() => {
                        if (this.$refs.mainVideo) {
                            this.$refs.mainVideo.srcObject = this.localStream;
                        }
                    });
                }
                
                // Update UI state
                this.isScreenSharing = false;
                this.screenStream = null;
                
                // Show toast notification
                this.showToast('Screen sharing stopped', 'info');
            }
        },
        
        /**
         * Switch which stream is shown in the main video
         */
        switchMainStream(participantId) {
            const participant = this.participants.find(p => p.id === participantId);
            if (participant && participant.stream) {
                // Save previous main stream
                const previousMain = this.mainStream;
                
                // Set new main stream
                this.mainStream = participant.stream;
                this.mainStreamUser = participant.name;
                
                // Update video element
                this.$nextTick(() => {
                    if (this.$refs.mainVideo) {
                        this.$refs.mainVideo.srcObject = this.mainStream;
                    }
                });
                
                // Update participant list
                this.updateParticipantList();
            }
        },
        
        /**
         * Handle chat messages received through the data channel
         */
        handleDataChannelMessage(event) {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'chat') {
                    this.handleChatMessage(data);
                } else if (data.type === 'media_status') {
                    // Handle remote media status changes
                    console.log('Remote media status change:', data);
                }
            } catch (error) {
                console.error('Error parsing data channel message:', error);
            }
        },
        
        /**
         * Send a message through the data channel
         */
        sendDataChannelMessage(data) {
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify(data));
            } else {
                // Fallback to WebSocket if data channel isn't open
                this.sendWebSocketMessage(data);
            }
        },
        
        /**
         * Handle incoming chat messages
         */
        handleChatMessage(data) {
            // Add message to chat history
            this.chatMessages.push({
                id: Date.now(),
                sender: data.sender,
                message: data.message,
                time: new Date().toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            });
            
            // Auto-scroll chat to bottom
            this.$nextTick(() => {
                const chatContainer = document.querySelector('.chat-messages');
                if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            });
            
            // Show notification if chat is not open
            if (!this.chatOpen && data.sender !== USER_NAME) {
                this.showToast(`New message from ${data.sender}`, 'info');
            }
        },
        
        /**
         * Send a chat message
         */
        sendChatMessage() {
            if (this.messageText.trim() === '') {
                return;
            }
            
            const message = {
                type: 'chat_message',
                sender: USER_NAME,
                message: this.messageText.trim(),
            };
            
            // Send via WebSocket
            this.sendWebSocketMessage(message);
            
            // Also send via data channel if available
            this.sendDataChannelMessage(message);
            
            // Clear input
            this.messageText = '';
        },
        
        /**
         * Handle online event
         */
        handleOnline() {
            console.log('Online event triggered');
            this.showToast('Internet connection restored. Reconnecting...', 'info');
            
            // Reconnect WebSocket and rebuild peer connection
            this.connectWebSocket();
        },
        
        /**
         * Handle offline event
         */
        handleOffline() {
            console.log('Offline event triggered');
            this.connectionStatus = 'Offline';
            this.connectionStatusClass = 'disconnected';
            this.showToast('Internet connection lost. Waiting to reconnect...', 'warning');
        },
        
        /**
         * End the session (mentor only)
         */
        endSession() {
            if (USER_ROLE !== 'mentor') {
                return;
            }
            
            if (confirm('Are you sure you want to end this session for all participants?')) {
                // Send session end message
                this.sendWebSocketMessage({
                    type: 'session_end'
                });
                
                // Handle locally
                this.handleSessionEnd();
            }
        },
        
        /**
         * Handle session end event
         */
        handleSessionEnd() {
            // Stop timer
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            
            // Update UI
            this.sessionStatus = 'ended';
            this.showToast('Session has ended', 'info');
            
            // Clean up media
            this.cleanupMedia();
            
            // Show feedback form
            this.$nextTick(() => {
                // Use setTimeout to ensure DOM has updated
                setTimeout(() => {
                    const feedbackModal = document.getElementById('session-feedback-modal');
                    if (feedbackModal) {
                        // Using Alpine $dispatch to show modal
                        feedbackModal.dispatchEvent(new CustomEvent('show-modal'));
                    }
                }, 1000);
            });
        },
        
        /**
         * Clean up media streams and connections
         */
        cleanupMedia() {
            // Stop local streams
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
            }
            
            // Close WebSocket
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.close();
            }
        },
        
        /**
         * Handle page unload event
         */
        handleBeforeUnload(event) {
            // Send leave message
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.sendWebSocketMessage({
                    type: 'leave'
                });
            }
            
            // Clean up media
            this.cleanupMedia();
        },
        
        /**
         * Start the session timer
         */
        startSessionTimer() {
            this.sessionStartTime = Date.now();
            
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.sessionStartTime;
                
                // Format as HH:MM:SS
                const seconds = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
                const minutes = Math.floor((elapsed / (1000 * 60)) % 60).toString().padStart(2, '0');
                const hours = Math.floor((elapsed / (1000 * 60 * 60))).toString().padStart(2, '0');
                
                this.sessionTimer = `${hours}:${minutes}:${seconds}`;
            }, 1000);
        },
        
        /**
         * Send a message through the WebSocket
         */
        sendWebSocketMessage(data) {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send(JSON.stringify(data));
            } else {
                console.warn('WebSocket not open, message not sent:', data);
            }
        },
        
        /**
         * Show a toast notification
         */
        showToast(message, type = 'info') {
            if (window.showToast) {
                window.showToast(message, type);
            } else {
                console.log('Toast:', message, type);
            }
        },
        
        /**
         * Get participant label for UI
         */
        get participantsLabel() {
            return `${this.participants.length + 1} participant${this.participants.length !== 0 ? 's' : ''}`;
        }
    };
}