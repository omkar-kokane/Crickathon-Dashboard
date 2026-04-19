import uuid
from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class EventPhase(str, Enum):
    PRE_MATCH = "PRE_MATCH"
    POWERPLAY_1 = "POWERPLAY_1"
    POWERPLAY_2 = "POWERPLAY_2"
    POWERPLAY_3 = "POWERPLAY_3"
    POWERPLAY_4 = "POWERPLAY_4"
    SUPER_OVER = "SUPER_OVER"
    ENDED = "ENDED"


class Event(SQLModel, table=True):
    __tablename__ = "events"

    event_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    org_id: Optional[uuid.UUID] = Field(default=None, foreign_key="organizations.org_id", nullable=True)
    name: str = Field(nullable=False)
    current_phase: EventPhase = Field(default=EventPhase.PRE_MATCH, nullable=False)
    phase_name: Optional[str] = Field(default=None)
    phase_end_time: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
