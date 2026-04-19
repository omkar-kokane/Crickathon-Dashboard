# Crickathon Backend (FastAPI)

## Tech Stack
- **Framework:** FastAPI (Python 3.13+)
- **Database ORM:** SQLModel (SQLAlchemy under the hood)
- **Migrations:** Alembic
- **Auth:** Firebase Admin SDK (JWT verification + custom claims)
- **Realtime Sync:** Firebase Realtime Database

## Project Structure

```
backend/
├── app/
│   ├── core/
│   │   ├── config.py        # Centralized settings (pydantic-settings)
│   │   ├── firebase.py      # Firebase Admin SDK init & token verification
│   │   └── auth.py          # FastAPI auth dependencies & RBAC guards
│   ├── db/
│   │   └── base.py          # SQLModel engine & session dependency
│   ├── models/              # SQLModel table definitions (one file per entity)
│   ├── routers/             # API routes (one file per domain)
│   │   ├── organizations.py
│   │   ├── users.py
│   │   ├── events.py        # Includes phase control & action config
│   │   ├── teams.py         # Includes invite code join & wallet management
│   │   ├── ledger.py        # Immutable run scoring
│   │   └── action_requests.py  # The Paddle System
│   └── services/
│       └── firebase_sync.py # Pushes state to Firebase Realtime DB
├── alembic/                 # Database migrations
├── .env.example             # Template for secrets
├── requirements.txt
└── README.md
```

## Local Development Setup

1. **Create virtual environment:**
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Setup environment:**
   ```bash
   cp .env.example .env
   # Fill in your DATABASE_URL and Firebase credentials
   ```

4. **Add Firebase service account key:**
   - Download from Firebase Console → Project Settings → Service Accounts
   - Save as `backend/service_account_key.json` (gitignored)

5. **Run database migrations:**
   ```bash
   alembic upgrade head
   ```
   > **Note:** Whenever you modify an SQLModel in `app/models/`, you MUST generate a new migration using `alembic revision --autogenerate -m "message"` and apply it with `alembic upgrade head`. Failing to do so will cause 500 errors.

6. **Start the server:**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

7. **API Docs:** http://localhost:8000/docs

## Deploy to Cloud Run

```bash
gcloud run deploy crickathon-api \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest
```
