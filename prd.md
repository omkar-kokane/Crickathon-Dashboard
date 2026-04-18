# Product Requirements Document (PRD): Crickathon Platform

## 1. Executive Summary
**Crickathon** is a multi-tenant, real-time web application SaaS designed to gamify hackathons using cricket (IPL) mechanics. The platform is designed to manage team formations, real-time countdown timers for specific event phases ("Powerplays"), point-based digital wallets, and manual scoring ("Runs"). The fundamental goal is to drastically increase participant engagement and provide an exciting meta-game alongside the core hackathon development tasks.

## 2. Product Vision & Goals
* **Gamification:** Introduce a competitive, fast-paced environment inspired by T20 cricket.
* **Fairness & Manual Oversight:** Rely on human judgment (Umpires) for subjective grading and run calculations to avoid automated constraints.
* **Real-time Experience:** Ensure all participants, admins, and umpires view identical countdowns and event states synchronized to the second.
* **Scalability:** Built as a multi-tenant SaaS to allow deployment across different organizations (e.g., GDG Nashik, GDG Bangalore) and subsequent independent events.

## 3. Role-Based Access Control (RBAC)

The system enforces strict boundaries between four distinct user roles:

1. **Super Admin:** 
   - System-level access.
   - Can provision new `Organizations`.
   - Can assign **Admins** to organizations.
2. **Admin (Event Organizer):** 
   - Organization-level access.
   - Creates `Events`.
   - Provisions `Teams` and assigns `Umpires` to them.
   - Controls the Master Match State (starting/stopping Powerplays and managing the main timer).
3. **Umpire (Match Referee):** 
   - Team-level write access.
   - Views and manages specific assigned teams.
   - Directly inputs `Runs`, resolves `Action Requests` (DRS, Timeout), and imposes manual penalties.
4. **Participant:** 
   - Team-level read-only access.
   - Views own team's dashboard (wallet balance, runs, current phase).
   - Requests actions ("The Paddle") from the Umpire.

## 4. Core Features & Business Logic

### A. The Master Match Engine (Global State)
* **Trigger:** Admin selects a specific phase (e.g., `POWERPLAY_1`) and a duration.
* **Action:** The system sets `Event.current_phase` and calculates `Event.phase_end_time`.
* **Sync:** WebSockets instantly push changes to all connected clients.
* **Client Behavior:** Frontends compute the live countdown locally based on the `phase_end_time` relative to the server time, preventing visual lagging.

### B. The Umpire Scoring System
* **Rule:** Runs and specific penalties are evaluated entirely by humans.
* **Action:** Umpire inputs subjective score (`amount` and `reason`).
* **Execution:** System commits a rigid transaction to the `Ledger_Transactions` and updates `Team.total_runs`.

### C. The Wallet Economy ("The Paddle System")
* **Rule:** Teams start with a default wallet balance (e.g., 100 points). Teams cannot enter a negative balance. Transactions revert if `Wallet < Cost`.
* **Flow:** 
    1. Participant requests an action (DRS).
    2. Request is created as `PENDING`. Umpire gets realtime notification.
    3. Umpire *Approves*: Points deducted from wallet, logged in ledger, request state moves to `APPROVED`.
    4. Umpire *Rejects*: No points deducted, request state moves to `REJECTED`.

### D. Game Mechanics & Action Configuration
**Crucial Rule:** The exact mechanics for actions are *not* hardcoded. The **Admin** has the ability to configure four specific parameters for each action type (`DRS`, `STRATEGIC_TIMEOUT`, `RETENTION`, `QUICK_SINGLE`) prior to or during an event:
1.  **Time:** Duration of the action (e.g., 5 mins for Timeout, 10 mins for DRS).
2.  **Runs (+):** Reward if successful (e.g., +10 runs).
3.  **Runs (-):** Penalty if unsuccessful or advice ignored (e.g., -5 runs, -10 runs).
4.  **Points Cost:** Wallet deduction to invoke the action (e.g., 10 points).

*Default Configuration based on the Rulebook:*
1. **Strategic Timeout:** 
   - First request is Free. Extensions cost **10 Points**.
   - Duration: **5 Minutes**.
2. **DRS (Doubt Resolution):** 
   - Cost: **10 Points**. 
   - Duration: **10 Minutes**.
   - Outcome (manually evaluated): **+10 Runs** if advice taken, **-5 Runs** if advice ignored.
3. **Retention:** 
   - Requires Umpire Approval. Cost: **10 Points**.
4. **Quick Single:** 
   - Umpire triggers. High Risk/Reward. 
   - Event Duration (Configurable).
   - Outcomes (manually evaluated): **+10 Runs** for success, **-10 Runs** for failure.
* **Rule:** System enforces self-serve participant registration to avoid manual database entry.
* **Team Creation:** Admins create a `Team` and are automatically provided a unique 6-character alphanumeric Invite Code (e.g., `CRICK-7X9B`).
* **Participant Registration Flow:** 
  1. Participant logs in via Firebase Auth (Google Sign-In). 
  2. The frontend detects lack of team assignment and routes to a `/join` page.
  3. Participant inputs the Admin-provided Invite Code.
  4. The backend verifies the code, assigns the user to the corresponding `Team` with the `PARTICIPANT` role, and unlocks the dashboard.

## 5. Non-Functional Requirements
* **Aesthetics:** "Dark Mode" Minimalist UI – ultra-premium, dark-themed experience with vibrant, electric accents.
* **Latency:** All state updates (Timers, Phase Changes) must propagate within <500ms to users.
* **Data Integrity:** Wallet points and Runs must strictly adhere to transactional ACID properties to avoid double-spend or collision errors during simultaneous action requests.
