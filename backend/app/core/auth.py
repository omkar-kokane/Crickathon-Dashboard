from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.firebase import verify_firebase_token
from app.models.user import UserRole

security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    FastAPI dependency: verifies Firebase JWT and returns decoded token payload.
    The payload contains uid, email, and custom claims (role, org_id, team_id).
    """
    token = credentials.credentials
    try:
        payload = verify_firebase_token(token)
        return payload
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )


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
