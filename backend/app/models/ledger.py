import uuid
from enum import Enum
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class TransactionType(str, Enum):
    WALLET_DEDUCTION = "WALLET_DEDUCTION"
    WALLET_CREDIT = "WALLET_CREDIT"
    RUN_ALLOCATION = "RUN_ALLOCATION"
    PENALTY = "PENALTY"


class LedgerTransaction(SQLModel, table=True):
    __tablename__ = "ledger_transactions"

    transaction_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    team_id: uuid.UUID = Field(foreign_key="teams.team_id", nullable=False, index=True)
    type: TransactionType = Field(nullable=False)
    amount: int = Field(nullable=False)  # Positive = credit, Negative = debit
    reason: str = Field(nullable=False)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    processed_by_umpire_id: uuid.UUID = Field(foreign_key="users.user_id", nullable=False)
