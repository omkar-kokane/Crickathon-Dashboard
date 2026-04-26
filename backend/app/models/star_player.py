import uuid
from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class AuctionStatus(str, Enum):
    UPCOMING = "UPCOMING"
    BIDDING = "BIDDING"
    SOLD = "SOLD"
    UNSOLD = "UNSOLD"


class StarPlayer(SQLModel, table=True):
    __tablename__ = "star_players"

    player_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_id: uuid.UUID = Field(foreign_key="events.event_id", nullable=False, index=True)
    name: str = Field(nullable=False)
    bio: Optional[str] = Field(default=None)
    specialization: Optional[str] = Field(default=None)
    photo_url: Optional[str] = Field(default=None)
    base_price: int = Field(default=25)
    sold_price: Optional[int] = Field(default=None)
    sold_to_team_id: Optional[uuid.UUID] = Field(default=None, foreign_key="teams.team_id")
    status: AuctionStatus = Field(default=AuctionStatus.UPCOMING, nullable=False)
    display_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
