"""
Firebase Realtime Database sync service.
Pushes event state and action request updates so all connected
frontend clients receive instant WebSocket updates without polling.
"""
import logging
from firebase_admin import db
from app.core.firebase import get_firebase_app

logger = logging.getLogger(__name__)


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
        raw = event.phase_end_time.isoformat()
        # Ensure JS always treats this as UTC
        if not raw.endswith("Z") and "+" not in raw and "-" not in raw[10:]:
            raw += "Z"
        phase_end_time_iso = raw

    eid = str(event.event_id).lower()
    data = {
        "event_id": eid,
        "name": event.name,
        "current_phase": event.current_phase.value if hasattr(event.current_phase, 'value') else event.current_phase,
        "phase_name": event.phase_name,
        "phase_end_time": phase_end_time_iso,
    }
    try:
        _get_ref(f"/events/{eid}").set(data)
        _get_ref(f"/event_list/{eid}").set(data)
        logger.info(f"[Firebase Sync] PUSH EVENT {eid}: phase={data.get('current_phase')}, end={data.get('phase_end_time')}")
    except Exception as e:
        logger.error(f"[Firebase Sync] Failed to push event state for {eid}: {e}")


def push_action_request_update(request) -> None:
    """
    Push action request state changes to Firebase.
    Path: /action_requests/{event_id}/{request_id}
    """
    resolved_at_iso = None
    if request.resolved_at:
        resolved_at_iso = request.resolved_at.isoformat()

    action_timer_end_iso = None
    if request.action_timer_end:
        raw = request.action_timer_end.isoformat()
        if not raw.endswith("Z") and "+" not in raw and "-" not in raw[10:]:
            raw += "Z"
        action_timer_end_iso = raw

    eid = str(request.event_id).lower()
    rid = str(request.request_id).lower()
    tid = str(request.team_id).lower()

    payload = {
        "request_id": rid,
        "team_id": tid,
        "event_id": eid,
        "type": request.type.value if hasattr(request.type, 'value') else request.type,
        "status": request.status.value if hasattr(request.status, 'value') else request.status,
        "created_at": request.created_at.isoformat(),
        "resolved_at": resolved_at_iso,
        "message": request.message or "",
        "action_timer_end": action_timer_end_iso,
        "forwarded_to_admin": request.forwarded_to_admin,
        "admin_status": request.admin_status,
        "admin_notes": request.admin_notes,
        "umpire_deduction_amount": request.umpire_deduction_amount,
        "duration_minutes": request.duration_minutes,
        "point_cost": request.point_cost,
    }

    try:
        _get_ref(f"/action_requests/{eid}/{rid}").set(payload)
    except Exception as e:
        logger.error(f"[Firebase Sync] Failed to push action request {rid}: {e}")


def push_team_timer(event_id: str, team_id: str, action_type: str, end_time_iso: str, label: str = "") -> None:
    """
    Push a team-specific action timer to Firebase.
    Path: /team_timers/{event_id}/{team_id}/{action_type}
    """
    eid = event_id.lower()
    tid = team_id.lower()
    at = action_type.upper()

    try:
        _get_ref(f"/team_timers/{eid}/{tid}/{at}").set({
            "action_type": at,
            "end_time": end_time_iso,
            "label": label,
            "active": True,
        })
        logger.info(f"[Firebase Sync] PUSH TIMER {at} for team {tid}: end={end_time_iso}")
    except Exception as e:
        logger.error(f"[Firebase Sync] Failed to push team timer {at} for {tid}: {e}")


def clear_team_timer(event_id: str, team_id: str, action_type: str) -> None:
    """Remove a team-specific action timer from Firebase."""
    eid = event_id.lower()
    tid = team_id.lower()
    at = action_type.upper()

    try:
        _get_ref(f"/team_timers/{eid}/{tid}/{at}").set({
            "action_type": at,
            "end_time": None,
            "label": "",
            "active": False,
        })
    except Exception as e:
        logger.error(f"[Firebase Sync] Failed to clear team timer {at} for {tid}: {e}")


def push_admin_request(request) -> None:
    """
    Push a forwarded request to Firebase so admin dashboard gets real-time updates.
    Path: /admin_requests/{event_id}/{request_id}
    """
    eid = str(request.event_id).lower()
    rid = str(request.request_id).lower()
    tid = str(request.team_id).lower()

    try:
        _get_ref(f"/admin_requests/{eid}/{rid}").set({
            "request_id": rid,
            "team_id": tid,
            "event_id": eid,
            "type": request.type.value if hasattr(request.type, 'value') else request.type,
            "status": request.status.value if hasattr(request.status, 'value') else request.status,
            "message": request.message or "",
            "umpire_deduction_amount": request.umpire_deduction_amount,
            "forwarded_to_admin": True,
            "admin_status": request.admin_status,
            "admin_notes": request.admin_notes,
            "created_at": request.created_at.isoformat(),
        })
    except Exception as e:
        logger.error(f"[Firebase Sync] Failed to push admin request {rid}: {e}")


def push_team_update(team, last_reason: str = None, last_amount: int = None) -> None:
    """
    Push team scores and wallet balances to Firebase.
    Path: /teams/{event_id}/{team_id}
    """
    eid = str(team.event_id).lower()
    tid = str(team.team_id).lower()
    uid = str(team.umpire_id).lower() if team.umpire_id else None

    payload = {
        "team_id": tid,
        "event_id": eid,
        "name": team.name,
        "invite_code": team.invite_code,
        "wallet_balance": team.wallet_balance,
        "total_runs": team.total_runs,
        "umpire_id": uid,
    }
    if last_reason is not None:
        payload["last_reason"] = last_reason
    if last_amount is not None:
        payload["last_amount"] = last_amount

    try:
        _get_ref(f"/teams/{eid}/{tid}").set(payload)
    except Exception as e:
        logger.error(f"[Firebase Sync] Failed to push team {tid}: {e}")


def push_user_update(user) -> None:
    """
    Push user role/profile changes to Firebase.
    Path: /users/{user_id}
    """
    uid = str(user.user_id).lower()
    try:
        _get_ref(f"/users/{uid}").set({
            "user_id": uid,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role.value,
        })
    except Exception as e:
        logger.error(f"[Firebase Sync] Failed to push user {uid}: {e}")
