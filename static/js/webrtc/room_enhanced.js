/**
 * PeerLearn WebRTC Room - Enhanced Implementation
 * Complete rewrite with improved WebRTC connectivity, video display, and user interface
 */

// Define WebRTC room functionality with Alpine.js
document.addEventListener('alpine:init', () => {
    Alpine.data('webRTCRoom', () => ({
        // Constants from global scope
        ROOM_CODE: roomCode,
        USER_ID: userId,
        USER_NAME: userName,
        USER_ROLE: userRole,
        
        // State variables
        localStream: null,
        remoteStreams: {},
        mainUserId: null,
        mainUserName: null,
        mainUserRole: null,
        peerConnections: {},
        websocket: null,
        otherParticipants: [],
        
        // Media control state
        videoEnabled: true,
        audioEnabled: true,
        isScreenSharing: false,
        screenShareStream: null,
        showChat: true,
        layoutType: 'grid',
        
        // Session info
        sessionStatus: 'connecting',
        sessionTimer: null,
        sessionStartTime: null,
        sessionTime: '00:00:00',
        
        // Chat functionality
        chatMessages: [],
        newMessage: '',
        
        // Connection status
        connectionStatus: 'Connecting',
        connectionStatusClass: 'connecting',
        isConnected: false,
        
        // Remote user state
        remoteUserName: null,
        remoteUserRole: null,
        remoteVideoEnabled: true,
        isRemoteMuted: false,
        
        // Feedback modal
        showFeedbackModal: false,
        rating: 0,
        feedbackText: '',
        
        // Initialization
        init() {
            console.log(`Initializing WebRTC room: ${this.ROOM_CODE} for user: ${this.USER_ID}`);
            
            // Set up event listeners for window/tab visibility
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.isConnected) {
                    console.log('Tab became visible, checking connections');
                    this.checkConnections();
                }
            });
            
            // Setup beforeunload to handle clean disconnection
            window.addEventListener('beforeunload', () => {
                this.cleanup();
            });
            
            // Start the WebRTC setup
            this.setupWebRTC().then(() => {
                console.log('WebRTC setup completed');
                this.startSessionTimer();
            }).catch(err => {
                console.error('Error setting up WebRTC:', err);
                alert('Failed to initialize video call. Please refresh the page and try again.');
            });
        },
        
        // Handle autoplay issues that might occur on some browsers
        checkForAutoplayIssues() {
            const mainVideo = document.getElementById('main-video');
            const localVideo = document.getElementById('local-video');
            
            if (mainVideo) this.tryPlayVideo(mainVideo, 'main video');
            if (localVideo) this.tryPlayVideo(localVideo, 'local video');
        },
        
        // Try to play a video element, handling autoplay restrictions
        async tryPlayVideo(videoElement, description) {
            if (videoElement.paused && videoElement.srcObject) {
                try {
                    await videoElement.play();
                    console.log(`Started playing ${description}`);
                } catch (e) {
                    console.warn(`Autoplay prevented for ${description}:`, e);
                    this.addPlayButtonOverlay();
                }
            }
        },
        
        // Add a play button overlay when autoplay is restricted
        addPlayButtonOverlay() {
            // Check if overlay already exists
            if (document.getElementById('autoplay-overlay')) return;
            
            const overlay = document.createElement('div');
            overlay.id = 'autoplay-overlay';
            overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50';
            
            const button = document.createElement('button');
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg><span>Click to Enable Audio & Video</span>';
            button.className = 'bg-blue-600 text-white px-4 py-3 rounded-lg flex items-center font-medium hover:bg-blue-700 transition';
            button.onclick = () => {
                this.tryPlayAllVideos();
                overlay.remove();
            };
            
            overlay.appendChild(button);
            document.body.appendChild(overlay);
        },
        
        // Try to play all video elements to handle autoplay restrictions
        tryPlayAllVideos() {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                if (video.paused && video.srcObject) {
                    video.play().catch(e => console.warn('Could not play video:', e));
                }
            });
        },
        
        // Remove the play button overlay
        removePlayButtonOverlay() {
            const overlay = document.getElementById('autoplay-overlay');
            if (overlay) overlay.remove();
        },
        
        // Setup WebRTC functionality
        async setupWebRTC() {
            try {
                console.log('Setting up WebRTC with room code:', this.ROOM_CODE);
                
                // Connect WebSocket first
                await this.connectWebSocket();
                
                // Request camera and microphone access
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: true
                    });
                    
                    this.localStream = stream;
                    
                    // Set the local video stream
                    if (this.localVideo) {
                        this.localVideo.srcObject = stream;
                        this.localVideo.muted = true; // Always mute local video to prevent echo
                        console.log('Local stream attached to video element');
                    } else {
                        console.error('Local video element not found');
                    }
                    
                    // Set initial stream states
                    this.updateVideoStatus();
                    this.updateAudioStatus();
                    
                    // Check for autoplay issues
                    this.checkForAutoplayIssues();
                    
                    console.log('Media devices accessed successfully');
                } catch (err) {
                    console.error('Error accessing media devices:', err);
                    alert('Could not access camera or microphone. Please ensure they are connected and permissions are granted.');
                    throw err;
                }
            } catch (err) {
                console.error('Error in setupWebRTC:', err);
                throw err;
            }
        },
        
        // Connect to WebSocket for signaling
        async connectWebSocket() {
            return new Promise((resolve, reject) => {
                // Clear any existing connection
                if (this.websocket) {
                    this.websocket.close();
                    this.websocket = null;
                }
                
                // List of possible WebSocket endpoints for redundancy
                const wsEndpoints = [
                    `ws://${window.location.host}/ws/session/${this.ROOM_CODE}/`,
                    `ws://${window.location.host}/ws/sessions/${this.ROOM_CODE}/`,
                    `ws://${window.location.host}/ws/room/${this.ROOM_CODE}/`
                ];
                
                // Try the first endpoint
                this.tryWebSocketConnection(wsEndpoints, 0, resolve, reject);
            });
        },
        
        // Helper to try WebSocket connection with fallbacks
        tryWebSocketConnection(endpoints, index, resolve, reject) {
            if (index >= endpoints.length) {
                this.connectionStatus = 'Failed';
                this.connectionStatusClass = 'error';
                console.error('All WebSocket endpoints failed');
                reject(new Error('All WebSocket connection attempts failed'));
                return;
            }
            
            const wsUrl = endpoints[index];
            console.log(`Attempting to connect to WebSocket: ${wsUrl}`);
            
            try {
                const ws = new WebSocket(wsUrl);
                
                ws.onopen = (event) => {
                    console.log('WebSocket connected!', event);
                    this.websocket = ws;
                    this.wsCurrentEndpoint = wsUrl;
                    this.wsConnectedOnce = true;
                    this.wsReconnectAttempts = 0;
                    this.connectionStatus = 'Connected';
                    this.connectionStatusClass = 'connected';
                    this.isConnected = true;
                    
                    // Send join message
                    this.sendWebSocketMessage({
                        type: 'join',
                        user_id: this.USER_ID,
                        username: this.USER_NAME,
                        role: this.USER_ROLE
                    });
                    
                    // Start the heartbeat
                    this.startHeartbeat();
                    
                    resolve();
                };
                
                ws.onmessage = (event) => this.onWebSocketMessage(event);
                
                ws.onclose = (event) => {
                    console.log('WebSocket closed:', event);
                    this.isConnected = false;
                    this.connectionStatus = 'Disconnected';
                    this.connectionStatusClass = 'error';
                    
                    // Try to reconnect if it was previously connected
                    if (this.wsConnectedOnce && !this.isReconnecting) {
                        this.isReconnecting = true;
                        console.log('Attempting to reconnect...');
                        
                        // Try the same endpoint first, then fall back to others
                        setTimeout(() => {
                            this.reconnectWebSocket();
                        }, 2000);
                    }
                };
                
                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    // Try the next endpoint
                    this.tryWebSocketConnection(endpoints, index + 1, resolve, reject);
                };
            } catch (error) {
                console.error('Error creating WebSocket:', error);
                // Try the next endpoint
                this.tryWebSocketConnection(endpoints, index + 1, resolve, reject);
            }
        },
        
        // Reconnect WebSocket after disconnection
        reconnectWebSocket() {
            if (this.wsReconnectAttempts > 5) {
                console.error('Too many reconnection attempts, giving up');
                this.isReconnecting = false;
                this.connectionStatus = 'Failed';
                this.connectionStatusClass = 'error';
                alert('Connection lost. Please refresh the page to reconnect.');
                return;
            }
            
            this.wsReconnectAttempts++;
            this.connectionStatus = 'Reconnecting';
            this.connectionStatusClass = 'connecting';
            console.log(`Reconnection attempt ${this.wsReconnectAttempts}`);
            
            this.connectWebSocket()
                .then(() => {
                    console.log('Reconnected successfully');
                    this.isReconnecting = false;
                })
                .catch(err => {
                    console.error('Reconnection failed:', err);
                    // Try again with exponential backoff
                    setTimeout(() => {
                        this.reconnectWebSocket();
                    }, 2000 * Math.pow(2, this.wsReconnectAttempts));
                });
        },
        
        // Start a heartbeat to keep the connection alive
        startHeartbeat() {
            // Clear any existing heartbeat
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }
            
            // Send a heartbeat every 30 seconds
            this.heartbeatInterval = setInterval(() => {
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.sendWebSocketMessage({
                        type: 'heartbeat',
                        user_id: this.USER_ID
                    });
                }
            }, 30000);
        },
        
        // Handle incoming WebSocket messages
        async onWebSocketMessage(event) {
            try {
                const message = JSON.parse(event.data);
                console.log('Received WebSocket message:', message);
                
                // Update last message time
                this.wsLastMessageTime = Date.now();
                
                switch (message.type) {
                    case 'join':
                        // Another participant joined
                        if (message.user_id !== this.USER_ID) {
                            console.log(`User ${message.username} (${message.user_id}) joined the room`);
                            
                            // Add to participants list if not already there
                            if (!this.otherParticipants.some(p => p.id === message.user_id)) {
                                this.otherParticipants.push({
                                    id: message.user_id,
                                    name: message.username,
                                    role: message.role
                                });
                            }
                            
                            // Create peer connection for the new participant
                            await this.createPeerConnection(message.user_id, message.username, message.role);
                            
                            // Create and send an offer
                            const pc = this.peerConnections[message.user_id];
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            
                            this.sendWebSocketMessage({
                                type: 'offer',
                                target: message.user_id,
                                sdp: pc.localDescription
                            });
                            
                            // Set as main user if this is the first remote participant
                            if (!this.mainUserId && message.user_id !== this.USER_ID) {
                                this.mainUserId = message.user_id;
                                this.mainUserName = message.username;
                                this.mainUserRole = message.role;
                                this.remoteUserName = message.username;
                                this.remoteUserRole = message.role;
                            }
                            
                            // Update the chat
                            this.chatMessages.push({
                                type: 'system',
                                message: `${message.username} joined the session`
                            });
                            
                            // Play notification sound
                            this.playNotificationSound();
                        }
                        break;
                        
                    case 'offer':
                        // Handle an offer from another participant
                        if (message.target === this.USER_ID) {
                            console.log('Received offer:', message);
                            
                            // Get the sender ID
                            const senderId = message.sender;
                            const senderName = message.sender_name || 'Unknown User';
                            const senderRole = message.sender_role || 'unknown';
                            
                            // Check if we already have a connection for this user
                            if (!this.peerConnections[senderId]) {
                                await this.createPeerConnection(senderId, senderName, senderRole);
                            }
                            
                            const pc = this.peerConnections[senderId];
                            
                            // Set remote description from the offer
                            try {
                                await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
                                
                                // Create an answer
                                const answer = await pc.createAnswer();
                                await pc.setLocalDescription(answer);
                                
                                // Send the answer back
                                this.sendWebSocketMessage({
                                    type: 'answer',
                                    target: senderId,
                                    sdp: pc.localDescription
                                });
                            } catch (err) {
                                console.error('Error handling offer:', err);
                            }
                            
                            // Set as main user if none is set
                            if (!this.mainUserId && senderId !== this.USER_ID) {
                                this.mainUserId = senderId;
                                this.mainUserName = senderName;
                                this.mainUserRole = senderRole;
                                this.remoteUserName = senderName;
                                this.remoteUserRole = senderRole;
                            }
                        }
                        break;
                        
                    case 'answer':
                        // Handle an answer to our offer
                        if (message.target === this.USER_ID) {
                            console.log('Received answer:', message);
                            
                            const senderId = message.sender;
                            const pc = this.peerConnections[senderId];
                            
                            if (pc) {
                                try {
                                    await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
                                    console.log(`Connection established with ${senderId}`);
                                } catch (err) {
                                    console.error('Error setting remote description from answer:', err);
                                }
                            } else {
                                console.warn(`Received answer for unknown peer: ${senderId}`);
                            }
                        }
                        break;
                        
                    case 'ice_candidate':
                        // Handle ICE candidate from another participant
                        if (message.target === this.USER_ID) {
                            console.log('Received ICE candidate:', message);
                            
                            const senderId = message.sender;
                            const pc = this.peerConnections[senderId];
                            
                            if (pc) {
                                try {
                                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                                    console.log(`Added ICE candidate from ${senderId}`);
                                } catch (err) {
                                    console.error('Error adding ICE candidate:', err);
                                }
                            } else {
                                console.warn(`Received ICE candidate for unknown peer: ${senderId}`);
                            }
                        }
                        break;
                        
                    case 'leave':
                        // Handle a participant leaving
                        const leaveUserId = message.user_id;
                        if (leaveUserId !== this.USER_ID) {
                            console.log(`User ${leaveUserId} left the room`);
                            
                            // Remove from participants list
                            this.otherParticipants = this.otherParticipants.filter(p => p.id !== leaveUserId);
                            
                            // Clean up the peer connection
                            if (this.peerConnections[leaveUserId]) {
                                this.peerConnections[leaveUserId].close();
                                delete this.peerConnections[leaveUserId];
                            }
                            
                            // Remove the stream
                            if (this.remoteStreams[leaveUserId]) {
                                delete this.remoteStreams[leaveUserId];
                            }
                            
                            // Update main video if it was this user
                            if (this.mainUserId === leaveUserId) {
                                // Find another participant or reset
                                if (this.otherParticipants.length > 0) {
                                    const otherUser = this.otherParticipants[0];
                                    this.mainUserId = otherUser.id;
                                    this.mainUserName = otherUser.name;
                                    this.mainUserRole = otherUser.role;
                                    this.remoteUserName = otherUser.name;
                                    this.remoteUserRole = otherUser.role;
                                } else {
                                    this.mainUserId = null;
                                    this.mainUserName = null;
                                    this.mainUserRole = null;
                                    this.remoteUserName = null;
                                    this.remoteUserRole = null;
                                    
                                    // Clear main video
                                    if (this.mainVideo) {
                                        this.mainVideo.srcObject = null;
                                    }
                                }
                            }
                            
                            // Update the chat
                            this.chatMessages.push({
                                type: 'system',
                                message: `${message.username} left the session`
                            });
                        }
                        break;
                        
                    case 'chat':
                        // Handle chat message
                        if (message.sender !== this.USER_ID) {
                            console.log('Received chat message:', message);
                            
                            this.chatMessages.push({
                                sender: message.sender_name,
                                message: message.message
                            });
                            
                            // Play notification sound
                            this.playNotificationSound();
                        }
                        break;
                        
                    case 'media_status':
                        // Handle media status update (video/audio enabled/disabled)
                        if (message.user_id !== this.USER_ID) {
                            console.log('Media status update:', message);
                            
                            if (message.media_type === 'video') {
                                this.remoteVideoEnabled = message.enabled;
                            } else if (message.media_type === 'audio') {
                                this.isRemoteMuted = !message.enabled;
                            }
                        }
                        break;
                        
                    case 'error':
                        console.error('Received error message:', message);
                        break;
                        
                    default:
                        console.log('Unhandled message type:', message.type);
                }
            } catch (err) {
                console.error('Error processing WebSocket message:', err, event.data);
            }
        },
        
        // Create a peer connection for a user
        async createPeerConnection(userId, username, role) {
            console.log(`Creating peer connection for ${username} (${userId})`);
            
            // Use the ICE servers configuration
            const config = { iceServers };
            console.log('Using ICE servers:', config);
            
            try {
                // Create the peer connection
                const pc = new RTCPeerConnection(config);
                this.peerConnections[userId] = pc;
                
                // Add local stream tracks to the connection
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => {
                        pc.addTrack(track, this.localStream);
                    });
                }
                
                // Handle ICE candidates
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        this.sendWebSocketMessage({
                            type: 'ice_candidate',
                            target: userId,
                            candidate: event.candidate
                        });
                    }
                };
                
                // Handle ICE connection state changes
                pc.oniceconnectionstatechange = () => {
                    console.log(`ICE connection state with ${username}: ${pc.iceConnectionState}`);
                };
                
                // Handle track events to get remote streams
                pc.ontrack = (event) => {
                    console.log(`Received track from ${username}:`, event.track.kind);
                    
                    // Store the remote stream
                    this.remoteStreams[userId] = event.streams[0];
                    
                    // If this is the main user, set the main video
                    if (userId === this.mainUserId && this.mainVideo) {
                        this.mainVideo.srcObject = event.streams[0];
                        this.tryPlayVideo(this.mainVideo, 'main video');
                    }
                    
                    // Mark remote video as enabled
                    this.remoteVideoEnabled = true;
                };
                
                return pc;
            } catch (err) {
                console.error('Error creating peer connection:', err);
                throw err;
            }
        },
        
        // Send a message through the WebSocket
        sendWebSocketMessage(message) {
            if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
                console.warn('WebSocket is not open, message not sent:', message);
                return;
            }
            
            // Add sender info to the message
            message.sender = this.USER_ID;
            message.sender_name = this.USER_NAME;
            message.sender_role = this.USER_ROLE;
            
            try {
                this.websocket.send(JSON.stringify(message));
            } catch (err) {
                console.error('Error sending WebSocket message:', err);
            }
        },
        
        // Start the session timer
        startSessionTimer() {
            this.sessionStartTime = new Date();
            
            // Update timer every second
            setInterval(() => {
                if (this.sessionStartTime) {
                    const now = new Date();
                    const diff = now - this.sessionStartTime;
                    
                    const hours = Math.floor(diff / 3600000);
                    const minutes = Math.floor((diff % 3600000) / 60000);
                    const seconds = Math.floor((diff % 60000) / 1000);
                    
                    this.sessionTime = 
                        String(hours).padStart(2, '0') + ':' +
                        String(minutes).padStart(2, '0') + ':' +
                        String(seconds).padStart(2, '0');
                }
            }, 1000);
        },
        
        // Toggle local video
        toggleVideoStream() {
            this.videoEnabled = !this.videoEnabled;
            this.updateVideoStatus();
            
            // Notify other participants of the change
            this.sendWebSocketMessage({
                type: 'media_status',
                media_type: 'video',
                enabled: this.videoEnabled
            });
        },
        
        // Toggle local audio
        toggleAudioStream() {
            this.audioEnabled = !this.audioEnabled;
            this.updateAudioStatus();
            
            // Notify other participants of the change
            this.sendWebSocketMessage({
                type: 'media_status',
                media_type: 'audio',
                enabled: this.audioEnabled
            });
        },
        
        // Update video track status
        updateVideoStatus() {
            if (this.localStream) {
                const videoTracks = this.localStream.getVideoTracks();
                videoTracks.forEach(track => {
                    track.enabled = this.videoEnabled;
                });
            }
        },
        
        // Update audio track status
        updateAudioStatus() {
            if (this.localStream) {
                const audioTracks = this.localStream.getAudioTracks();
                audioTracks.forEach(track => {
                    track.enabled = this.audioEnabled;
                });
            }
        },
        
        // Toggle screen sharing
        async toggleScreenSharing() {
            try {
                if (this.isScreenSharing) {
                    // Stop screen sharing
                    if (this.screenShareStream) {
                        this.screenShareStream.getTracks().forEach(track => track.stop());
                        this.screenShareStream = null;
                    }
                    
                    // Replace all tracks with camera tracks
                    for (const userId in this.peerConnections) {
                        const pc = this.peerConnections[userId];
                        const senders = pc.getSenders();
                        
                        // Find video sender and replace track
                        const videoSender = senders.find(sender => 
                            sender.track && sender.track.kind === 'video');
                            
                        if (videoSender && this.localStream) {
                            const videoTrack = this.localStream.getVideoTracks()[0];
                            if (videoTrack) {
                                await videoSender.replaceTrack(videoTrack);
                            }
                        }
                    }
                    
                    // Reset local video
                    if (this.localVideo && this.localStream) {
                        this.localVideo.srcObject = this.localStream;
                    }
                    
                    this.isScreenSharing = false;
                } else {
                    // Start screen sharing
                    this.screenShareStream = await navigator.mediaDevices.getDisplayMedia({
                        video: true
                    });
                    
                    // Set local video to screen share
                    if (this.localVideo) {
                        this.localVideo.srcObject = this.screenShareStream;
                    }
                    
                    // Replace video track in all peer connections
                    const videoTrack = this.screenShareStream.getVideoTracks()[0];
                    
                    for (const userId in this.peerConnections) {
                        const pc = this.peerConnections[userId];
                        const senders = pc.getSenders();
                        
                        // Find video sender and replace track
                        const videoSender = senders.find(sender => 
                            sender.track && sender.track.kind === 'video');
                            
                        if (videoSender) {
                            await videoSender.replaceTrack(videoTrack);
                        }
                    }
                    
                    // Handle screen share ending
                    this.screenShareStream.getVideoTracks()[0].onended = () => {
                        this.toggleScreenSharing();
                    };
                    
                    this.isScreenSharing = true;
                }
                
                // Notify UI of change
                console.log('Screen sharing ' + (this.isScreenSharing ? 'started' : 'stopped'));
            } catch (err) {
                console.error('Error toggling screen share:', err);
                alert('Could not share screen: ' + err.message);
            }
        },
        
        // Toggle chat visibility
        toggleChat() {
            this.showChat = !this.showChat;
        },
        
        // Toggle layout type
        toggleLayout() {
            this.layoutType = this.layoutType === 'grid' ? 'speaker' : 'grid';
        },
        
        // Send a chat message
        sendChatMessage() {
            if (!this.newMessage.trim()) return;
            
            // Add message to local chat
            this.chatMessages.push({
                sender: this.USER_NAME,
                message: this.newMessage
            });
            
            // Send via WebSocket
            this.sendWebSocketMessage({
                type: 'chat',
                message: this.newMessage
            });
            
            // Clear input
            this.newMessage = '';
        },
        
        // End the session
        endSession() {
            if (confirm('Are you sure you want to end this session?')) {
                // Send leave message
                this.sendWebSocketMessage({
                    type: 'leave'
                });
                
                // If user is a mentor, show rating modal
                if (this.USER_ROLE === 'learner') {
                    this.showFeedbackModal = true;
                } else {
                    // Mentor just redirects
                    window.location.href = '/users/dashboard/mentor/?tab=sessions';
                }
            }
        },
        
        // Submit feedback and rating
        submitFeedback() {
            // Get the CSRF token
            const csrfToken = this.getCsrfToken();
            
            // Send feedback to server
            fetch(`/sessions/${this.ROOM_CODE}/feedback/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    rating: this.rating,
                    feedback: this.feedbackText
                })
            })
            .then(response => {
                if (response.ok) {
                    // Redirect to dashboard
                    window.location.href = '/users/dashboard/learner/?tab=sessions';
                } else {
                    console.error('Error submitting feedback:', response);
                    alert('There was a problem submitting your feedback. Please try again.');
                }
            })
            .catch(err => {
                console.error('Error submitting feedback:', err);
                alert('There was a problem submitting your feedback. Please try again.');
            });
        },
        
        // Check connections when tab becomes visible
        checkConnections() {
            // Check if websocket is still connected
            if (this.websocket && this.websocket.readyState !== WebSocket.OPEN) {
                console.log('WebSocket not open, reconnecting...');
                this.reconnectWebSocket();
            }
            
            // Check peer connections
            for (const userId in this.peerConnections) {
                const pc = this.peerConnections[userId];
                if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                    console.log(`Connection with ${userId} is ${pc.connectionState}, reconnecting...`);
                    
                    // Clean up old connection
                    pc.close();
                    
                    // Find user info
                    const participant = this.otherParticipants.find(p => p.id === userId);
                    if (participant) {
                        // Create new connection
                        this.createPeerConnection(userId, participant.name, participant.role)
                            .then(() => {
                                // Create and send an offer
                                const newPc = this.peerConnections[userId];
                                newPc.createOffer()
                                    .then(offer => newPc.setLocalDescription(offer))
                                    .then(() => {
                                        this.sendWebSocketMessage({
                                            type: 'offer',
                                            target: userId,
                                            sdp: newPc.localDescription
                                        });
                                    })
                                    .catch(err => console.error('Error creating offer:', err));
                            })
                            .catch(err => console.error('Error recreating peer connection:', err));
                    }
                }
            }
        },
        
        // Play a notification sound
        playNotificationSound() {
            const sound = document.getElementById('notification-sound');
            if (sound) {
                sound.play().catch(err => console.warn('Could not play notification sound:', err));
            }
        },
        
        // Get CSRF token from cookie or meta tag
        getCsrfToken() {
            // Try to get it from cookie
            const match = document.cookie.match(/csrftoken=([^;]+)/);
            if (match) return match[1];
            
            // Try to get it from meta tag
            const metaTag = document.querySelector('meta[name="csrf-token"]');
            if (metaTag) return metaTag.getAttribute('content');
            
            // Try to get it from hidden input
            const inputTag = document.querySelector('input[name="csrfmiddlewaretoken"]');
            if (inputTag) return inputTag.value;
            
            console.warn('CSRF token not found');
            return '';
        },
        
        // Clean up resources when leaving the page
        cleanup() {
            // Send leave message
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.sendWebSocketMessage({
                    type: 'leave'
                });
            }
            
            // Stop all media tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenShareStream) {
                this.screenShareStream.getTracks().forEach(track => track.stop());
            }
            
            // Close all peer connections
            for (const userId in this.peerConnections) {
                this.peerConnections[userId].close();
            }
            
            // Close websocket
            if (this.websocket) {
                this.websocket.close();
            }
            
            // Clear intervals
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }
        }
    }));
});