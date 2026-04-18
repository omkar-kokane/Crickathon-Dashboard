import firebase_admin
from firebase_admin import credentials, auth
from app.core.config import settings
import os

_app = None


def get_firebase_app():
    """Initialize Firebase Admin SDK (singleton)."""
    global _app
    if _app is None:
        cred_path = settings.GOOGLE_APPLICATION_CREDENTIALS
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            _app = firebase_admin.initialize_app(cred)
        else:
            # Use Application Default Credentials (for Cloud Run)
            _app = firebase_admin.initialize_app()
    return _app


def verify_firebase_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return its decoded claims."""
    get_firebase_app()
    decoded = auth.verify_id_token(id_token)
    return decoded


def set_user_role_claim(uid: str, role: str) -> None:
    """Set a custom role claim on a Firebase user."""
    get_firebase_app()
    auth.set_custom_user_claims(uid, {"role": role})
