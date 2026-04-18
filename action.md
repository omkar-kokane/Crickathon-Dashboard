# Manual Actions Required - Crickathon Platform

This file tracks all steps that require manual human input during development and deployment.

---

## 🔥 Firebase Setup (One-Time)
- [ ] Go to https://console.firebase.google.com/
- [ ] Create a new project named `crickathon-dashboard`
- [ ] Enable **Authentication** → Turn on `Email/Password` and `Google` Sign-In providers
- [ ] Create **Firestore Database** in production mode
- [ ] Create **Realtime Database** (used for timer sync)
- [ ] Go to Project Settings → Add a **Web App** → copy the `firebaseConfig` object
- [ ] Paste the config into `frontend/.env.local` (template provided below)
- [ ] Go to Project Settings → **Service Accounts** → Generate a **New Private Key** JSON
- [ ] Save it as `backend/service_account_key.json` (this file is gitignored — never commit it)

## 🐘 Google Cloud SQL (PostgreSQL) Setup
- [ ] Go to https://console.cloud.google.com/sql
- [ ] Create a new **PostgreSQL** instance (e.g., `crickathon-db`, region: `asia-south1`)
- [ ] Create a database named `crickathon`
- [ ] Create a user (e.g., `crickathon_user`) and set a password
- [ ] Enable **Cloud SQL Admin API**
- [ ] Add the connection string to `backend/.env`:
  ```
  DATABASE_URL=postgresql://crickathon_user:<PASSWORD>@/<DB_NAME>?host=/cloudsql/<INSTANCE_CONNECTION_NAME>
  ```
- [ ] For **local development**, use a direct connection string:
  ```
  DATABASE_URL=postgresql://crickathon_user:<PASSWORD>@localhost:5432/crickathon
  ```

## ☁️ Google Cloud Run (Backend Deployment)
- [ ] Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
- [ ] Run `gcloud auth login`
- [ ] Run `gcloud config set project <YOUR_PROJECT_ID>`
- [ ] Enable APIs:
  - Cloud Run API
  - Cloud Build API
  - Cloud SQL Admin API
- [ ] Set Secret Manager secrets for all backend env vars (DATABASE_URL, FIREBASE_PROJECT_ID, etc.)
- [ ] Run the deploy command (provided in backend README)

## 🔑 Environment Files
### `frontend/.env.local`
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### `backend/.env`
```env
DATABASE_URL=postgresql://user:password@localhost:5432/crickathon
FIREBASE_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=./service_account_key.json
CORS_ORIGINS=http://localhost:3000
```

## 🚀 Vercel (Frontend Deployment)
- [ ] Push code to GitHub (already done)
- [ ] Go to https://vercel.com/ and connect the GitHub repo
- [ ] Set all `NEXT_PUBLIC_*` env variables in Vercel project settings
- [ ] Set `NEXT_PUBLIC_API_BASE_URL` to the Cloud Run backend URL

## 👤 Super Admin Creation (First Run)
- [ ] After deployment, manually call the API endpoint to create the first Super Admin:
  ```bash
  curl -X POST https://<your-backend-url>/api/admin/bootstrap \
    -H "Content-Type: application/json" \
    -d '{"email": "your-email@gmail.com", "secret": "<BOOTSTRAP_SECRET>"}'
  ```
- [ ] Set `BOOTSTRAP_SECRET` as an env variable in the backend
