import uuid
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field
from typing import Optional


class Organization(SQLModel, table=True):
    __tablename__ = "organizations"

    org_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
