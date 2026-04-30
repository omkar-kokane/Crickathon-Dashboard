import uuid
from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class ActionType(str, Enum):
    DRS = "DRS"
    STRATEGIC_TIMEOUT = "STRATEGIC_TIMEOUT"
    RETENTION = "RETENTION"
    QUICK_SINGLE = "QUICK_SINGLE"


class ActionStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    TIMER_EXPIRED = "TIMER_EXPIRED"          # Quick Single timer ended, awaiting umpire verdict
    FORWARDED_TO_ADMIN = "FORWARDED_TO_ADMIN" # Umpire forwarded to admin for decision


class ActionRequest(SQLModel, table=True):
    __tablename__ = "action_requests"

    request_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    team_id: uuid.UUID = Field(foreign_key="teams.team_id", nullable=False, index=True)
    event_id: uuid.UUID = Field(foreign_key="events.event_id", nullable=False, index=True)
    type: ActionType = Field(nullable=False)
    status: ActionStatus = Field(default=ActionStatus.PENDING, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = Field(default=None)
    resolved_by_umpire_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.user_id")
    notes: Optional[str] = Field(default=None)

    # Compulsory message from participant (e.g. "Need help with API" or tech name for Retention)
    message: str = Field(nullable=False, default="")

    # Snapshot of config values at time of request (pulled from ActionConfig)
    duration_minutes: Optional[int] = Field(default=None)
    point_cost: Optional[int] = Field(default=None)
    reward_runs: Optional[int] = Field(default=None)
    penalty_runs: Optional[int] = Field(default=None)

    # Team-specific action timer (set when umpire approves)
    action_timer_end: Optional[datetime] = Field(default=None)

    # Admin forwarding (for Retention and Quick Single failures)
    forwarded_to_admin: bool = Field(default=False)
    umpire_deduction_amount: Optional[int] = Field(default=None)  # Retention: wallet pts umpire wants to deduct
    admin_status: Optional[str] = Field(default=None)  # APPROVED / REJECTED
    admin_notes: Optional[str] = Field(default=None)    # Admin's message back to participant
    admin_resolved_at: Optional[datetime] = Field(default=None)
    admin_resolved_by_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.user_id")
