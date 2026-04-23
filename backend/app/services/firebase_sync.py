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

    eid = str(event.event_id).lower()
    data = {
        "event_id": eid,
        "name": event.name,
        "current_phase": event.current_phase.value,
        "phase_name": event.phase_name,
        "phase_end_time": phase_end_time_iso,
    }
    # Update both the specific event and the summary list
    _get_ref(f"/events/{eid}").set(data)
    _get_ref(f"/event_list/{eid}").set(data)
    print("🔥 PUSH EVENT:", data) #-----------------------------------test comment


def push_action_request_update(request) -> None:
    """
    Push action request state changes to Firebase.
    Path: /action_requests/{event_id}/{request_id}
    """
    resolved_at_iso = None
    if request.resolved_at:
        resolved_at_iso = request.resolved_at.isoformat()

    eid = str(request.event_id).lower()
    rid = str(request.request_id).lower()
    tid = str(request.team_id).lower()

    _get_ref(f"/action_requests/{eid}/{rid}").set({
        "request_id": rid,
        "team_id": tid,
        "event_id": eid,
        "type": request.type.value,
        "status": request.status.value,
        "created_at": request.created_at.isoformat(),
        "resolved_at": resolved_at_iso,
    })


def push_team_update(team) -> None:
    """
    Push team scores and wallet balances to Firebase.
    Path: /teams/{event_id}/{team_id}
    """
    eid = str(team.event_id).lower()
    tid = str(team.team_id).lower()
    uid = str(team.umpire_id).lower() if team.umpire_id else None

    _get_ref(f"/teams/{eid}/{tid}").set({
        "team_id": tid,
        "event_id": eid,
        "name": team.name,
        "invite_code": team.invite_code,
        "wallet_balance": team.wallet_balance,
        "total_runs": team.total_runs,
        "umpire_id": uid
    })


def push_user_update(user) -> None:
    """
    Push user role/profile changes to Firebase.
    Path: /users/{user_id}
    """
    uid = str(user.user_id).lower()
    _get_ref(f"/users/{uid}").set({
        "user_id": uid,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role.value,
        # "is_active": user.is_active,
    })
