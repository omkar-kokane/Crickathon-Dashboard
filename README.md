# 🏏 Crickathon Dashboard

A comprehensive, real-time hackathon management platform gamified with **IPL cricket mechanics**. It handles team formations, wallet balances, strategic timeouts, doubt resolution sessions (DRS), and a live scoreboard — all powered by real-time Firebase sync.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [How to Run](#how-to-run)
- [Roles & Dashboards](#roles--dashboards)
- [API Documentation](#api-documentation)
- [Known Backend Issues](#known-backend-issues)

---

## Overview

Crickathon transforms a standard hackathon into a cricket-themed event where:
- **Admins** control the match engine — setting phases (Powerplays), timers, creating teams & events
- **Umpires** evaluate submissions — approving/rejecting DRS requests, scoring runs
- **Participants** interact through "The Paddle" — raising DRS, Strategic Timeout, Quick Single requests

All state (timer, scores, wallet, request statuses) syncs in **real-time** across all dashboards via Firebase Realtime Database.

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.2.4 | React framework with App Router |
| **React** | 19.2.4 | UI library |
| **TypeScript** | ^5 | Type safety |
| **Tailwind CSS** | v4 | Utility-first styling |
| **Firebase Client SDK** | ^12.12 | Authentication & Realtime Database |
| **Axios** | ^1.15 | HTTP client for API calls |
| **Zustand** | ^5.0 | State management (available, currently using React Context) |
| **dayjs** | ^1.11 | Date/time utilities |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **FastAPI** | 0.115.0 | Python async web framework |
| **Uvicorn** | 0.30.6 | ASGI server |
| **SQLModel** | 0.0.21 | ORM (Pydantic + SQLAlchemy) |
| **PostgreSQL** | 15 | Relational database |
| **Alembic** | 1.13.2 | Database migrations |
| **Firebase Admin SDK** | 6.5.0 | Server-side auth verification & RTDB push |
| **Pydantic Settings** | 2.4.0 | Environment configuration |
| **Python** | 3.12.7 | Runtime |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Docker Compose** | Local PostgreSQL container |
| **Firebase Auth** | User authentication (email/password, Google) |
| **Firebase Realtime DB** | Live sync for timers, scores, request statuses |

---

## Architecture

```
┌─────────────────┐       ┌──────────────────┐      ┌─────────────────┐
│   Frontend      │       │    Backend API   │      │   PostgreSQL    │
│   (Next.js)     │──────▶│    (FastAPI)      │─────▶│   (Docker)      │
│   Port 3000     │ Axios │    Port 8000      │ SQL  │   Port 5432     │
└────────┬────────┘       └────────┬─────────┘      └─────────────────┘
         │                         │
         │    Firebase RTDB        │  Firebase Admin SDK
         │    (WebSocket)          │  (Push updates)
         ▼                         ▼
    ┌──────────────────────────────────┐
    │      Firebase Cloud Services     │
    │  ┌──────────┐  ┌──────────────┐  │
    │  │   Auth   │  │ Realtime DB  │  │
    │  └──────────┘  └──────────────┘  │
    └──────────────────────────────────┘
```

**Data flow:**
1. **Source of Truth** → PostgreSQL: Users, Events, Teams, Wallets, Actions
2. **Real-time Engine** → Firebase RTDB: Timer countdowns, phase names, request statuses, live scores
3. **Authentication** → Firebase Auth: Email/password, Google sign-in, JWT tokens

---

## Directory Structure

```
Crickathon-Dashboard/
├── run.bat                         # One-click launcher (Windows)
├── docker-compose.yml              # PostgreSQL container
├── README.md                       # This file
│
├── frontend/                       # Next.js 16 App Router
│   ├── .env.local.example          # Environment variables template
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── eslint.config.mjs
│   └── src/
│       ├── types.ts                # Shared TypeScript interfaces
│       ├── app/
│       │   ├── layout.tsx          # Root layout (AuthProvider)
│       │   ├── page.tsx            # Root redirect (role-based routing)
│       │   ├── globals.css         # Global styles & Tailwind utilities
│       │   ├── login/page.tsx      # Login page (email/password + Google)
│       │   ├── join/page.tsx       # Team join page (invite code)
│       │   ├── setup/page.tsx      # Super Admin bootstrap page
│       │   ├── admin/page.tsx      # Admin dashboard
│       │   ├── umpire/page.tsx     # Umpire dashboard
│       │   └── participant/page.tsx# Participant dashboard
│       ├── context/
│       │   └── AuthContext.tsx     # Firebase auth + API profile context
│       ├── hooks/
│       │   ├── useActionRequests.ts# Real-time action request subscription
│       │   ├── useEventTimer.ts    # Live timer countdown from Firebase
│       │   ├── useLiveEvents.ts    # Live event data merge
│       │   └── useLiveTeams.ts     # Live team score/wallet merge
│       └── lib/
│           ├── api.ts              # Axios instance with auth interceptor
│           └── firebase.ts         # Firebase client SDK initialization
│
└── backend/                        # FastAPI Python server
    ├── .env.example                # Environment variables template
    ├── requirements.txt
    ├── Dockerfile
    ├── alembic.ini
    ├── seed_users.py               # Seed test users script
    ├── alembic/                    # Database migration scripts
    └── app/
        ├── main.py                 # FastAPI app entry point
        ├── core/
        │   ├── auth.py             # JWT verification & RBAC
        │   ├── config.py           # Pydantic settings
        │   └── firebase.py         # Firebase Admin SDK init
        ├── db/
        │   └── base.py             # SQLModel engine & session
        ├── models/                 # SQLModel database models
        │   ├── user.py
        │   ├── organization.py
        │   ├── event.py
        │   ├── team.py
        │   ├── team_member.py
        │   ├── ledger.py
        │   ├── action_request.py
        │   └── action_config.py
        ├── routers/                # FastAPI route handlers
        │   ├── users.py
        │   ├── organizations.py
        │   ├── events.py
        │   ├── teams.py
        │   ├── ledger.py
        │   └── action_requests.py
        └── services/
            └── firebase_sync.py    # Push updates to Firebase RTDB
```

---

## Prerequisites

Before running the project, ensure you have the following installed:

| Tool | Required Version | Check Command |
|---|---|---|
| **Node.js** | ≥ 18.x | `node --version` |
| **npm** | ≥ 9.x | `npm --version` |
| **Python** | ≥ 3.12 | `python --version` |
| **Docker Desktop** | Latest | `docker --version` |
| **Git** | Latest | `git --version` |

You also need:
- A **Firebase project** with:
  - Authentication enabled (Email/Password + Google provider)
  - Realtime Database created
  - A web app configured (for client SDK config)
  - A service account key JSON file (for backend Admin SDK)

---

## Environment Setup

### 1. Frontend Environment

```bash
cd frontend
copy .env.local.example .env.local
```

Edit `frontend/.env.local` and fill in your Firebase web app credentials:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | e.g. `your-project.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID string |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | RTDB URL (e.g. `https://your-project-default-rtdb.firebaseio.com`) |
| `NEXT_PUBLIC_API_BASE_URL` | Backend URL (default: `http://localhost:8000`) |

### 2. Backend Environment

```bash
cd backend
copy .env.example .env
```

Edit `backend/.env` and fill in your values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `FIREBASE_DATABASE_URL` | RTDB URL |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key JSON |
| `BOOTSTRAP_SECRET` | Secret for creating the first Super Admin |
| `CORS_ORIGINS` | Allowed frontend origins (JSON array) |

### 3. Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Navigate to **Project Settings** → **Service Accounts**
3. Click **Generate New Private Key**
4. Save the JSON file as `backend/service_account_key.json`

---

## How to Run

### Option 1: One-Click Launcher (Windows)

Simply double-click `run.bat` or run from terminal:

```bash
.\run.bat
```

This will:
1. Start PostgreSQL via Docker Compose
2. Create a Python venv and install backend dependencies
3. Start the FastAPI backend on `http://localhost:8000`
4. Install frontend npm dependencies
5. Start the Next.js dev server on `http://localhost:3000`
6. Open your browser to `http://localhost:3000`

### Option 2: Manual Setup

**Terminal 1 — Database:**
```bash
docker compose up -d
```

**Terminal 2 — Backend:**
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 3 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### First-Time Bootstrap

1. Open `http://localhost:3000/login`
2. Sign in with Google (or create an account in Firebase)
3. Navigate to `http://localhost:3000/setup`
4. Enter your `BOOTSTRAP_SECRET` to grant yourself Super Admin
5. You'll be redirected to the Admin dashboard

---

## Roles & Dashboards

### 👑 Super Admin (`/admin`)
- Full platform control
- Create events and organizations
- Provision Admins and Umpires (auto-creates Firebase accounts)
- All Admin capabilities

### 🏟 Admin (`/admin`)
- Control the match engine (Powerplay phases, custom timer names)
- Create and manage teams
- Set wallet balances for teams
- View the live leaderboard

### ⚖️ Umpire (`/umpire`)
- See real-time pending action requests (DRS, Timeout, Quick Single)
- Approve/Reject/Score requests instantly
- Award or deduct runs per team
- Synced live timer from Admin

### 🏏 Participant (`/participant`)
- Live countdown timer synced from Admin
- View wallet balance and total runs
- "The Paddle" — raise action requests:
  - **DRS** — Doubt Resolution Session
  - **Strategic Timeout** — 5-minute break
  - **Retention** — Retain a technology
  - **Quick Single** — High-risk challenge
- Track request history and status

---

## API Documentation

Once the backend is running, interactive API docs are available at:

- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

## Known Backend Issues

> **Note:** These are identified issues in the backend that were NOT fixed as part of this update. They should be addressed in a future backend-focused iteration.

| # | Issue | Severity | Details |
|---|---|---|---|
| 1 | **Deprecated `@app.on_event("startup")`** | Medium | FastAPI recommends `lifespan` context manager instead |
| 2 | **Debug `print()` in firebase_sync.py** | Low | Line 36 has `print("🔥 PUSH EVENT:", data)` — should use `logging` |
| 3 | **No `.env.example` guidance** | Medium | Created as part of this update — was previously missing |
| 4 | **Alembic missing `sqlalchemy.url`** | Medium | `alembic.ini` has no DB URL configured — migrations fail without manual setup |
| 5 | **No error handling in Firebase sync** | High | If RTDB push fails, it crashes the HTTP request handler |
| 6 | **Incomplete Docker Compose** | Low | Only provides PostgreSQL — no backend container or Firebase emulator |
| 7 | **Hardcoded CORS origins** | Low | Config defaults to `localhost:3000` only |
| 8 | **Duplicate DB drivers** | Low | Both `psycopg[binary]` (v3) and `psycopg2-binary` in requirements.txt |

---

## License

This project was originally created for the Crickathon hackathon event. See the repository for license details.
