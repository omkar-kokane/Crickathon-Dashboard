"""
Firebase Realtime Database sync service.
Pushes event state and action request updates so all connected
frontend clients receive instant WebSocket updates without polling.
"""
import json
from firebase_admin import db
from app.core.firebase import get_firebase_app


def _get_ref(path: str):
    get_firebase_app()
    return db.reference(path)


def push_event_state(event) -> None:
    """
    Push the current event phase and timer to Firebase Realtime DB.
    Path: /events/{event_id}
    """
    phase_end_time_iso = None
    if event.phase_end_time:
        phase_end_time_iso = event.phase_end_time.isoformat()

    _get_ref(f"/events/{event.event_id}").set({
        "event_id": str(event.event_id),
        "current_phase": event.current_phase.value,
        "phase_end_time": phase_end_time_iso,
    })


def push_action_request_update(request) -> None:
    """
    Push action request state changes to Firebase.
    Path: /action_requests/{event_id}/{request_id}
    Umpire listens to /action_requests/{event_id} for PENDING requests.
    Participants listen to /action_requests/{event_id}/{team_id} for resolution.
    """
    resolved_at_iso = None
    if request.resolved_at:
        resolved_at_iso = request.resolved_at.isoformat()

    _get_ref(f"/action_requests/{request.event_id}/{request.request_id}").set({
        "request_id": str(request.request_id),
        "team_id": str(request.team_id),
        "event_id": str(request.event_id),
        "type": request.type.value,
        "status": request.status.value,
        "created_at": request.created_at.isoformat(),
        "resolved_at": resolved_at_iso,
    })
