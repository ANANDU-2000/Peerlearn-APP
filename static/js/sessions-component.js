/**
 * Session List Component for PeerLearn
 * Alpine.js component for handling session lists with filtering and WebSocket updates
 */

document.addEventListener('DOMContentLoaded', function() {
    // Define the Alpine.js component
    window.sessionsComponent = function() {
        return {
            // State
            sessions: [],
            filteredSessions: [],
            isLoading: true,
            activeFilter: 'all',
            dateFilter: 'upcoming',
            searchQuery: '',
            sortField: 'schedule',
            sortDirection: 'asc',
            
            // Initialize the component
            init() {
                this.setupWebSocketListeners();
                this.loadSessions();
                
                // Subscribe to channel for all sessions updates
                if (window.DashboardWebSocket) {
                    window.DashboardWebSocket.subscribe('sessions:all');
                }
            },
            
            // Setup WebSocket event listeners
            setupWebSocketListeners() {
                if (!window.DashboardWebSocket) return;
                
                // Listen for sessions data updates
                window.DashboardWebSocket.on('sessions_data', (data) => {
                    this.handleSessionsData(data);
                });
                
                // Listen for individual session updates
                window.DashboardWebSocket.on('session_update', (data) => {
                    this.handleSessionUpdate(data);
                });
                
                // Listen for booking updates
                window.DashboardWebSocket.on('booking_update', (data) => {
                    this.handleBookingUpdate(data);
                });
            },
            
            // Load sessions via WebSocket or fallback to AJAX
            loadSessions() {
                this.isLoading = true;
                
                // Try to load via WebSocket
                if (window.DashboardWebSocket && window.DashboardWebSocket.connected) {
                    window.DashboardWebSocket.fetchSessions({
                        date: this.dateFilter,
                        ordering: this.sortDirection === 'asc' ? this.sortField : `-${this.sortField}`
                    });
                } else {
                    // Fallback to AJAX
                    fetch(`/api/sessions/?date=${this.dateFilter}&ordering=${this.sortDirection === 'asc' ? this.sortField : `-${this.sortField}`}`)
                        .then(response => response.json())
                        .then(data => {
                            this.handleSessionsData({ sessions: data });
                        })
                        .catch(error => {
                            console.error('Error fetching sessions:', error);
                            this.isLoading = false;
                        });
                }
            },
            
            // Handle sessions data from WebSocket or AJAX
            handleSessionsData(data) {
                this.sessions = data.sessions || [];
                this.applyFilters();
                this.isLoading = false;
            },
            
            // Handle individual session update
            handleSessionUpdate(data) {
                // Find and update the session in the list
                const index = this.sessions.findIndex(s => s.id === data.session_id);
                
                if (index !== -1) {
                    // Update the session status
                    this.sessions[index].status = data.status;
                    
                    // If status is now 'live', update the can_join flag
                    if (data.status === 'live') {
                        this.sessions[index].can_join = true;
                    } else if (data.status === 'completed') {
                        this.sessions[index].can_join = false;
                    }
                    
                    // Reapply filters
                    this.applyFilters();
                } else {
                    // Session not in list, reload all sessions
                    this.loadSessions();
                }
            },
            
            // Handle booking update
            handleBookingUpdate(data) {
                // Find and update the session in the list
                const index = this.sessions.findIndex(s => s.id === data.session_id);
                
                if (index !== -1) {
                    // If there's a booking property on the session, update it
                    if (this.sessions[index].booking) {
                        this.sessions[index].booking.status = data.status;
                    }
                    
                    // Reapply filters
                    this.applyFilters();
                } else {
                    // Session not in list, reload all sessions
                    this.loadSessions();
                }
            },
            
            // Apply filters to sessions
            applyFilters() {
                let result = [...this.sessions];
                
                // Apply date filter
                if (this.dateFilter === 'today') {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    
                    result = result.filter(session => {
                        const sessionDate = new Date(session.schedule);
                        return sessionDate >= today && sessionDate < tomorrow;
                    });
                } else if (this.dateFilter === 'upcoming') {
                    const now = new Date();
                    
                    result = result.filter(session => {
                        const sessionDate = new Date(session.schedule);
                        return sessionDate > now && session.status !== 'completed';
                    });
                } else if (this.dateFilter === 'past') {
                    const now = new Date();
                    
                    result = result.filter(session => {
                        const sessionDate = new Date(session.schedule);
                        return sessionDate < now || session.status === 'completed';
                    });
                }
                
                // Apply status filter (if not 'all')
                if (this.activeFilter !== 'all') {
                    result = result.filter(session => session.status === this.activeFilter);
                }
                
                // Apply search filter
                if (this.searchQuery.trim()) {
                    const query = this.searchQuery.toLowerCase().trim();
                    
                    result = result.filter(session => {
                        return (
                            (session.title && session.title.toLowerCase().includes(query)) ||
                            (session.description && session.description.toLowerCase().includes(query)) ||
                            (session.mentor_name && session.mentor_name.toLowerCase().includes(query))
                        );
                    });
                }
                
                // Apply sorting
                result.sort((a, b) => {
                    let aValue = a[this.sortField];
                    let bValue = b[this.sortField];
                    
                    // Handle special fields
                    if (this.sortField === 'schedule') {
                        aValue = new Date(aValue || 0).getTime();
                        bValue = new Date(bValue || 0).getTime();
                    }
                    
                    // Compare values
                    if (aValue < bValue) {
                        return this.sortDirection === 'asc' ? -1 : 1;
                    }
                    if (aValue > bValue) {
                        return this.sortDirection === 'asc' ? 1 : -1;
                    }
                    return 0;
                });
                
                this.filteredSessions = result;
            },
            
            // Set the date filter
            setDateFilter(filter) {
                if (this.dateFilter === filter) return;
                
                this.dateFilter = filter;
                this.loadSessions();
            },
            
            // Set the status filter
            setStatusFilter(filter) {
                this.activeFilter = filter;
                this.applyFilters();
            },
            
            // Set the sort field and direction
            setSorting(field) {
                if (this.sortField === field) {
                    // Toggle direction if clicking the same field
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    // New field, default to ascending
                    this.sortField = field;
                    this.sortDirection = 'asc';
                }
                
                this.loadSessions();
            },
            
            // Handle search input
            handleSearch(event) {
                this.searchQuery = event.target.value;
                this.applyFilters();
            },
            
            // Subscribe to updates for a specific session
            subscribeToSession(sessionId) {
                if (window.DashboardWebSocket) {
                    window.DashboardWebSocket.subscribe(`session:${sessionId}`);
                }
            },
            
            // Unsubscribe from updates for a specific session
            unsubscribeFromSession(sessionId) {
                if (window.DashboardWebSocket) {
                    window.DashboardWebSocket.unsubscribe(`session:${sessionId}`);
                }
            },
            
            // Format a date
            formatDate(dateString) {
                if (!dateString) return 'TBD';
                
                const date = new Date(dateString);
                return date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            },
            
            // Calculate time remaining until session
            getTimeRemaining(dateString) {
                if (!dateString) return 'TBD';
                
                const sessionDate = new Date(dateString);
                const now = new Date();
                
                // If session is in the past, return 'Ended'
                if (sessionDate < now) {
                    return 'Ended';
                }
                
                // Calculate time difference
                const diff = Math.floor((sessionDate - now) / 1000);
                
                // Calculate days, hours, minutes
                const days = Math.floor(diff / 86400);
                const hours = Math.floor((diff % 86400) / 3600);
                const minutes = Math.floor((diff % 3600) / 60);
                
                // Build the string
                if (days > 0) {
                    return `${days}d ${hours}h`;
                } else if (hours > 0) {
                    return `${hours}h ${minutes}m`;
                } else {
                    return `${minutes}m`;
                }
            },
            
            // Get status label class
            getStatusClass(status) {
                switch (status) {
                    case 'scheduled':
                        return 'bg-blue-100 text-blue-800';
                    case 'live':
                        return 'bg-green-100 text-green-800';
                    case 'completed':
                        return 'bg-gray-100 text-gray-800';
                    case 'canceled':
                        return 'bg-red-100 text-red-800';
                    default:
                        return 'bg-gray-100 text-gray-800';
                }
            }
        };
    };
});