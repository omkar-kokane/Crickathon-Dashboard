import uuid
from typing import Optional
from sqlmodel import SQLModel, Field
from app.models.action_request import ActionType


class ActionConfig(SQLModel, table=True):
    """
    Admin-configurable parameters for each action type per event.
    This table holds the 4 configurable settings per action as per the rulebook:
    1. time (duration_minutes)
    2. runs+ (reward_runs)
    3. runs- (penalty_runs)
    4. points cost (point_cost)
    """
    __tablename__ = "action_configs"

    config_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_id: uuid.UUID = Field(foreign_key="events.event_id", nullable=False, index=True)
    action_type: ActionType = Field(nullable=False)

    duration_minutes: int = Field(default=10)
    point_cost: int = Field(default=10)
    reward_runs: int = Field(default=10)
    penalty_runs: int = Field(default=-5)

    # For Strategic Timeout: first one is free
    first_use_free: bool = Field(default=False)
    max_uses_per_team: Optional[int] = Field(default=None)  # None = unlimited
