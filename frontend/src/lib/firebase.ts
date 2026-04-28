import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getDatabase, Database } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

/**
 * SSR-safe Firebase initialization.
 * Firebase client SDK requires browser APIs, so we guard against
 * server-side execution during `next build` / SSR to prevent
 * "auth/invalid-api-key" crashes when env vars are unavailable.
 */
function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!firebaseConfig.apiKey) return null;
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

const app = getFirebaseApp();

// Export lazy-safe instances — consumers must null-check in SSR contexts,
// but all current usage is behind "use client" + useEffect so this is safe.
export const auth: Auth = app ? getAuth(app) : (null as unknown as Auth);
export const rtdb: Database = app ? getDatabase(app) : (null as unknown as Database);
export default app;
