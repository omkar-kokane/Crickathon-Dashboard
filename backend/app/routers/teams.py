import uuid
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.db.base import get_session
from app.core.auth import require_role, get_current_user
from app.models.user import UserRole, User
from app.models.team import Team
from app.models.team_member import TeamMember
from app.models.ledger import LedgerTransaction, TransactionType

router = APIRouter(prefix="/teams", tags=["teams"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    event_id: uuid.UUID
    name: str
    umpire_id: Optional[uuid.UUID] = None


class TeamRead(BaseModel):
    team_id: uuid.UUID
    event_id: uuid.UUID
    name: str
    umpire_id: Optional[uuid.UUID]
    invite_code: str
    wallet_balance: int
    total_runs: int

    class Config:
        from_attributes = True


class JoinTeamPayload(BaseModel):
    invite_code: str


class WalletAdjustPayload(BaseModel):
    amount: int
    reason: str = "Manual wallet adjustment by Admin"


class AssignUmpirePayload(BaseModel):
    umpire_id: uuid.UUID


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: create a team. Generates a unique 6-char invite code automatically."""
    invite_code = secrets.token_hex(3).upper()  # 6-char hex e.g. "A3F1C8"
    # Ensure uniqueness
    while session.exec(select(Team).where(Team.invite_code == invite_code)).first():
        invite_code = secrets.token_hex(3).upper()

    team = Team(
        event_id=payload.event_id,
        name=payload.name,
        umpire_id=payload.umpire_id,
        invite_code=invite_code,
    )
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


@router.get("/", response_model=List[TeamRead])
def list_teams(
    event_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    _: dict = Depends(get_current_user),
):
    query = select(Team)
    if event_id:
        query = query.where(Team.event_id == event_id)
    return session.exec(query).all()


@router.get("/{team_id}", response_model=TeamRead)
def get_team(team_id: uuid.UUID, session: Session = Depends(get_session), _: dict = Depends(get_current_user)):
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    return team


@router.post("/join", response_model=TeamRead)
def join_team(
    payload: JoinTeamPayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    """
    Participant self-service onboarding via invite code.
    Assigns the authenticated Firebase user to the correct team.
    """
    team = session.exec(select(Team).where(Team.invite_code == payload.invite_code.upper())).first()
    if not team:
        raise HTTPException(status_code=404, detail="Invalid invite code. Please check with your Admin.")

    # Get or create the User record
    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        user = User(
            firebase_uid=current_user["uid"],
            email=current_user.get("email", ""),
            role=UserRole.PARTICIPANT
        )
        session.add(user)
        session.flush()

    # Check if already a member
    existing = session.exec(
        select(TeamMember).where(TeamMember.user_id == user.user_id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You are already a member of a team.")

    member = TeamMember(team_id=team.team_id, user_id=user.user_id)
    session.add(member)

    # Update user role to PARTICIPANT if not already assigned
    if user.role not in (UserRole.UMPIRE, UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user.role = UserRole.PARTICIPANT
        session.add(user)

    session.commit()
    session.refresh(team)
    return team


@router.patch("/{team_id}/wallet", response_model=TeamRead)
def adjust_wallet(
    team_id: uuid.UUID,
    payload: WalletAdjustPayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.UMPIRE)),
):
    """
    Admin: manually set/adjust wallet balance.
    Umpire: deduct wallet as part of action approval.
    All changes are recorded in the immutable ledger.
    """
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    new_balance = team.wallet_balance + payload.amount
    if new_balance < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient wallet balance. Current: {team.wallet_balance}, Requested deduction: {abs(payload.amount)}",
        )

    team.wallet_balance = new_balance

    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Authenticated user not found in DB.")

    tx_type = TransactionType.WALLET_DEDUCTION if payload.amount < 0 else TransactionType.WALLET_CREDIT
    ledger_entry = LedgerTransaction(
        team_id=team_id,
        type=tx_type,
        amount=payload.amount,
        reason=payload.reason,
        processed_by_umpire_id=user.user_id,
    )
    session.add(team)
    session.add(ledger_entry)
    session.commit()
    session.refresh(team)
    return team


@router.patch("/{team_id}/assign-umpire", response_model=TeamRead)
def assign_umpire(
    team_id: uuid.UUID,
    payload: AssignUmpirePayload,
    session: Session = Depends(get_session),
    _: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: assign an Umpire to a team."""
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    team.umpire_id = payload.umpire_id
    session.add(team)
    session.commit()
    session.refresh(team)
    return team
