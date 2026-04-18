import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.db.base import get_session
from app.core.auth import require_role, get_current_user
from app.models.user import UserRole
from app.models.organization import Organization

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrgCreate(BaseModel):
    name: str


class OrgRead(BaseModel):
    org_id: uuid.UUID
    name: str

    class Config:
        from_attributes = True


@router.post("/", response_model=OrgRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrgCreate,
    session: Session = Depends(get_session),
    _: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Super Admin only: create a new organization."""
    org = Organization(name=payload.name)
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.get("/", response_model=List[OrgRead])
def list_organizations(
    session: Session = Depends(get_session),
    _: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    orgs = session.exec(select(Organization)).all()
    return orgs


@router.get("/{org_id}", response_model=OrgRead)
def get_organization(
    org_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return org
