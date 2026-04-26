import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.db.base import get_session
from app.core.auth import require_role, enforce_org_scope
from app.models.user import UserRole, User
from app.models.team import Team
from app.models.event import Event
from app.models.ledger import LedgerTransaction, TransactionType
from app.models.star_player import StarPlayer, AuctionStatus

router = APIRouter(prefix="/auction", tags=["auction"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class StarPlayerCreate(BaseModel):
    event_id: uuid.UUID
    name: str
    bio: Optional[str] = None
    specialization: Optional[str] = None
    photo_url: Optional[str] = None
    base_price: int = 25
    display_order: int = 0


class StarPlayerRead(BaseModel):
    player_id: uuid.UUID
    event_id: uuid.UUID
    name: str
    bio: Optional[str]
    specialization: Optional[str]
    photo_url: Optional[str]
    base_price: int
    sold_price: Optional[int]
    sold_to_team_id: Optional[uuid.UUID]
    status: str
    display_order: int
    created_at: str

    class Config:
        from_attributes = True


class SellPayload(BaseModel):
    team_id: uuid.UUID
    amount: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_player_or_404(player_id: uuid.UUID, session: Session) -> StarPlayer:
    player = session.get(StarPlayer, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Star player not found.")
    return player


def _enforce_event_scope(player: StarPlayer, session: Session, current_user: dict) -> Event:
    event = session.get(Event, player.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found for star player.")
    enforce_org_scope(current_user, event.org_id, resource_name="Auction")
    return event


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/players", response_model=StarPlayerRead, status_code=status.HTTP_201_CREATED)
def add_star_player(
    payload: StarPlayerCreate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: add a star player to the auction pool for an event."""
    event = session.get(Event, payload.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    enforce_org_scope(current_user, event.org_id, resource_name="Event")

    player = StarPlayer(
        event_id=payload.event_id,
        name=payload.name,
        bio=payload.bio,
        specialization=payload.specialization,
        photo_url=payload.photo_url,
        base_price=payload.base_price,
        display_order=payload.display_order,
    )
    session.add(player)
    session.commit()
    session.refresh(player)

    from app.services.firebase_sync import push_auction_player_update
    push_auction_player_update(player)

    return player


@router.get("/players", response_model=List[StarPlayerRead])
def list_star_players(
    event_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Public: list all star players for an event (used by spectator view)."""
    players = session.exec(
        select(StarPlayer)
        .where(StarPlayer.event_id == event_id)
        .order_by(StarPlayer.display_order, StarPlayer.created_at)
    ).all()
    return players


@router.get("/players/{player_id}", response_model=StarPlayerRead)
def get_star_player(
    player_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Public: get a single star player's details."""
    return _get_player_or_404(player_id, session)


@router.patch("/players/{player_id}/start-bidding", response_model=StarPlayerRead)
def start_bidding(
    player_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: put a player on the auction block (status -> BIDDING)."""
    player = _get_player_or_404(player_id, session)
    _enforce_event_scope(player, session, current_user)

    if player.status not in (AuctionStatus.UPCOMING, AuctionStatus.UNSOLD):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot start bidding on a player with status '{player.status.value}'. Must be UPCOMING or UNSOLD.",
        )

    # Enforce: only one player can be BIDDING at a time per event
    existing_bidding = session.exec(
        select(StarPlayer).where(
            StarPlayer.event_id == player.event_id,
            StarPlayer.status == AuctionStatus.BIDDING,
        )
    ).first()
    if existing_bidding:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Another player ('{existing_bidding.name}') is already being auctioned. Finish that bidding first.",
        )

    player.status = AuctionStatus.BIDDING
    session.add(player)
    session.commit()
    session.refresh(player)

    from app.services.firebase_sync import push_auction_player_update, push_auction_current
    push_auction_player_update(player)
    push_auction_current(player)

    return player


@router.post("/players/{player_id}/sell", response_model=StarPlayerRead)
def sell_player(
    player_id: uuid.UUID,
    payload: SellPayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Admin: record the final winning bid. Deducts wallet, assigns player to team.
    - amount must be >= base_price
    - amount must be in increments of 5
    - team must have sufficient wallet balance
    """
    # Lock the player row to prevent double-sell race conditions
    player = session.exec(
        select(StarPlayer).where(StarPlayer.player_id == player_id).with_for_update()
    ).first()
    if not player:
        raise HTTPException(status_code=404, detail="Star player not found.")
    _enforce_event_scope(player, session, current_user)

    if player.status != AuctionStatus.BIDDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Player is not currently being auctioned. Status: '{player.status.value}'",
        )

    if payload.amount < player.base_price:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bid amount ({payload.amount}) must be >= base price ({player.base_price}).",
        )

    if payload.amount % 5 != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bid amount must be in increments of 5. Got: {payload.amount}",
        )

    team = session.exec(
        select(Team).where(Team.team_id == payload.team_id).with_for_update()
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    # Verify team belongs to the same event as the player
    if team.event_id != player.event_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Team '{team.name}' belongs to a different event than this player.",
        )

    if team.wallet_balance < payload.amount:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient wallet balance. Team '{team.name}' has {team.wallet_balance} points, bid is {payload.amount}.",
        )

    admin_user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not admin_user:
        raise HTTPException(status_code=404, detail="Authenticated user not found in DB.")

    # 1. Deduct wallet
    team.wallet_balance -= payload.amount
    session.add(team)

    # 2. Record in ledger
    ledger_entry = LedgerTransaction(
        team_id=team.team_id,
        type=TransactionType.WALLET_DEDUCTION,
        amount=-payload.amount,
        reason=f"Auction: bought {player.name} for {payload.amount} pts",
        processed_by_umpire_id=admin_user.user_id,
    )
    session.add(ledger_entry)

    # 3. Update player record
    player.sold_price = payload.amount
    player.sold_to_team_id = team.team_id
    player.status = AuctionStatus.SOLD
    session.add(player)

    # 4. Auction result is recorded on the StarPlayer record itself.
    # Do not create a TeamMember row: StarPlayer is not linked to a User,
    # and using admin_user.user_id would incorrectly add the admin as a team member.

    session.commit()
    session.refresh(player)
    session.refresh(team)

    from app.services.firebase_sync import push_team_update, push_auction_player_update, push_auction_current
    push_team_update(team)
    push_auction_player_update(player)
    # Clear /current so spectators don't see stale SOLD state
    push_auction_current(None, event_id=str(player.event_id))

    return player


@router.post("/players/{player_id}/unsold", response_model=StarPlayerRead)
def mark_unsold(
    player_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: mark a player as unsold (no team bid on them)."""
    player = _get_player_or_404(player_id, session)
    _enforce_event_scope(player, session, current_user)

    if player.status != AuctionStatus.BIDDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Can only mark a BIDDING player as unsold. Current status: '{player.status.value}'",
        )

    player.status = AuctionStatus.UNSOLD
    session.add(player)
    session.commit()
    session.refresh(player)

    from app.services.firebase_sync import push_auction_player_update, push_auction_current
    push_auction_player_update(player)
    push_auction_current(None, event_id=str(player.event_id))

    return player


@router.delete("/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_star_player(
    player_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin: remove a star player from the auction pool. Only UPCOMING/UNSOLD players can be deleted."""
    player = _get_player_or_404(player_id, session)
    _enforce_event_scope(player, session, current_user)

    if player.status not in (AuctionStatus.UPCOMING, AuctionStatus.UNSOLD):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot delete a player with status '{player.status.value}'. Only UPCOMING or UNSOLD players can be removed.",
        )

    # Capture IDs before deleting for Firebase cleanup
    event_id = str(player.event_id)
    deleted_player_id = str(player.player_id)

    session.delete(player)
    session.commit()

    # Clean up Firebase RTDB to prevent ghost players in spectator/admin views
    from app.services.firebase_sync import _get_ref
    eid = event_id.lower()
    pid = deleted_player_id.lower()
    _get_ref(f"/auction/{eid}/players/{pid}").delete()

    return None
