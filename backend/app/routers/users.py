import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel, EmailStr

from app.db.base import get_session
from app.core.auth import get_current_user, is_super_admin, get_user_org_id
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
    email: str
    display_name: Optional[str] = None
    role: UserRole
    org_id: Optional[uuid.UUID] = None


class AssignRoleResponse(BaseModel):
    user_id: uuid.UUID
    firebase_uid: str
    email: str
    display_name: Optional[str]
    role: UserRole
    org_id: Optional[uuid.UUID]
    temporary_password: Optional[str] = None

    class Config:
        from_attributes = True


class BootstrapPayload(BaseModel):
    secret: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/bootstrap", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def bootstrap_super_admin(
    payload: BootstrapPayload,
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    One-time endpoint to create a Super Admin from your current active session.
    Protected by a secret key set in the .env file.
    """
    if not settings.BOOTSTRAP_SECRET or settings.BOOTSTRAP_SECRET == "change-me-in-production":
        raise HTTPException(status_code=503, detail="Bootstrap secret is not configured.")

    if payload.secret != settings.BOOTSTRAP_SECRET:
        raise HTTPException(status_code=403, detail="Invalid bootstrap secret.")

    existing_super_admin = session.exec(
        select(User).where(User.role == UserRole.SUPER_ADMIN)
    ).first()
    if existing_super_admin:
        raise HTTPException(status_code=400, detail="Super admin already exists.")

    fb_uid = current_user["uid"]
    fb_email = current_user.get("email", "")

    existing = session.exec(select(User).where(User.firebase_uid == fb_uid)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists in the database.")

    user = User(
        firebase_uid=fb_uid,
        email=fb_email,
        role=UserRole.SUPER_ADMIN,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    set_user_role_claim(fb_uid, UserRole.SUPER_ADMIN.value)
    return user


@router.get("/me", response_model=UserRead)
def get_me(current_user: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    """Returns the currently authenticated user's profile."""
    user = session.exec(select(User).where(User.firebase_uid == current_user["uid"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found. Please contact Admin.")
    return user


@router.post("/assign-role", response_model=AssignRoleResponse)
def assign_role(
    payload: AssignRolePayload,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    """
    Admin/Super Admin: assign a role to a user.
    If the user doesn't have a Firebase account yet, one is created automatically
    with a temporary password that is returned in the response.
    """
    from firebase_admin import auth
    import secrets
    import string

    if payload.role == UserRole.SUPER_ADMIN and current_user.get("role") != UserRole.SUPER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Only a Super Admin can assign the Super Admin role.")

    temp_password = None

    # Try to find the user in Firebase; auto-create if they don't exist
    try:
        fb_user = auth.get_user_by_email(payload.email)
    except Exception:
        # User doesn't exist in Firebase — create them automatically
        temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
        try:
            fb_user = auth.create_user(
                email=payload.email,
                password=temp_password,
                email_verified=True,
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to create Firebase account: {str(e)}")

    target_uid = fb_user.uid

    if payload.org_id:
        org = session.get(Organization, payload.org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found.")

    existing = session.exec(select(User).where(User.firebase_uid == target_uid)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already provisioned with a role.")

    user = User(
        firebase_uid=target_uid,
        email=payload.email,
        display_name=payload.display_name,
        role=payload.role,
        org_id=payload.org_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    set_user_role_claim(target_uid, payload.role.value)

    from app.services.firebase_sync import push_user_update
    push_user_update(user)

    # Return user data + temp password so the Super Admin can share it
    return AssignRoleResponse(
        user_id=user.user_id,
        firebase_uid=user.firebase_uid,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        org_id=user.org_id,
        temporary_password=temp_password,
    )


@router.get("/", response_model=List[UserRead])
def list_users(
    org_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    query = select(User)

    if is_super_admin(current_user):
        if org_id:
            query = query.where(User.org_id == org_id)
        return session.exec(query).all()

    user_org_id = get_user_org_id(current_user)
    if not user_org_id:
        raise HTTPException(status_code=403, detail="Access denied. User has no organization scope.")

    if org_id and org_id != user_org_id:
        raise HTTPException(status_code=403, detail="Access denied. Cannot list users outside your organization.")

    query = query.where(User.org_id == user_org_id)
    if org_id:
        query = query.where(User.org_id == org_id)
    return session.exec(query).all()
