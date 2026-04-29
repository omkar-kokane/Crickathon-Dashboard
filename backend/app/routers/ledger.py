import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from datetime import datetime, timezone

from app.db.base import get_session
from app.core.auth import require_role, get_current_user, enforce_org_scope
from app.models.user import UserRole, User
from app.models.team import Team
from app.models.ledger import LedgerTransaction, TransactionType
from app.models.event import Event

router = APIRouter(prefix="/ledger", tags=["ledger"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class RunUpdatePayload(BaseModel):
    team_id: uuid.UUID
    amount: int   # Can be positive (+45) or negative (-5)
    reason: str


class LedgerEntryRead(BaseModel):
    transaction_id: uuid.UUID
    team_id: uuid.UUID
    type: TransactionType
    amount: int
    reason: str
    timestamp: datetime
    processed_by_user_id: uuid.UUID
    request_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


class LedgerHistoryEntry(BaseModel):
    """Extended ledger entry with the processor's email for display."""
    transaction_id: uuid.UUID
    team_id: uuid.UUID
    type: TransactionType
    amount: int
    reason: str
    timestamp: datetime
    processed_by_user_id: uuid.UUID
    processed_by_email: Optional[str] = None
    request_id: Optional[uuid.UUID] = None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/runs", response_model=LedgerEntryRead, status_code=status.HTTP_201_CREATED)
def add_run_entry(
    payload: RunUpdatePayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.UMPIRE, UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Umpire/Admin: Manually allocate or deduct Runs from a team.
    Creates an immutable ledger entry and updates Team.total_runs atomically.
    """
    team = session.exec(
        select(Team).where(Team.team_id == payload.team_id).with_for_update()
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    event = session.get(Event, team.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found for team.")
    enforce_org_scope(current_user, event.org_id, resource_name="Team")

    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Authenticated user not found.")

    # Atomic update
    team.total_runs += payload.amount
    entry = LedgerTransaction(
        team_id=payload.team_id,
        type=TransactionType.RUN_ALLOCATION if payload.amount >= 0 else TransactionType.PENALTY,
        amount=payload.amount,
        reason=payload.reason,
        processed_by_user_id=user.user_id,
    )
    session.add(team)
    session.add(entry)
    session.commit()
    session.refresh(entry)

    from app.services.firebase_sync import push_team_update
    push_team_update(team, last_reason=payload.reason, last_amount=payload.amount)

    return entry


@router.get("/team/{team_id}", response_model=List[LedgerEntryRead])
def get_team_ledger(
    team_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    """Get the full immutable ledger history for a specific team."""
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    event = session.get(Event, team.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found for team.")
    enforce_org_scope(current_user, event.org_id, resource_name="Team")

    entries = session.exec(
        select(LedgerTransaction)
        .where(LedgerTransaction.team_id == team_id)
        .order_by(LedgerTransaction.timestamp.desc())
    ).all()
    return entries


@router.get("/team/{team_id}/history", response_model=List[LedgerHistoryEntry])
def get_team_history(
    team_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed ledger history for a team including who processed each entry.
    Used by admin to see full audit trail.
    """
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    event = session.get(Event, team.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found for team.")
    enforce_org_scope(current_user, event.org_id, resource_name="Team")

    entries = session.exec(
        select(LedgerTransaction)
        .where(LedgerTransaction.team_id == team_id)
        .order_by(LedgerTransaction.timestamp.desc())
    ).all()

    # Enrich with processor emails
    result = []
    for entry in entries:
        processor = session.get(User, entry.processed_by_user_id)
        result.append(LedgerHistoryEntry(
            transaction_id=entry.transaction_id,
            team_id=entry.team_id,
            type=entry.type,
            amount=entry.amount,
            reason=entry.reason,
            timestamp=entry.timestamp,
            processed_by_user_id=entry.processed_by_user_id,
            processed_by_email=processor.email if processor else None,
            request_id=entry.request_id,
        ))
    return result
