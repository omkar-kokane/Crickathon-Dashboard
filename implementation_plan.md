# Crickathon Platform Implementation Plan

This document outlines the architecture and execution plan for the Crickathon platform based on the provided PRD. 

## System Architecture

Based on the requirements, the platform will utilize the following stack:
- **Backend**: FastAPI (Python) hosted on Google Cloud Run for high performance and easy asynchronous capabilities.
- **Frontend**: Next.js (React) for the dashboard, providing robust server-side rendering and an ultra-premium "dark mode" minimalist UI.
- **Ledger Database**: Google Cloud SQL (PostgreSQL) mapped via an ORM for strict ACID transactions.
- **Real-Time Data**: Firebase Firestore / Realtime Database to propagate timer, phase updates, and action requests instantly via WebSockets to connected dashboards.
- **Authentication**: Firebase Authentication (Email/Password & Google Sign-In).

## User Roles (RBAC)
1. **Super Admin**: System-level controls (manage Orgs & IT Admins).
2. **Admin**: Org-level controls (manage Events, Teams, Umpires, Match Timers).
3. **Umpire**: Write access per assigned team (manual score ledger, action request resolution).
4. **Participant**: Read-only per assigned team, push "Action Requests" (DRS, Timeout).

## Proposed Execution Phases

This is a large-scale project. I recommend breaking it down into focused execution phases.

### Phase 1: Foundation and Backend Scaffolding
1. **Repository Setup**: Create a monorepo or two independent folders (`/frontend` and `/backend_fastapi`).
2. **Database Modeling (PostgreSQL)**: Define SQLAlchemy models for Organizations, Events, Users, Teams, TeamMembers, Ledger_Transactions, and Action_Requests endpoints.
3. **Authentication Setup**: Integrate Firebase Auth middleware in FastAPI to secure endpoints based on custom claims / roles.
4. **Core CRUD Endpoints**: Build endpoints for Admins to create events and teams.

### Phase 2: Frontend Scaffolding and UI Design System
1. **Next.js Initialization**: Scaffold a new Next.js project. Setup Tailwind CSS with a strict "dark mode" theme, typography, and custom IPL-vibe UI elements.
2. **Routing & Auth Guards**: Implement routing with role-based navigation guards for Participants, Umpires, and Admins. Ensure users are routed correctly post-login.
3. **Component Library**: Build reusable stat cards (Wallet and Runs), dynamic action buttons ("Paddle" system), and interactive countdown components.

### Phase 3: The Match Engine, Ledger & State Management
1. **Master Timer Control**: Build the Admin interface in React to trigger Match Phases. Integrate Firebase Realtime Database.
2. **Live Countdown UI**: Implement React hooks to calculate remaining time smoothly.
3. **Wallet Balance Allocation**: Build Admin interface to manually initialize and allocate starting Wallet Balances (Points) to created teams.
4. **Ledger Transactions System**: Build the Umpire scoring API in Python. Ensure strict constraints (wallet balance >= cost) before committing to PostgreSQL.

### Phase 4: Action Requests (The "Paddle" System)
1. **Participant Actions**: React implementation for DRS, Strategic Timeout, Retention, and Quick Single requests.
2. **Umpire Flow**: Real-time Firestore listeners for Umpires to Approve/Reject pending requests.
3. **Automatic Deductions**: Integrate approval logic with the Python Ledger API.

### Phase 5: Future Scope (Lowest Priority)
1. **Auction System Integration**: Plan database models and interfaces for a future live "Player/Skill Auction" system. For now, this is out of scope and wallet balances are assigned manually by the Admin.

---

> [!IMPORTANT]
> ## User Review Required
> 
> I've adjusted the plan to use **React (Next.js)** for the frontend as requested, while keeping the rest of the infrastructure strictly on Google Cloud & Firebase.
> 
> 1. To get started, shall we scaffold the **React Frontend** or the **Python (FastAPI)** backend first?
> 2. Are we creating these inside the current directory (`c:/Users/Omkar/Desktop/hack/dashboard`)?
