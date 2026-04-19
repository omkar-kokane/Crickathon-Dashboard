# Crickathon Integration Platform

A comprehensive, real-time hackathon management platform gamified with IPL cricket mechanics. It handles team formations, wallet balances, strategic timeouts, doubt resolution sessions (DRS), and a live scoreboard. 

The platform supports robust Role-Based Access Control (RBAC) ensuring precise event management across multiple dashboards.

## Core Roles & Dashboards
- **Admin (`/admin`):** Controls the global match engine (Powerplays, timers, custom phase names), provisions new users (granting Umpire or Admin roles), manages teams, and supervises wallet/run balances directly.
- **Umpire (`/umpire`):** The primary evaluator. Accepts or rejects "Paddle" requests (DRS, Timeout, Quick Single) submitted by participant teams in real-time, instantly affecting the requesting team's wallet or score.
- **Participant (`/participant`):** Team-level dashboard offering a live gamified view of their run score, wallet balance, and global sync to the Admin's live powerplay timer. Participants trigger live action paddle requests to their umpire.

## Hybrid Architecture

This application employs a hybrid data configuration emphasizing structured integrity mapping combined with the ultra-low latency real-time pub/sub capabilities of Firebase.

1. **Source of Truth (PostgreSQL via SQLModel):** Handles the strict relational schema for Users, Events, Organizations, Roles, Wallets, and Action configurations. 
2. **Real-time Engine (Firebase RTDB):** Exclusively utilized to sync state down to the clients instantly (e.g., Live Timer countdowns, custom Admin phase names, PENDING/REJECTED status changes of Umpire requests).
3. **Authentication (Firebase Auth):** Manages user session state and issues JWTs, which the FastAPI backend securely intercepts to authorize database actions.

## Repository Map

The monorepo contains distinct backend and frontend ecosystems. 
**For specific setup instructions/commands, refer to their respective READMEs:**

- [`/backend`](./backend/README.md) - FastAPI Python server, PostgreSQL integrations via Alembic, and Firebase Admin push services.
- [`/frontend`](./frontend/README.md) - Next.js (App Router) client handling the UI, Tailwind styling, React contexts, and Axios API calling logic.

## Recent Features & Notes for Next Developer

- **Custom Powerplay Timer:** The Admin can now type custom phase names (e.g. "Complete UI") overriding the generic "POWERPLAY_1". This label and a live countdown timer seamlessly push to all Participant and Umpire dashboards via Firebase RTDB.
- **Timeout State:** When an active timer reaches `00:00`, a global `isTimeout` state flag triggers across all dashboards, pulsing a prominent UI element: `🚨 TIMEOUT — Power Play Ended`.
- **Auth/CORS Database Bug Note:** If the frontend starts throwing `CORS error` or `403 Forbidden` after you created a new backend feature, you likely forgot to run your database migrations. A missing column crashes the FastAPI event router leading to a 500 error that masquerades as a CORS issue on the frontend client. (See the Backend README).

## Deployment

Refer to [`action.md`](./action.md) for existing deployment instructions targeting Google Cloud Run and Vercel.
