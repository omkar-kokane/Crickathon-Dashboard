"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const ROLE_ROUTES: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  UMPIRE: "/umpire",
  PARTICIPANT: "/participant",
};

export default function RootPage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace("/login");
      return;
    }

    if (userProfile) {
      // User has a role — route to their dashboard
      router.replace(ROLE_ROUTES[userProfile.role] || "/login");
    } else {
      // Signed in via Firebase but no DB profile — either new user or needs setup
      router.replace("/join");
    }
  }, [loading, firebaseUser, userProfile, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#00e676] border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading Crickathon...</p>
      </div>
    </div>
  );
}
