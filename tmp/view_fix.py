    for session_req in session_requests:
        activity = {
            'type': 'request',
            'type_color': 'indigo',
            'title': session_req.title,
            'mentor': session_req.mentor,
            'timestamp': session_req.created_at,
            'status': session_req.get_status_display(),
            'status_color': 'green' if session_req.status == 'accepted' else 'blue' if session_req.status == 'counter_offer' else 'yellow' if session_req.status == 'pending' else 'red',
            'description': session_req.description,
            'schedule': session_req.proposed_time,
            'duration': session_req.duration,
            'price': session_req.budget,
            'request_id': session_req.id,
            'can_confirm': session_req.status == 'counter_offer'
        }
        activities.append(activity)