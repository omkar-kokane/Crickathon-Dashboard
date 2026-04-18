# Crickathon Platform

A real-time hackathon management platform gamified with IPL cricket mechanics.

## Architecture
- **Frontend:** Next.js (React) + Tailwind CSS — `frontend/`
- **Backend:** FastAPI (Python) + SQLModel — `backend/`
- **Database:** Google Cloud SQL (PostgreSQL) via Alembic migrations
- **Real-Time:** Firebase Realtime Database (timer + action request sync)
- **Auth:** Firebase Authentication (Google + Email/Password)

## Local Development

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate    # Windows
pip install -r requirements.txt
cp .env.example .env     # Fill in your credentials
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local  # Fill in Firebase config
npm run dev                         # Runs at http://localhost:3000
```

## Manual Setup Required
See `action.md` for all cloud configuration steps (Firebase, Cloud SQL, Cloud Run).

## Project Structure
```
dashboard/
├── backend/         # FastAPI Python API
│   ├── app/
│   │   ├── core/    # Config, Firebase, Auth deps
│   │   ├── db/      # SQLModel session/engine
│   │   ├── models/  # All DB table definitions
│   │   ├── routers/ # API route handlers (one per domain)
│   │   └── services/# Firebase real-time sync
│   └── alembic/     # Database migrations
├── frontend/        # Next.js React app
│   └── src/
│       ├── app/     # Route pages (admin, umpire, participant, login, join)
│       ├── context/ # AuthContext (Firebase session)
│       ├── hooks/   # useEventTimer, useActionRequests (Firebase listeners)
│       └── lib/     # firebase.ts, api.ts (Axios client)
├── action.md        # Manual setup checklist
├── prd.md           
└── system_architecture.md
```
