import uuid
import logging
from typing import List, Optional
from datetime import datetime, timedelta, timezone
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
from app.services.firebase_sync import (
    push_action_request_update,
    push_team_update,
    push_team_timer,
    clear_team_timer,
    push_admin_request,
)

router = APIRouter(prefix="/requests", tags=["action-requests"])
logger = logging.getLogger(__name__)


# ── Schemas ────────────────────────────────────────────────────────────────────

class ActionRequestCreate(BaseModel):
    team_id: uuid.UUID
    event_id: uuid.UUID
    type: ActionType
    message: str  # Compulsory message from participant


class ResolvePayload(BaseModel):
    outcome: ActionStatus  # APPROVED, REJECTED
    notes: str = ""        # Compulsory message from umpire
    apply_reward: Optional[bool] = None


class TimerCompletePayload(BaseModel):
    """Umpire: after Quick Single timer expires, did team complete the task?"""
    task_completed: bool
    runs_awarded: Optional[int] = None  # If completed, how many runs to give (umpire decides freely)
    notes: str = ""


class ForwardToAdminPayload(BaseModel):
    """Umpire: forward Retention to admin with deduction amount."""
    deduction_amount: int  # Wallet points to deduct
    notes: str = ""        # Umpire's justification


class AdminResolvePayload(BaseModel):
    """Admin: approve or reject a forwarded request."""
    approved: bool
    notes: str = ""  # Admin's message (shown to participant)


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
    message: Optional[str]
    action_timer_end: Optional[datetime]
    forwarded_to_admin: bool = False
    umpire_deduction_amount: Optional[int]
    admin_status: Optional[str]
    admin_notes: Optional[str]
    admin_resolved_at: Optional[datetime]

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
    Message is compulsory.
    """
    if not payload.message or not payload.message.strip():
        raise HTTPException(status_code=422, detail="Message is required for all action requests.")

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

    team = session.get(Team, payload.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    if team.event_id != payload.event_id:
        raise HTTPException(status_code=400, detail="Team does not belong to this event.")

    # Enforce max_uses_per_team
    if config.max_uses_per_team is not None:
        existing_uses = session.exec(
            select(ActionRequest).where(
                ActionRequest.team_id == payload.team_id,
                ActionRequest.type == payload.type,
                ActionRequest.status.in_([
                    ActionStatus.PENDING, ActionStatus.APPROVED, ActionStatus.COMPLETED,
                    ActionStatus.IN_PROGRESS, ActionStatus.TIMER_EXPIRED, ActionStatus.FORWARDED_TO_ADMIN,
                ]),
            )
        ).all()
        if len(existing_uses) >= config.max_uses_per_team:
            raise HTTPException(
                status_code=422,
                detail=f"Maximum {config.max_uses_per_team} {payload.type.value.replace('_', ' ')} uses reached.",
            )

    # Calculate cost (first timeout free)
    point_cost = config.point_cost
    if config.first_use_free and payload.type == ActionType.STRATEGIC_TIMEOUT:
        existing_count = session.exec(
            select(ActionRequest).where(
                ActionRequest.team_id == payload.team_id,
                ActionRequest.type == ActionType.STRATEGIC_TIMEOUT,
                ActionRequest.status.in_([
                    ActionStatus.PENDING, ActionStatus.APPROVED, ActionStatus.COMPLETED,
                    ActionStatus.IN_PROGRESS,
                ]),
            )
        ).all()
        if len(existing_count) == 0:
            point_cost = 0

    if point_cost > 0 and team.wallet_balance < point_cost:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient wallet balance. Cost: {point_cost}, Available: {team.wallet_balance}",
        )

    request = ActionRequest(
        team_id=payload.team_id,
        event_id=payload.event_id,
        type=payload.type,
        message=payload.message.strip(),
        duration_minutes=config.duration_minutes,
        point_cost=point_cost,
        reward_runs=config.reward_runs,
        penalty_runs=config.penalty_runs,
    )
    session.add(request)
    session.commit()
    session.refresh(request)

    try:
        push_action_request_update(request)
    except Exception as exc:
        logger.exception("Failed to push action request: %s", exc)
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
    """Umpire: get all PENDING requests for an event."""
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")

    query = select(ActionRequest).where(
        ActionRequest.event_id == event_id,
        ActionRequest.status == ActionStatus.PENDING,
    )
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
    On APPROVED: deducts wallet, starts action timer, pushes timer to Firebase.
    """
    request = session.exec(
        select(ActionRequest).where(ActionRequest.request_id == request_id).with_for_update()
    ).first()
    if not request:
        raise HTTPException(status_code=404, detail="Action request not found.")
    if request.status != ActionStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Cannot resolve a request with status: {request.status.value}")

    event = session.get(Event, request.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Action request")

    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Authenticated user not found.")

    team = session.exec(
        select(Team).where(Team.team_id == request.team_id).with_for_update()
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    request.status = payload.outcome
    request.resolved_at = datetime.now(timezone.utc)
    request.resolved_by_umpire_id = user.user_id
    request.notes = payload.notes

    if payload.outcome == ActionStatus.APPROVED:
        # Deduct wallet if cost > 0
        if request.point_cost and request.point_cost > 0:
            if team.wallet_balance < request.point_cost:
                raise HTTPException(status_code=422, detail="Insufficient wallet balance for approval.")
            team.wallet_balance -= request.point_cost
            wallet_entry = LedgerTransaction(
                team_id=team.team_id,
                type=TransactionType.WALLET_DEDUCTION,
                amount=-request.point_cost,
                reason=f"{request.type.value} cost ({request.message})",
                processed_by_user_id=user.user_id,
                request_id=request.request_id,
            )
            session.add(wallet_entry)

        # Start action timer
        if request.duration_minutes and request.duration_minutes > 0:
            request.action_timer_end = datetime.now(timezone.utc) + timedelta(minutes=request.duration_minutes)

    elif payload.outcome == ActionStatus.REJECTED:
        pass  # No financial changes on rejection

    session.add(request)
    session.add(team)
    session.commit()
    session.refresh(request)

    # Push updates to Firebase
    push_action_request_update(request)
    push_team_update(team)

    # Push team timer if approved and has duration
    if payload.outcome == ActionStatus.APPROVED and request.action_timer_end:
        end_iso = request.action_timer_end.isoformat()
        if not end_iso.endswith("Z") and "+" not in end_iso and "-" not in end_iso[10:]:
            end_iso += "Z"
        action_label = request.type.value.replace("_", " ").title()
        push_team_timer(
            str(request.event_id), str(request.team_id),
            request.type.value, end_iso, label=f"{action_label}: {request.message}"
        )

    return request


@router.patch("/{request_id}/timer-complete", response_model=ActionRequestRead)
def timer_complete(
    request_id: uuid.UUID,
    payload: TimerCompletePayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.UMPIRE, UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Umpire: after Quick Single timer expires, confirm if team completed the task.
    YES → award runs (umpire chooses amount freely).
    NO  → auto-forward to admin for wallet penalty.
    """
    request = session.exec(
        select(ActionRequest).where(ActionRequest.request_id == request_id).with_for_update()
    ).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
    if request.type != ActionType.QUICK_SINGLE:
        raise HTTPException(status_code=400, detail="Timer completion only applies to Quick Single.")
    if request.status not in (ActionStatus.APPROVED, ActionStatus.TIMER_EXPIRED):
        raise HTTPException(status_code=400, detail=f"Cannot complete timer for status: {request.status.value}")

    event = session.get(Event, request.event_id)
    if event:
        enforce_org_scope(current_user, event.org_id, resource_name="Action request")

    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    team = session.exec(
        select(Team).where(Team.team_id == request.team_id).with_for_update()
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    request.notes = payload.notes

    if payload.task_completed:
        # Umpire awards runs (freely chosen amount)
        runs = payload.runs_awarded or 0
        if runs > 0:
            team.total_runs += runs
            run_entry = LedgerTransaction(
                team_id=team.team_id,
                type=TransactionType.RUN_ALLOCATION,
                amount=runs,
                reason=f"Quick Single success: {request.message} ({payload.notes})",
                processed_by_user_id=user.user_id,
                request_id=request.request_id,
            )
            session.add(run_entry)
        request.status = ActionStatus.COMPLETED
    else:
        # Forward penalty to admin (-10 wallet points)
        request.status = ActionStatus.FORWARDED_TO_ADMIN
        request.forwarded_to_admin = True
        request.umpire_deduction_amount = 10  # Quick Single penalty = 10 wallet pts

    session.add(request)
    session.add(team)
    session.commit()
    session.refresh(request)

    push_action_request_update(request)
    push_team_update(team, last_reason=f"Quick Single: {request.message}", last_amount=payload.runs_awarded if payload.task_completed else None)
    clear_team_timer(str(request.event_id), str(request.team_id), request.type.value)

    if request.forwarded_to_admin:
        push_admin_request(request)

    return request


@router.patch("/{request_id}/forward-to-admin", response_model=ActionRequestRead)
def forward_to_admin(
    request_id: uuid.UUID,
    payload: ForwardToAdminPayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.UMPIRE, UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Umpire: forward a Retention request to admin with the wallet deduction amount.
    """
    request = session.exec(
        select(ActionRequest).where(ActionRequest.request_id == request_id).with_for_update()
    ).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
    if request.type != ActionType.RETENTION:
        raise HTTPException(status_code=400, detail="Only Retention requests can be forwarded to admin.")
    if request.status not in (ActionStatus.PENDING, ActionStatus.APPROVED):
        raise HTTPException(status_code=400, detail=f"Cannot forward request with status: {request.status.value}")

    event = session.get(Event, request.event_id)
    if event:
        enforce_org_scope(current_user, event.org_id, resource_name="Action request")

    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if payload.deduction_amount <= 0:
        raise HTTPException(status_code=422, detail="Deduction amount must be positive.")

    request.status = ActionStatus.FORWARDED_TO_ADMIN
    request.forwarded_to_admin = True
    request.umpire_deduction_amount = payload.deduction_amount
    request.notes = payload.notes
    request.resolved_at = datetime.now(timezone.utc)
    request.resolved_by_umpire_id = user.user_id

    session.add(request)
    session.commit()
    session.refresh(request)

    push_action_request_update(request)
    push_admin_request(request)

    return request


@router.get("/admin/pending", response_model=List[ActionRequestRead])
def get_admin_pending_requests(
    event_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: get all requests forwarded to admin."""
    query = select(ActionRequest).where(
        ActionRequest.forwarded_to_admin == True,
        ActionRequest.admin_status == None,
    )
    if event_id:
        event = session.get(Event, event_id)
        if event:
            enforce_org_scope(current_user, event.org_id, resource_name="Event")
        query = query.where(ActionRequest.event_id == event_id)

    return session.exec(query.order_by(ActionRequest.created_at.desc())).all()


@router.patch("/{request_id}/admin-resolve", response_model=ActionRequestRead)
def admin_resolve_request(
    request_id: uuid.UUID,
    payload: AdminResolvePayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Admin: approve or reject a forwarded request.
    APPROVED → deduct wallet points, notify participant.
    REJECTED → no deduction, notify participant.
    """
    request = session.exec(
        select(ActionRequest).where(ActionRequest.request_id == request_id).with_for_update()
    ).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
    if not request.forwarded_to_admin:
        raise HTTPException(status_code=400, detail="This request has not been forwarded to admin.")
    if request.admin_status is not None:
        raise HTTPException(status_code=400, detail="This request has already been resolved by admin.")

    event = session.get(Event, request.event_id)
    if event:
        enforce_org_scope(current_user, event.org_id, resource_name="Action request")

    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    team = session.exec(
        select(Team).where(Team.team_id == request.team_id).with_for_update()
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    request.admin_resolved_at = datetime.now(timezone.utc)
    request.admin_resolved_by_id = user.user_id
    request.admin_notes = payload.notes

    deduction = request.umpire_deduction_amount or 0

    if payload.approved:
        request.admin_status = "APPROVED"
        request.status = ActionStatus.COMPLETED

        # Deduct wallet points
        if deduction > 0:
            team.wallet_balance -= deduction
            entry = LedgerTransaction(
                team_id=team.team_id,
                type=TransactionType.WALLET_DEDUCTION,
                amount=-deduction,
                reason=f"Admin approved: {request.type.value} - {request.message} ({payload.notes})",
                processed_by_user_id=user.user_id,
                request_id=request.request_id,
            )
            session.add(entry)
    else:
        request.admin_status = "REJECTED"
        request.status = ActionStatus.FAILED

    session.add(request)
    session.add(team)
    session.commit()
    session.refresh(request)

    push_action_request_update(request)
    push_team_update(
        team,
        last_reason=f"Admin {'approved' if payload.approved else 'rejected'}: {request.type.value} ({payload.notes})",
        last_amount=-deduction if payload.approved else 0,
    )

    # Update the admin_requests node in Firebase too
    push_admin_request(request)

    return request
