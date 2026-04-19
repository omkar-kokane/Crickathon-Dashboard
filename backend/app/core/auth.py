import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select
from app.core.firebase import verify_firebase_token
from app.models.user import UserRole, User
from app.db.base import get_session

logger = logging.getLogger(__name__)
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session),
) -> dict:
    """
    FastAPI dependency: verifies Firebase JWT and enriches the payload
    with the role stored in our PostgreSQL database.
    This avoids the 1-hour propagation delay of Firebase custom claims.
    """
    token = credentials.credentials
    try:
        payload = verify_firebase_token(token)
    except Exception as e:
        logger.error(f"[Auth] Firebase token verification FAILED: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token. ({type(e).__name__})",
        )

    # Enrich with DB role (authoritative source of truth)
    user = session.exec(select(User).where(User.firebase_uid == payload["uid"])).first()
    if user:
        payload["role"] = user.role.value
        payload["user_id"] = str(user.user_id)
        payload["org_id"] = str(user.org_id) if user.org_id else None

    return payload


def require_role(*roles: UserRole):
    """
    Dependency factory: restricts access to users with specific roles.
    Usage: Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    """
    def checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("role")
        if user_role not in [r.value for r in roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}",
            )
        return current_user
    return checker

