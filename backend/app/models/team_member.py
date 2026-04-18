import uuid
from sqlmodel import SQLModel, Field


class TeamMember(SQLModel, table=True):
    __tablename__ = "team_members"

    member_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    team_id: uuid.UUID = Field(foreign_key="teams.team_id", nullable=False, index=True)
    user_id: uuid.UUID = Field(foreign_key="users.user_id", nullable=False)
    is_icon_player: bool = Field(default=False)
