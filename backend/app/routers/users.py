import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel, EmailStr

from app.db.base import get_session
from app.core.auth import require_role, get_current_user
from app.core.firebase import set_user_role_claim
from app.models.user import User, UserRole
from app.models.organization import Organization
from app.core.config import settings

router = APIRouter(prefix="/users", tags=["users"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class UserRead(BaseModel):
    user_id: uuid.UUID
    firebase_uid: str
    email: str
    display_name: Optional[str]
    role: UserRole
    org_id: Optional[uuid.UUID]

    class Config:
        from_attributes = True


class AssignRolePayload(BaseModel):
    firebase_uid: str
    email: str
    display_name: Optional[str] = None
    role: UserRole
    org_id: Optional[uuid.UUID] = None


class BootstrapPayload(BaseModel):
    email: str
    firebase_uid: str
    secret: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/bootstrap", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def bootstrap_super_admin(payload: BootstrapPayload, session: Session = Depends(get_session)):
    """
    One-time endpoint to create the very first Super Admin.
    Protected by a secret key set in the .env file.
    """
    if payload.secret != settings.BOOTSTRAP_SECRET:
        raise HTTPException(status_code=403, detail="Invalid bootstrap secret.")

    existing = session.exec(select(User).where(User.firebase_uid == payload.firebase_uid)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists.")

    user = User(
        firebase_uid=payload.firebase_uid,
        email=payload.email,
        role=UserRole.SUPER_ADMIN,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    set_user_role_claim(payload.firebase_uid, UserRole.SUPER_ADMIN.value)
    return user


@router.get("/me", response_model=UserRead)
def get_me(current_user: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    """Returns the currently authenticated user's profile."""
    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found. Please contact Admin.")
    return user


@router.post("/assign-role", response_model=UserRead)
def assign_role(
    payload: AssignRolePayload,
    session: Session = Depends(get_session),
    _: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """Admin/Super Admin: assign a role to a Firebase user to provision them in the system."""
    if payload.org_id:
        org = session.get(Organization, payload.org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found.")

    existing = session.exec(select(User).where(User.firebase_uid == payload.firebase_uid)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already provisioned.")

    user = User(
        firebase_uid=payload.firebase_uid,
        email=payload.email,
        display_name=payload.display_name,
        role=payload.role,
        org_id=payload.org_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    set_user_role_claim(payload.firebase_uid, payload.role.value)
    return user


@router.get("/", response_model=List[UserRead])
def list_users(
    org_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    _: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    query = select(User)
    if org_id:
        query = query.where(User.org_id == org_id)
    return session.exec(query).all()
