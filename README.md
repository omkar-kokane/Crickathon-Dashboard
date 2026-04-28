# 🏏 Crickathon Dashboard

Welcome to the **Crickathon Dashboard**! This document explains exactly what this application is, how it works, how to test it, and the recent stability upgrades we've made to it.

---

## 🌟 What is this Application?

The Crickathon Dashboard is a gamified, real-time **Hackathon Management Platform**. 

Instead of a traditional hackathon where teams just sit and code, this platform introduces **Cricket Mechanics** to make the event highly interactive and competitive:
- **Runs:** These are "points" awarded to teams for completing features, answering questions, or presenting good UI.
- **Wallet Points:** A virtual currency teams start with. They can spend this currency to "buy" help, resources, or extra time.
- **DRS (Doubt Resolution System):** If a team is stuck, they use The Paddle to request a DRS. This alerts a mentor.
- **Timeouts:** Teams can request strategic timeouts.

## 👥 How it Works (The Roles)

The platform is split into 4 distinct roles, each with their own dashboard:

1. **Super Admin & Admin (The Organizers):** 
   - They create the main Event (e.g., "Hackathon 2026").
   - They control the Global Timer (starting "Powerplays" or phases).
   - They create Teams and generate **Invite Codes**.
2. **Umpire (The Mentors/Judges):** 
   - Assigned to oversee specific teams.
   - When a team clicks the DRS or Timeout button, the Umpire gets a real-time popup to Approve or Reject it.
   - Umpires manually add **Runs** to a team's score or deduct **Wallet Points** using their scoring panel.
3. **Participant (The Hackers):** 
   - They log in, enter their Team's Invite Code, and join the dashboard.
   - They use **The Paddle** to trigger DRS or Timeouts.
   - They watch their Score and Wallet update in real-time as the Umpire evaluates them.

---

## 🛠️ The Architecture (Tech Stack)

This is a modern **Hybrid Architecture** designed for speed and reliability:
- **Frontend:** Built with Next.js and React.
- **Backend:** Built with FastAPI (Python) for extremely fast API responses.
- **Primary Database:** PostgreSQL. This stores all the permanent, critical data (Users, Teams, Events, Ledger logs).
- **Real-Time Engine:** Firebase Realtime Database (RTDB) & Auth. 

**How the Real-Time Sync Works:** 
When an Umpire clicks "Add 50 Runs", the frontend sends a request to the FastAPI backend. The backend securely updates PostgreSQL. Then, the backend instantly pushes the new score to Firebase RTDB. The Participant's browser is actively listening to Firebase via WebSockets, so their screen updates instantly with a sliding notification—without ever needing to refresh the page!

---

## 🧪 How to Test the Application Properly

Because Firebase Authentication uses cookies, you **cannot** be logged into all roles in the same browser window. To test the real-time interactions, you must use different browser profiles or Incognito modes.

**Prerequisites:** 
Make sure your backend and frontend servers are running (you can use `run.bat`).
*(All test accounts use the password: `TestPassword123!`)*

1. **The Admin View (Window 1 - e.g., Normal Chrome):**
   - Log in as `admin@crickathon.com`.
   - Go to the Admin Control Center.
   - Try typing a phase name (e.g., "Phase 1") and clicking **Start Power Play**.
2. **The Umpire View (Window 2 - e.g., Chrome Incognito):**
   - Log in as `umpire@crickathon.com`.
   - You will see the Umpire Panel and the teams you are assigned to (Team Alpha & Beta).
   - *Notice that the timer started exactly when the Admin clicked start.*
3. **The Participant View (Window 3 - e.g., Microsoft Edge):**
   - Log in as `participant@crickathon.com`.
   - You will see your Team Alpha dashboard.
4. **The Live Test:**
   - **Participant:** Click the **🔍 DRS** button.
   - **Umpire:** Look at your screen. You will instantly see a "Pending Request" pop up. Click **✓ Approve**.
   - **Participant:** Look back at your screen. A notification will slide in saying `✅ DRS — APPROVED`.
   - **Umpire:** Scroll to the Team Alpha scoring panel. Type `+50` runs and click **Update**.
   - **Participant:** You will instantly see a notification `+50 runs → Total: 50` slide in, and your scoreboard will update!

---

## 🚀 Recent Changes & Fixes

We recently completely overhauled the system to fix bugs and improve the user experience:

### 1. UI & User Experience Enhancements
- **Persistent Umpire Notifications:** Previously, when an Umpire received a DRS request, the notification disappeared automatically after 5 seconds, causing them to miss it. We made these notifications permanent until the Umpire manually approves, rejects, or dismisses them.
- **Participant Floating Toasts:** We built a custom React `useRef` system to calculate the "delta" of scores. Now, instead of just saying "Score updated", the UI calculates exactly how much changed and shows beautiful sliding animations (e.g., `+45 runs`, `-50 wallet pts`).

### 2. Backend Stability & Security Fixes
- **Organization Scopes Fixed:** The API enforces strict security: Umpires can only score teams in their own "Organization". The database was missing Organizations, causing 403 Forbidden errors ("Wallet update failed"). We created a Global Test Org and properly linked all users and events to it.
- **Firebase Connection Safeguards:** If the Firebase servers ever experience downtime, the backend `firebase_sync.py` now uses `try-except` blocks. Instead of crashing the entire application, it gracefully logs the error and allows the PostgreSQL transaction to finish.
- **Clock Sync Issue Resolved:** Windows computers often have a slight clock delay compared to Google's servers, causing Firebase to reject logins with a "Token used too early" error. We increased the backend token tolerance (`clock_skew_seconds=60`) to completely eliminate this bug.
- **FastAPI Modernization:** We migrated the backend from deprecated `@app.on_event("startup")` hooks to the modern `lifespan` context manager for safer database initialization.
- **Database Driver Cleanups:** Removed conflicting `psycopg` drivers in `requirements.txt` to ensure smooth production deployments.
- **User Seeding Reliability:** Updated the `seed_users.py` script so that it properly maps existing PostgreSQL users to new Firebase projects without crashing.
