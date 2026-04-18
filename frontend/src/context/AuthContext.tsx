"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
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
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const res = await api.get("/api/users/me");
          setUserProfile(res.data);
        } catch {
          // User exists in Firebase but not yet in DB — send to /join
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{ firebaseUser, userProfile, loading, loginWithEmail, loginWithGoogle, logout }}
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
