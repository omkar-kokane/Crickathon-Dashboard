import uuid
from enum import Enum
from typing import Optional
from sqlmodel import SQLModel, Field


class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    UMPIRE = "UMPIRE"
    PARTICIPANT = "PARTICIPANT"


class User(SQLModel, table=True):
    __tablename__ = "users"

    user_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    firebase_uid: str = Field(unique=True, index=True, nullable=False)
    email: str = Field(unique=True, index=True, nullable=False)
    display_name: Optional[str] = Field(default=None)
    role: UserRole = Field(nullable=False)
    org_id: Optional[uuid.UUID] = Field(default=None, foreign_key="organizations.org_id")
