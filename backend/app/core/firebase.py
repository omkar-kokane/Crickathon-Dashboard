import logging
import json
import firebase_admin
from firebase_admin import credentials, auth
from app.core.config import settings
import os

logger = logging.getLogger(__name__)


def get_firebase_app():
    """
    Initialize Firebase Admin SDK (singleton).
    Uses get_app() to safely reuse an existing app on hot-reload,
    preventing 'The default Firebase app already exists' ValueError.
    """
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass  # App doesn't exist yet — initialize it below

    options = {}
    if settings.FIREBASE_DATABASE_URL:
        options["databaseURL"] = settings.FIREBASE_DATABASE_URL

    # Option 1: JSON string from environment variable (for cloud deployments like Render)
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    if sa_json:
        try:
            sa_dict = json.loads(sa_json)
            cred = credentials.Certificate(sa_dict)
            logger.info("[Firebase] Initializing with service account from env var")
            return firebase_admin.initialize_app(cred, options)
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: {e}")
            raise

    # Option 2: File path (for local development)
    cred_path = settings.GOOGLE_APPLICATION_CREDENTIALS
    if os.path.exists(cred_path):
        try:
            cred = credentials.Certificate(cred_path)
            logger.info(f"[Firebase] Initializing with service account file: {cred_path}")
            return firebase_admin.initialize_app(cred, options)
        except ValueError:
            return firebase_admin.get_app()
    else:
        try:
            logger.info("[Firebase] Initializing with Application Default Credentials")
            return firebase_admin.initialize_app(options=options)
        except ValueError:
            return firebase_admin.get_app()


def verify_firebase_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return its decoded claims."""
    get_firebase_app()
    try:
        # clock_skew_seconds tolerates small clock differences between
        # the local machine and Google's servers (common on Windows).
        decoded = auth.verify_id_token(id_token, check_revoked=False, clock_skew_seconds=60)
        return decoded
    except Exception as e:
        logger.error(f"[Firebase] Token verification failed: {type(e).__name__}: {e}")
        raise


def set_user_role_claim(uid: str, role: str) -> None:
    """Set a custom role claim on a Firebase user."""
    get_firebase_app()
    auth.set_custom_user_claims(uid, {"role": role})

