import uuid
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.db.base import get_session
from app.core.auth import require_role, get_current_user, enforce_org_scope
from app.models.user import UserRole, User
from app.models.team import Team
from app.models.action_request import ActionRequest, ActionType, ActionStatus
from app.models.action_config import ActionConfig
from app.models.ledger import LedgerTransaction, TransactionType
from app.models.event import Event
from app.services.firebase_sync import push_action_request_update

router = APIRouter(prefix="/requests", tags=["action-requests"])
logger = logging.getLogger(__name__)


# ── Schemas ────────────────────────────────────────────────────────────────────

class ActionRequestCreate(BaseModel):
    team_id: uuid.UUID
    event_id: uuid.UUID
    type: ActionType
    message: Optional[str] = None  # Optional note from participant to umpire


class ResolvePayload(BaseModel):
    outcome: ActionStatus  # APPROVED, REJECTED, COMPLETED, or FAILED
    notes: Optional[str] = None
    apply_reward: Optional[bool] = None   # For DRS/Quick Single: did they succeed?


class ActionRequestRead(BaseModel):
    request_id: uuid.UUID
    team_id: uuid.UUID
    event_id: uuid.UUID
    type: ActionType
    status: ActionStatus
    created_at: datetime
    resolved_at: Optional[datetime]
    duration_minutes: Optional[int]
    point_cost: Optional[int]
    reward_runs: Optional[int]
    penalty_runs: Optional[int]
    notes: Optional[str]
    message: Optional[str] = None

    class Config:
        from_attributes = True


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/", response_model=ActionRequestRead, status_code=status.HTTP_201_CREATED)
def create_action_request(
    payload: ActionRequestCreate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.PARTICIPANT, UserRole.UMPIRE, UserRole.ADMIN)),
):
    """
    Participant: raise an action request (DRS, Timeout, Retention, Quick Single).
    The system pulls current config values from ActionConfig and snapshots them.
    """
    event = session.get(Event, payload.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")

    config = session.exec(
        select(ActionConfig).where(
            ActionConfig.event_id == payload.event_id,
            ActionConfig.action_type == payload.type,
        )
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Action configuration not found for this event.")

    # Check wallet balance before creating request (if there's a cost)
    team = session.get(Team, payload.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    if team.event_id != payload.event_id:
        raise HTTPException(status_code=400, detail="Team does not belong to this event.")

    # Enforce max_uses_per_team (DRS=2, Retention=2 per rulebook)
    if config.max_uses_per_team is not None:
        existing_uses = session.exec(
            select(ActionRequest).where(
                ActionRequest.team_id == payload.team_id,
                ActionRequest.type == payload.type,
                ActionRequest.status.in_([ActionStatus.PENDING, ActionStatus.APPROVED, ActionStatus.COMPLETED, ActionStatus.IN_PROGRESS]),
            )
        ).all()
        if len(existing_uses) >= config.max_uses_per_team:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Maximum {config.max_uses_per_team} {payload.type.value.replace('_', ' ')} uses reached for this team.",
            )

    # For Strategic Timeout: check if first_use_free applies
    point_cost = config.point_cost
    if config.first_use_free and payload.type == ActionType.STRATEGIC_TIMEOUT:
        existing_count = session.exec(
            select(ActionRequest).where(
                ActionRequest.team_id == payload.team_id,
                ActionRequest.type == ActionType.STRATEGIC_TIMEOUT,
                ActionRequest.status.in_([ActionStatus.PENDING, ActionStatus.APPROVED, ActionStatus.COMPLETED, ActionStatus.IN_PROGRESS]),
            )
        ).all()
        if len(existing_count) == 0:
            point_cost = 0  # First timeout is free

    if point_cost > 0 and team.wallet_balance < point_cost:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient wallet balance. Cost: {point_cost}, Available: {team.wallet_balance}",
        )

    request = ActionRequest(
        team_id=payload.team_id,
        event_id=payload.event_id,
        type=payload.type,
        message=payload.message,
        duration_minutes=config.duration_minutes,
        point_cost=point_cost,
        reward_runs=config.reward_runs,
        penalty_runs=config.penalty_runs,
    )
    session.add(request)
    session.commit()
    session.refresh(request)

    # Notify umpire in real-time via Firebase
    try:
        push_action_request_update(request)
    except Exception as exc:
        logger.exception("Failed to push action request update to Firebase for request %s: %s", request.request_id, exc)
    return request


@router.get("/team/{team_id}", response_model=List[ActionRequestRead])
def get_team_requests(
    team_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    event = session.get(Event, team.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found for team.")
    enforce_org_scope(current_user, event.org_id, resource_name="Team")

    requests = session.exec(
        select(ActionRequest)
        .where(ActionRequest.team_id == team_id)
        .order_by(ActionRequest.created_at.desc())
    ).all()
    return requests


@router.get("/pending/{event_id}", response_model=List[ActionRequestRead])
def get_pending_requests(
    event_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.UMPIRE, UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Umpire: get all PENDING requests for an event (filtered to their teams for UMPIRE role)."""
    query = select(ActionRequest).where(
        ActionRequest.event_id == event_id,
        ActionRequest.status == ActionStatus.PENDING,
    )
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")

    return session.exec(query).all()


@router.patch("/{request_id}/resolve", response_model=ActionRequestRead)
def resolve_action_request(
    request_id: uuid.UUID,
    payload: ResolvePayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.UMPIRE, UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Umpire: approve or reject an action request.
    On APPROVED: deducts wallet points and applies run changes atomically via the ledger.
    On REJECTED: no financial changes.
    """
    # Lock request row so concurrent resolves cannot both process the same request.
    request = session.exec(
        select(ActionRequest)
        .where(ActionRequest.request_id == request_id)
        .with_for_update()
    ).first()
    if not request:
        raise HTTPException(status_code=404, detail="Action request not found.")
    if request.status != ActionStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Cannot resolve a request with status: {request.status.value}")

    event = session.get(Event, request.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found for action request.")
    enforce_org_scope(current_user, event.org_id, resource_name="Action request")

    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Authenticated user not found.")

    # Lock team row before mutating wallet/runs.
    team = session.exec(
        select(Team)
        .where(Team.team_id == request.team_id)
        .with_for_update()
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    if team.event_id != request.event_id:
        raise HTTPException(status_code=400, detail="Action request references a mismatched team/event.")

    new_status = payload.outcome
    request.status = new_status
    request.resolved_at = datetime.now(timezone.utc)
    request.resolved_by_umpire_id = user.user_id
    request.notes = payload.notes

    if new_status in (ActionStatus.APPROVED, ActionStatus.COMPLETED, ActionStatus.FAILED):
        # Deduct wallet if cost > 0
        if request.point_cost and request.point_cost > 0:
            if team.wallet_balance < request.point_cost:
                raise HTTPException(status_code=422, detail="Insufficient wallet balance for approval.")
            team.wallet_balance -= request.point_cost
            wallet_entry = LedgerTransaction(
                team_id=team.team_id,
                type=TransactionType.WALLET_DEDUCTION,
                amount=-request.point_cost,
                reason=f"{request.type.value} invoked",
                processed_by_umpire_id=user.user_id,
            )
            session.add(wallet_entry)

        # Apply run reward/penalty based on outcome
        if payload.apply_reward is True and request.reward_runs:
            team.total_runs += request.reward_runs
            run_entry = LedgerTransaction(
                team_id=team.team_id,
                type=TransactionType.RUN_ALLOCATION,
                amount=request.reward_runs,
                reason=f"{request.type.value} - reward",
                processed_by_umpire_id=user.user_id,
            )
            session.add(run_entry)
        elif payload.apply_reward is False and request.penalty_runs:
            team.total_runs += request.penalty_runs
            run_entry = LedgerTransaction(
                team_id=team.team_id,
                type=TransactionType.PENALTY,
                amount=request.penalty_runs,
                reason=f"{request.type.value} - penalty",
                processed_by_umpire_id=user.user_id,
            )
            session.add(run_entry)

    session.add(request)
    session.add(team)
    session.commit()
    session.refresh(request)

    # Push update to Firebase so participant sees resolution in real-time
    push_action_request_update(request)
    
    from app.services.firebase_sync import push_team_update
    push_team_update(team)
    
    return request
