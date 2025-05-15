/**
 * Fixed WebRTC implementation for PeerLearn room
 * 
 * This corrected implementation works reliably for two-way video and audio
 * communication between learner and mentor.
 */

document.addEventListener('alpine:init', () => {
    Alpine.data('webRTCRoom', () => ({
        // Connection state
        localStream: null,
        remoteStream: null,
        peerConnection: null,
        dataChannel: null,
        roomCode: null,
        socket: null,
        
        // User state
        userId: null,
        userName: '',
        userRole: '',
        isConnected: false,
        videoEnabled: true, 
        audioEnabled: true,
        isScreenSharing: false,
        
        // Remote user state
        remoteUserName: '',
        remoteUserRole: '',
        remoteVideoEnabled: true,
        remoteAudioEnabled: true,
        
        // Session timing
        sessionStartTime: null,
        sessionTime: '00:00:00',
        sessionTimer: null,
        
        // Feedback
        showFeedbackModal: false,
        rating: 0,
        feedbackText: '',
        
        // Debug state
        socketConnected: false,
        connectionStatus: 'Connecting...',
        
        /**
         * Initialize the WebRTC room
         */
        init() {
            console.log('Initializing WebRTC Room');
            
            // Get configuration from the global variables set in the template
            this.roomCode = roomCode;
            this.userId = userId;
            this.userName = userName;
            this.userRole = userRole;
            
            // Set remote user role
            this.remoteUserRole = this.userRole === 'mentor' ? 'learner' : 'mentor';
            this.remoteUserName = this.userRole === 'mentor' ? 'Learner' : 'Mentor';
            
            // Initialize the WebSocket connection first
            this.initWebSocket();
            
            // Initialize the local media stream
            this.initLocalMedia();
            
            // Set up disconnect handler
            window.addEventListener('beforeunload', () => {
                // Try to send a leave message
                this.sendSignal({
                    type: 'leave',
                    user_id: this.userId,
                    user_name: this.userName
                });
                
                // Clean up
                this.cleanup();
            });
            
            // Start session timer
            this.startSessionTimer();
        },
        
        /**
         * Initialize WebSocket for signaling
         */
        initWebSocket() {
            console.log('Initializing WebSocket connection');
            
            // Determine WebSocket URL
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            
            // Try multiple WebSocket URL formats for compatibility
            this.wsUrls = [
                // Format 1: sessions (plural)
                `${wsProtocol}//${window.location.host}/ws/sessions/${this.roomCode}/`,
                // Format 2: room
                `${wsProtocol}//${window.location.host}/ws/room/${this.roomCode}/`,
                // Format 3: session (singular)
                `${wsProtocol}//${window.location.host}/ws/session/${this.roomCode}/`
            ];
            
            // Try to connect using the first URL format
            this.currentUrlIndex = 0;
            this.tryConnectWebSocket();
        },
        
        /**
         * Try to connect using the current WebSocket URL, and fall back to other formats if needed
         */
        tryConnectWebSocket() {
            const wsUrl = this.wsUrls[this.currentUrlIndex];
            console.log(`Trying WebSocket connection (${this.currentUrlIndex + 1}/${this.wsUrls.length}):`, wsUrl);
            
            // Create WebSocket connection
            this.socket = new WebSocket(wsUrl);
            
            // Set up event handlers
            this.socket.onopen = () => {
                console.log('WebSocket connected successfully!');
                this.socketConnected = true;
                this.connectionStatus = 'Connected to signaling server';
                
                // Send join message
                this.sendSignal({
                    type: 'join',
                    user_id: this.userId,
                    user_name: this.userName,
                    user_role: this.userRole
                });
                
                // Start ping interval to keep connection alive
                this.startPingInterval();
            };
            
            this.socket.onclose = (e) => {
                console.log('WebSocket closed:', e);
                this.socketConnected = false;
                
                // If this is a connection failure (not a runtime close), try the next URL format
                if (!this.hasConnected && this.currentUrlIndex < this.wsUrls.length - 1) {
                    this.currentUrlIndex++;
                    console.log(`Connection failed. Trying next WebSocket URL format (${this.currentUrlIndex + 1}/${this.wsUrls.length})`);
                    setTimeout(() => this.tryConnectWebSocket(), 500);
                    return;
                }
                
                this.connectionStatus = 'Disconnected from signaling server';
                
                // Stop ping interval
                this.stopPingInterval();
                
                // Try to reconnect after delay if not intentionally closed
                if (!this.isClosing) {
                    setTimeout(() => this.tryConnectWebSocket(), 5000);
                }
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connectionStatus = 'Connection error';
                
                // Error will be followed by onclose, which will try the next URL format
            };
            
            this.socket.onmessage = (event) => {
                // Mark as having successfully connected once we receive a message
                this.hasConnected = true;
                this.handleSignalingMessage(event);
            };
        },
        
        /**
         * Start ping interval
         */
        startPingInterval() {
            this.pingInterval = setInterval(() => {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.sendSignal({ type: 'ping' });
                }
            }, 30000);
        },
        
        /**
         * Stop ping interval
         */
        stopPingInterval() {
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
        },
        
        /**
         * Initialize local media (camera and microphone)
         */
        async initLocalMedia() {
            try {
                console.log('Requesting camera and microphone access');
                
                // Request media with constraints
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    },
                    audio: true
                });
                
                console.log('Media access granted');
                
                // Attach local media to video element
                const localVideo = document.getElementById('local-video');
                if (localVideo) {
                    localVideo.srcObject = this.localStream;
                    localVideo.muted = true; // Mute local video to prevent echo
                    localVideo.play()
                        .then(() => console.log('Local video playing'))
                        .catch(err => console.error('Error playing local video:', err));
                }
                
                // Initialize peer connection after media is ready
                this.initPeerConnection();
                
                // Enable video/audio controls
                this.videoEnabled = true;
                this.audioEnabled = true;
                
            } catch (error) {
                console.error('Error accessing media devices:', error);
                
                // Show user-friendly error
                if (error.name === 'NotAllowedError') {
                    this.connectionStatus = 'Camera/microphone access denied. Please allow access and refresh.';
                } else if (error.name === 'NotFoundError') {
                    this.connectionStatus = 'No camera or microphone found. Please connect a device and refresh.';
                } else {
                    this.connectionStatus = 'Error accessing media: ' + error.message;
                }
                
                // Try to continue with audio only if video fails
                try {
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: false,
                        audio: true
                    });
                    
                    console.log('Audio-only fallback successful');
                    this.connectionStatus = 'Video unavailable. Using audio only.';
                    
                    // Update UI
                    this.videoEnabled = false;
                    this.audioEnabled = true;
                    
                    // Attach local audio-only stream
                    const localVideo = document.getElementById('local-video');
                    if (localVideo) {
                        localVideo.srcObject = this.localStream;
                        localVideo.muted = true;
                        localVideo.play()
                            .then(() => console.log('Local audio playing'))
                            .catch(err => console.error('Error playing local audio:', err));
                    }
                    
                    // Initialize peer connection after audio is ready
                    this.initPeerConnection();
                    
                } catch (audioError) {
                    console.error('Error accessing audio devices:', audioError);
                    this.connectionStatus = 'Cannot access microphone. Please check permissions and refresh.';
                }
            }
        },
        
        /**
         * Initialize the peer connection
         */
        initPeerConnection() {
            console.log('Initializing peer connection');
            
            // ICE servers configuration
            const iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                { urls: 'stun:stun.stunprotocol.org:3478' }
            ];
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: iceServers
            });
            
            // Add local stream tracks to peer connection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    console.log(`Adding ${track.kind} track to peer connection`);
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }
            
            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('New ICE candidate:', event.candidate.candidate);
                    
                    // Send the ICE candidate to the other peer
                    this.sendSignal({
                        type: 'ice_candidate',
                        candidate: event.candidate
                    });
                }
            };
            
            // Monitor ICE connection state
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
                
                // Update connection status
                this.connectionStatus = `ICE: ${this.peerConnection.iceConnectionState}`;
                
                if (this.peerConnection.iceConnectionState === 'connected' || 
                    this.peerConnection.iceConnectionState === 'completed') {
                    this.isConnected = true;
                    this.connectionStatus = 'Connected';
                } else if (this.peerConnection.iceConnectionState === 'failed') {
                    this.connectionStatus = 'Connection failed. Try refreshing.';
                } else if (this.peerConnection.iceConnectionState === 'disconnected') {
                    this.connectionStatus = 'Disconnected. Attempting to reconnect...';
                    
                    // Try to restart ICE
                    this.restartIce();
                }
            };
            
            // Handle remote tracks - THIS IS THE CRITICAL PART
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote track:', event.track.kind);
                
                // Create media stream if it doesn't exist
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                }
                
                // Add track to remote stream
                this.remoteStream.addTrack(event.track);
                
                // Update remote state based on track type
                if (event.track.kind === 'video') {
                    this.remoteVideoEnabled = true;
                } else if (event.track.kind === 'audio') {
                    this.remoteAudioEnabled = true;
                }
                
                // Display remote stream
                const remoteVideo = document.getElementById('main-video');
                if (remoteVideo) {
                    remoteVideo.srcObject = this.remoteStream;
                    
                    // Play the video with error handling
                    remoteVideo.play()
                        .then(() => console.log('Remote video playing'))
                        .catch(err => {
                            console.error('Error playing remote video:', err);
                            
                            // If autoplay was prevented, add click-to-play
                            if (err.name === 'NotAllowedError') {
                                remoteVideo.onclick = () => {
                                    remoteVideo.play()
                                        .then(() => console.log('Remote video playing after click'))
                                        .catch(e => console.error('Error playing after click:', e));
                                };
                            }
                        });
                }
                
                // Update UI status
                this.connectionStatus = 'Connected with video and audio';
            };
            
            // Create data channel for text chat and control messages
            this.dataChannel = this.peerConnection.createDataChannel('chat', {
                ordered: true
            });
            
            this.dataChannel.onopen = () => {
                console.log('Data channel opened');
            };
            
            this.dataChannel.onclose = () => {
                console.log('Data channel closed');
            };
            
            this.dataChannel.onmessage = (event) => {
                console.log('Data channel message:', event.data);
                
                try {
                    const data = JSON.parse(event.data);
                    
                    // Handle different message types
                    if (data.type === 'chat') {
                        // Display chat message
                        this.addChatMessage(data.user_name, data.content, false);
                    } else if (data.type === 'media_status') {
                        // Update remote user's media status
                        if (data.video !== undefined) {
                            this.remoteVideoEnabled = data.video;
                        }
                        if (data.audio !== undefined) {
                            this.remoteAudioEnabled = data.audio;
                        }
                    }
                } catch (error) {
                    console.error('Error processing data channel message:', error);
                }
            };
            
            // Handle negotiation needed
            this.peerConnection.onnegotiationneeded = () => {
                console.log('Negotiation needed');
                
                // Only the mentor creates the offer
                if (this.userRole === 'mentor') {
                    this.createOffer();
                }
            };
            
            console.log('Peer connection initialized');
        },
        
        /**
         * Create and send an offer
         */
        async createOffer() {
            try {
                console.log('Creating offer');
                
                // Create offer
                const offer = await this.peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                
                // Set local description
                await this.peerConnection.setLocalDescription(offer);
                
                // Send offer via signaling
                this.sendSignal({
                    type: 'offer',
                    sdp: this.peerConnection.localDescription
                });
                
                console.log('Offer created and sent');
                
            } catch (error) {
                console.error('Error creating offer:', error);
                this.connectionStatus = 'Error creating offer: ' + error.message;
            }
        },
        
        /**
         * Handle an incoming offer
         */
        async handleOffer(offer) {
            try {
                console.log('Received offer, setting remote description');
                
                // Set remote description
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                
                // Create answer
                const answer = await this.peerConnection.createAnswer();
                
                // Set local description
                await this.peerConnection.setLocalDescription(answer);
                
                // Send answer via signaling
                this.sendSignal({
                    type: 'answer',
                    sdp: this.peerConnection.localDescription
                });
                
                console.log('Answer created and sent');
                
            } catch (error) {
                console.error('Error handling offer:', error);
                this.connectionStatus = 'Error handling offer: ' + error.message;
            }
        },
        
        /**
         * Handle an incoming answer
         */
        async handleAnswer(answer) {
            try {
                console.log('Received answer, setting remote description');
                
                // Set remote description
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                
                console.log('Remote description set successfully');
                
            } catch (error) {
                console.error('Error handling answer:', error);
                this.connectionStatus = 'Error handling answer: ' + error.message;
            }
        },
        
        /**
         * Handle incoming ICE candidate
         */
        async handleIceCandidate(candidate) {
            try {
                console.log('Adding ICE candidate');
                
                // Add candidate
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                
                console.log('ICE candidate added successfully');
                
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        },
        
        /**
         * Restart ICE
         */
        async restartIce() {
            if (this.userRole === 'mentor' && this.peerConnection) {
                try {
                    console.log('Restarting ICE connection');
                    
                    // Create new offer with ICE restart
                    const offer = await this.peerConnection.createOffer({
                        iceRestart: true,
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    });
                    
                    // Set local description
                    await this.peerConnection.setLocalDescription(offer);
                    
                    // Send offer via signaling
                    this.sendSignal({
                        type: 'offer',
                        sdp: this.peerConnection.localDescription
                    });
                    
                    console.log('ICE restart offer sent');
                    
                } catch (error) {
                    console.error('Error restarting ICE:', error);
                }
            }
        },
        
        /**
         * Toggle video
         */
        toggleVideo() {
            if (this.localStream) {
                const videoTracks = this.localStream.getVideoTracks();
                
                // Toggle video tracks
                videoTracks.forEach(track => {
                    track.enabled = !track.enabled;
                });
                
                // Update state
                this.videoEnabled = videoTracks.length > 0 ? videoTracks[0].enabled : false;
                
                // Send status update
                this.sendMediaStatus();
                
                console.log('Video toggled:', this.videoEnabled);
            }
        },
        
        /**
         * Toggle audio
         */
        toggleAudio() {
            if (this.localStream) {
                const audioTracks = this.localStream.getAudioTracks();
                
                // Toggle audio tracks
                audioTracks.forEach(track => {
                    track.enabled = !track.enabled;
                });
                
                // Update state
                this.audioEnabled = audioTracks.length > 0 ? audioTracks[0].enabled : false;
                
                // Send status update
                this.sendMediaStatus();
                
                console.log('Audio toggled:', this.audioEnabled);
            }
        },
        
        /**
         * Toggle screen sharing
         */
        async toggleScreenShare() {
            try {
                if (!this.isScreenSharing) {
                    // Start screen sharing
                    console.log('Starting screen sharing');
                    
                    // Get screen stream
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: {
                            cursor: 'always'
                        },
                        audio: false
                    });
                    
                    // Save the screen stream
                    this.screenStream = screenStream;
                    this.isScreenSharing = true;
                    
                    // Find video sender
                    const videoSender = this.peerConnection.getSenders().find(
                        sender => sender.track && sender.track.kind === 'video'
                    );
                    
                    if (videoSender) {
                        // Get screen video track
                        const screenTrack = screenStream.getVideoTracks()[0];
                        
                        // Replace video track with screen track
                        await videoSender.replaceTrack(screenTrack);
                        
                        // Update local video display to show screen
                        const localVideo = document.getElementById('local-video');
                        if (localVideo) {
                            localVideo.srcObject = screenStream;
                        }
                        
                        // Handle screen sharing ended by user
                        screenTrack.onended = () => {
                            this.stopScreenSharing();
                        };
                        
                        console.log('Screen sharing started');
                        
                    } else {
                        console.error('No video sender found');
                        
                        // Stop screen sharing
                        this.screenStream.getTracks().forEach(track => track.stop());
                        this.screenStream = null;
                        this.isScreenSharing = false;
                    }
                    
                } else {
                    // Stop screen sharing
                    this.stopScreenSharing();
                }
                
            } catch (error) {
                console.error('Error toggling screen share:', error);
                this.connectionStatus = 'Screen sharing error: ' + error.message;
                this.isScreenSharing = false;
            }
        },
        
        /**
         * Stop screen sharing
         */
        async stopScreenSharing() {
            if (this.screenStream) {
                console.log('Stopping screen sharing');
                
                // Stop all screen tracks
                this.screenStream.getTracks().forEach(track => track.stop());
                
                // Find video sender
                const videoSender = this.peerConnection.getSenders().find(
                    sender => sender.track && sender.track.kind === 'video'
                );
                
                if (videoSender && this.localStream) {
                    // Get original camera video track
                    const videoTrack = this.localStream.getVideoTracks()[0];
                    
                    if (videoTrack) {
                        // Replace screen track with camera track
                        await videoSender.replaceTrack(videoTrack);
                        
                        // Update local video display to show camera
                        const localVideo = document.getElementById('local-video');
                        if (localVideo) {
                            localVideo.srcObject = this.localStream;
                        }
                    }
                }
                
                // Update state
                this.screenStream = null;
                this.isScreenSharing = false;
                
                console.log('Screen sharing stopped');
            }
        },
        
        /**
         * Send media status update
         */
        sendMediaStatus() {
            // Send via data channel if available
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify({
                    type: 'media_status',
                    video: this.videoEnabled,
                    audio: this.audioEnabled,
                    screen: this.isScreenSharing
                }));
            }
            
            // Also send via signaling for redundancy
            this.sendSignal({
                type: 'media_status',
                video: this.videoEnabled,
                audio: this.audioEnabled,
                screen: this.isScreenSharing
            });
        },
        
        /**
         * Send a message via signaling WebSocket
         */
        sendSignal(data) {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(data));
                return true;
            } else {
                console.warn('Cannot send signal: WebSocket not open');
                return false;
            }
        },
        
        /**
         * Handle signaling messages
         */
        handleSignalingMessage(event) {
            try {
                const message = JSON.parse(event.data);
                console.log('Received signaling message:', message.type);
                
                // Handle different message types
                switch (message.type) {
                    case 'offer':
                        this.handleOffer(message.sdp);
                        break;
                        
                    case 'answer':
                        this.handleAnswer(message.sdp);
                        break;
                        
                    case 'ice_candidate':
                        this.handleIceCandidate(message.candidate);
                        break;
                        
                    case 'join':
                        console.log('User joined:', message.user_name);
                        
                        // Update remote user info
                        if (message.user_id !== this.userId) {
                            this.remoteUserName = message.user_name;
                            
                            // If we're the mentor, initiate the call
                            if (this.userRole === 'mentor') {
                                this.createOffer();
                            }
                        }
                        break;
                        
                    case 'leave':
                        console.log('User left:', message.user_name);
                        break;
                        
                    case 'chat_message':
                        this.addChatMessage(message.user_name, message.content, false);
                        break;
                        
                    case 'media_status':
                        if (message.user_id !== this.userId) {
                            // Update remote media status
                            if (message.video !== undefined) {
                                this.remoteVideoEnabled = message.video;
                            }
                            if (message.audio !== undefined) {
                                this.remoteAudioEnabled = message.audio;
                            }
                        }
                        break;
                        
                    case 'pong':
                        // Ping response - do nothing
                        break;
                        
                    case 'error':
                        console.error('Signaling error:', message.message);
                        this.connectionStatus = 'Signaling error: ' + message.message;
                        break;
                        
                    default:
                        console.log('Unknown message type:', message.type);
                }
                
            } catch (error) {
                console.error('Error handling signaling message:', error);
            }
        },
        
        /**
         * Send a chat message
         */
        sendChatMessage() {
            const content = document.getElementById('chat-input').value.trim();
            
            if (content) {
                console.log('Sending chat message:', content);
                
                // Clear input
                document.getElementById('chat-input').value = '';
                
                // Send via data channel if available
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(JSON.stringify({
                        type: 'chat',
                        user_name: this.userName,
                        content: content
                    }));
                }
                
                // Also send via signaling for redundancy
                this.sendSignal({
                    type: 'chat_message',
                    user_name: this.userName,
                    content: content
                });
                
                // Add to local chat
                this.addChatMessage(this.userName, content, true);
            }
        },
        
        /**
         * Add a chat message to the UI
         */
        addChatMessage(sender, content, isLocal) {
            const chatMessages = document.getElementById('chat-messages');
            
            if (chatMessages) {
                // Create message element
                const messageDiv = document.createElement('div');
                messageDiv.className = isLocal ? 'chat-message-local' : 'chat-message-remote';
                
                const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                messageDiv.innerHTML = `
                    <div class="chat-message-header">
                        <span class="chat-message-sender">${sender}</span>
                        <span class="chat-message-time">${time}</span>
                    </div>
                    <div class="chat-message-content">${content}</div>
                `;
                
                // Add to chat container
                chatMessages.appendChild(messageDiv);
                
                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Play notification sound for remote messages
                if (!isLocal) {
                    const notificationSound = document.getElementById('notification-sound');
                    if (notificationSound) {
                        notificationSound.play().catch(err => console.log('Cannot play notification sound:', err));
                    }
                }
            }
        },
        
        /**
         * Show feedback modal
         */
        showFeedback() {
            this.showFeedbackModal = true;
        },
        
        /**
         * Submit feedback
         */
        submitFeedback() {
            console.log('Feedback submitted:', this.rating, this.feedbackText);
            
            // Send feedback to server
            fetch('/api/sessions/feedback/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({
                    session_code: this.roomCode,
                    rating: this.rating,
                    feedback: this.feedbackText
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log('Feedback response:', data);
                
                // Hide modal
                this.showFeedbackModal = false;
                
                // Thank user
                this.connectionStatus = 'Thank you for your feedback!';
            })
            .catch(error => {
                console.error('Error submitting feedback:', error);
                
                // Hide modal anyway
                this.showFeedbackModal = false;
            });
        },
        
        /**
         * Set feedback rating
         */
        setRating(value) {
            this.rating = value;
        },
        
        /**
         * End session
         */
        endSession() {
            console.log('Ending session');
            
            // Send end session signal
            this.sendSignal({
                type: 'session_ended',
                user_id: this.userId,
                user_name: this.userName
            });
            
            // Show feedback after delay
            setTimeout(() => {
                this.showFeedback();
            }, 1000);
            
            // Stop timer
            if (this.sessionTimerInterval) {
                clearInterval(this.sessionTimerInterval);
            }
            
            // Mark as ended
            this.connectionStatus = 'Session ended';
        },
        
        /**
         * Start session timer
         */
        startSessionTimer() {
            this.sessionStartTime = new Date();
            
            this.sessionTimerInterval = setInterval(() => {
                const now = new Date();
                const diff = Math.floor((now - this.sessionStartTime) / 1000);
                
                const hours = Math.floor(diff / 3600);
                const minutes = Math.floor((diff % 3600) / 60);
                const seconds = diff % 60;
                
                this.sessionTime = [
                    hours.toString().padStart(2, '0'),
                    minutes.toString().padStart(2, '0'),
                    seconds.toString().padStart(2, '0')
                ].join(':');
            }, 1000);
        },
        
        /**
         * Get CSRF token
         */
        getCsrfToken() {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.startsWith('csrftoken=')) {
                    return cookie.substring('csrftoken='.length);
                }
            }
            return '';
        },
        
        /**
         * Clean up resources
         */
        cleanup() {
            console.log('Cleaning up resources');
            
            // Stop all local tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            // Stop screen sharing
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            // Close data channel
            if (this.dataChannel) {
                this.dataChannel.close();
            }
            
            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
            }
            
            // Close WebSocket
            if (this.socket) {
                this.isClosing = true;
                this.socket.close();
            }
            
            // Stop ping interval
            this.stopPingInterval();
            
            // Stop timer
            if (this.sessionTimerInterval) {
                clearInterval(this.sessionTimerInterval);
            }
        }
    }));
});