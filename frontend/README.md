# Crickathon Dashboard - Frontend

The frontend is a Next.js (App Router) application bootstrapped with Tailwind CSS. It provides three distinct real-time dashboards (Admin, Umpire, and Participant) designed with gamified cricket mechanics in mind.

## Tech Stack
- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS + Vanilla CSS (Glassmorphism & Neon Glow themes)
- **Authentication:** Firebase Auth (Email/Password, Google Auth)
- **Real-Time Data:** Firebase Realtime Database (RTDB)
- **API Client:** Axios (configured with Firebase Bearer tokens)

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── admin/       # Admin Control Center (Match control, timer, roles)
│   │   ├── umpire/      # Umpire Panel (Scoring, resolving requests)
│   │   ├── participant/ # Team Dashboard (Wallet, runs, The Paddle)
│   │   ├── login/       # Authentication page
│   │   ├── join/        # Participant team joining via invite code
│   │   └── setup/       # Bootstrap page for creating the first Super Admin
│   ├── context/
│   │   └── AuthContext.tsx    # Global Firebase Auth state & role management
│   ├── hooks/
│   │   ├── useEventTimer.ts   # RTDB listener for global powerplay timer
│   │   └── useActionRequests.ts # RTDB listener for paddle requests
│   └── lib/
│       ├── api.ts       # Axios client with auth interceptor to backend
│       └── firebase.ts  # Firebase App, Auth, and RTDB initialization
├── .env.local           # Environment variables (Firebase configs & API URL)
└── package.json
```

## Local Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Copy `.env.local.example` (or create a new `.env.local` file) and fill in your Firebase configuration and the backend API URL:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
   
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```

4. **Access the App:** Open [http://localhost:3000](http://localhost:3000) with your browser.

## Key Features & Logic Flow

- **Global Timer (Powerplays):** The `useEventTimer` hook listens to Firebase RTDB for a `phase_end_time` and custom `phase_name` set by the Admin. It locally calculates the countdown to avoid server lag, automatically triggering a "Timeout" alert when it reaches zero.
- **The Paddle System (Action Requests):** Participants trigger actions (DRS, Quick Single, Timeout, Retention). The Umpire resolves these requests inside their dashboard, awarding runs or deducting wallet points via the backend API.
- **Authentication:** Users log in via Firebase Authentication. The backend verifies this token, checks PostgreSQL for their assigned role (`ADMIN`, `UMPIRE`, `PARTICIPANT`), and enriches the token response. The Next.js frontend uses this role to dynamically restrict route access.
