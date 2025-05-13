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
                    // Connect to WebSocket
                    this.connectWebSocket(roomCode);
                    
                    // Request media permissions
                    await this.requestUserMedia();
                    
                    // Update UI
                    this.connectionStatus = "Connected";
                    this.connectionStatusClass = "connected";
                    this.sessionStatus = "live";
                    
                    // If mentor, update session status to live
                    if (userRole === 'mentor') {
                        this.updateSessionStatus('live');
                    }
                } catch (error) {
                    console.error("Error setting up WebRTC:", error);
                    this.connectionStatus = "Error";
                    this.connectionStatusClass = "error";
                    
                    // Show error toast
                    showToast('error', 'Connection Error', 'Failed to connect to the session. Please try refreshing the page.');
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
                    // Request camera and microphone
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            facingMode: 'user'
                        }
                    });
                    
                    // Set local video
                    const localVideo = document.getElementById('local-video');
                    if (localVideo) {
                        localVideo.srcObject = this.localStream;
                        localVideo.muted = true; // Mute local video to prevent echo
                    }
                    
                    // Set main stream (initially local stream)
                    this.mainStream = this.localStream;
                    const mainVideo = this.$refs.mainVideo;
                    if (mainVideo) {
                        mainVideo.srcObject = this.mainStream;
                        mainVideo.muted = true; // Mute main video when it's local stream
                    }
                    
                    console.log("Local media stream acquired:", this.localStream);
                    return this.localStream;
                } catch (error) {
                    console.error("Error requesting user media:", error);
                    
                    if (error.name === 'NotAllowedError') {
                        showToast('error', 'Permission Denied', 'You need to grant camera and microphone permissions to join the session.');
                    } else {
                        showToast('error', 'Media Error', 'Could not access camera or microphone. Please check your device settings.');
                    }
                    
                    throw error;
                }
            },
            
            // Toggle audio mute
            toggleAudio() {
                if (this.localStream) {
                    const audioTracks = this.localStream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        this.audioEnabled = !this.audioEnabled;
                        audioTracks.forEach(track => {
                            track.enabled = this.audioEnabled;
                        });
                        
                        // Notify other participants about media status change
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            this.websocket.send(JSON.stringify({
                                type: 'media_status',
                                user_id: userId,
                                username: userName,
                                audioEnabled: this.audioEnabled,
                                videoEnabled: this.videoEnabled
                            }));
                        }
                    }
                }
            },
            
            // Toggle video
            toggleVideo() {
                if (this.localStream) {
                    const videoTracks = this.localStream.getVideoTracks();
                    if (videoTracks.length > 0) {
                        this.videoEnabled = !this.videoEnabled;
                        videoTracks.forEach(track => {
                            track.enabled = this.videoEnabled;
                        });
                        
                        // Notify other participants about media status change
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            this.websocket.send(JSON.stringify({
                                type: 'media_status',
                                user_id: userId,
                                username: userName,
                                audioEnabled: this.audioEnabled,
                                videoEnabled: this.videoEnabled
                            }));
                        }
                    }
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