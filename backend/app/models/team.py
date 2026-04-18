import uuid
from typing import Optional
from sqlmodel import SQLModel, Field


class Team(SQLModel, table=True):
    __tablename__ = "teams"

    team_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_id: uuid.UUID = Field(foreign_key="events.event_id", nullable=False, index=True)
    name: str = Field(nullable=False)
    umpire_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.user_id")
    invite_code: str = Field(unique=True, index=True, nullable=False)
    wallet_balance: int = Field(default=100)
    total_runs: int = Field(default=0)
