import uuid
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.db.base import get_session
from app.core.auth import (
    require_role,
    get_current_user,
    enforce_org_scope,
    enforce_org_on_create,
    is_super_admin,
    get_user_org_id,
)
from app.models.user import UserRole
from app.models.event import Event, EventPhase
from app.models.action_config import ActionConfig
from app.models.action_request import ActionType
from app.services.firebase_sync import push_event_state

router = APIRouter(prefix="/events", tags=["events"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    name: str
    org_id: Optional[uuid.UUID] = None


class EventRead(BaseModel):
    event_id: uuid.UUID
    org_id: Optional[uuid.UUID]
    name: str
    current_phase: EventPhase
    phase_name: Optional[str]
    phase_end_time: Optional[datetime]

    class Config:
        from_attributes = True


class PhaseUpdate(BaseModel):
    phase: EventPhase
    phase_name: Optional[str] = None
    duration_minutes: Optional[int] = None  # None = no timer (e.g. PRE_MATCH, ENDED)


class ActionConfigRead(BaseModel):
    config_id: uuid.UUID
    action_type: ActionType
    duration_minutes: int
    point_cost: int
    reward_runs: int
    penalty_runs: int
    first_use_free: bool
    max_uses_per_team: Optional[int]

    class Config:
        from_attributes = True


class ActionConfigUpdate(BaseModel):
    duration_minutes: Optional[int] = None
    point_cost: Optional[int] = None
    reward_runs: Optional[int] = None
    penalty_runs: Optional[int] = None
    first_use_free: Optional[bool] = None
    max_uses_per_team: Optional[int] = None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: create a new event and seed default action configs."""
    effective_org_id = enforce_org_on_create(current_user, payload.org_id)

    event = Event(org_id=effective_org_id, name=payload.name)
    session.add(event)
    session.flush()  # get event_id before committing

    # Seed default ActionConfig for all 4 action types
    defaults = {
        ActionType.DRS: {"duration_minutes": 10, "point_cost": 10, "reward_runs": 10, "penalty_runs": -5, "first_use_free": False},
        ActionType.STRATEGIC_TIMEOUT: {"duration_minutes": 5, "point_cost": 10, "reward_runs": 0, "penalty_runs": 0, "first_use_free": True},
        ActionType.RETENTION: {"duration_minutes": 10, "point_cost": 10, "reward_runs": 0, "penalty_runs": 0, "first_use_free": False, "max_uses_per_team": 2},
        ActionType.QUICK_SINGLE: {"duration_minutes": 5, "point_cost": 0, "reward_runs": 10, "penalty_runs": -10, "first_use_free": True},
    }
    for action_type, cfg in defaults.items():
        config = ActionConfig(event_id=event.event_id, action_type=action_type, **cfg)
        session.add(config)

    session.commit()
    session.refresh(event)
    return event


@router.get("/", response_model=List[EventRead])
def list_events(
    org_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    query = select(Event)

    if is_super_admin(current_user):
        if org_id:
            query = query.where(Event.org_id == org_id)
        return session.exec(query).all()

    user_org_id = get_user_org_id(current_user)
    if not user_org_id:
        raise HTTPException(status_code=403, detail="Access denied. User has no organization scope.")

    if org_id and org_id != user_org_id:
        raise HTTPException(status_code=403, detail="Access denied. Cannot list events outside your organization.")

    query = query.where(Event.org_id == user_org_id)
    return session.exec(query).all()


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: dict = Depends(get_current_user)):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")
    return event


@router.patch("/{event_id}/phase", response_model=EventRead)
def update_phase(
    event_id: uuid.UUID,
    payload: PhaseUpdate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Admin: update the current match phase and optionally set a timer.
    Automatically syncs the new state to Firebase Realtime DB so all
    connected clients receive the update instantly via WebSocket.
    """
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")

    event.current_phase = payload.phase
    event.phase_name = payload.phase_name
    if payload.duration_minutes and payload.duration_minutes > 0:
        event.phase_end_time = datetime.now(timezone.utc) + timedelta(minutes=payload.duration_minutes)
    else:
        event.phase_end_time = None

    session.add(event)
    session.commit()
    session.refresh(event)

    # Push to Firebase so all clients get live update
    push_event_state(event)

    return event


# ── Action Config Routes (Admin configures 4 params per action type) ────────────

@router.get("/{event_id}/action-configs", response_model=List[ActionConfigRead])
def get_action_configs(
    event_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")

    configs = session.exec(select(ActionConfig).where(ActionConfig.event_id == event_id)).all()
    return configs


@router.patch("/{event_id}/action-configs/{action_type}", response_model=ActionConfigRead)
def update_action_config(
    event_id: uuid.UUID,
    action_type: ActionType,
    payload: ActionConfigUpdate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: update any of the 4 configurable parameters for a specific action type."""
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")

    config = session.exec(
        select(ActionConfig).where(
            ActionConfig.event_id == event_id,
            ActionConfig.action_type == action_type,
        )
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="ActionConfig not found for this event.")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    session.add(config)
    session.commit()
    session.refresh(config)
    return config
