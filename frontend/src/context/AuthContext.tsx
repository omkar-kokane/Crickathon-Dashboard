"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

interface UserProfile {
  user_id: string;
  firebase_uid: string;
  email: string;
  display_name?: string;
  role: "SUPER_ADMIN" | "ADMIN" | "UMPIRE" | "PARTICIPANT";
  org_id?: string;
}

interface AuthContextType {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile | null>;
  loginWithGoogle: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Fetches the user profile from the backend.
 * Returns the profile or null if not found / error.
 */
async function fetchUserProfile(user: User): Promise<UserProfile | null> {
  try {
    await user.getIdToken(true); // force-refresh token
    const res = await api.get("/api/users/me");
    return res.data as UserProfile;
  } catch (err: any) {
    console.warn("[Auth] fetchUserProfile failed:", err?.response?.status, err?.response?.data?.detail || err?.message);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // On mount: check if there's already a signed-in Firebase user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const profile = await fetchUserProfile(user);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    const user = auth.currentUser;
    if (!user) return null;
    const profile = await fetchUserProfile(user);
    setUserProfile(profile);
    return profile;
  }, []);

  /**
   * Login with email/password.
   * Returns the user profile after successful login + profile fetch.
   * The caller can use the returned profile to decide where to route.
   */
  const loginWithEmail = async (email: string, password: string): Promise<UserProfile | null> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await fetchUserProfile(cred.user);
    setFirebaseUser(cred.user);
    setUserProfile(profile);
    return profile;
  };

  const loginWithGoogle = async (): Promise<UserProfile | null> => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const profile = await fetchUserProfile(cred.user);
    setFirebaseUser(cred.user);
    setUserProfile(profile);
    return profile;
  };

  const logout = async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setUserProfile(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{ firebaseUser, userProfile, loading, loginWithEmail, loginWithGoogle, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
