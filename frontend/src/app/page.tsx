"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function RootPage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    if (!userProfile) {
      router.replace("/join");
      return;
    }
    // Route based on role
    const roleRoutes: Record<string, string> = {
      SUPER_ADMIN: "/admin",
      ADMIN: "/admin",
      UMPIRE: "/umpire",
      PARTICIPANT: "/participant",
    };
    router.replace(roleRoutes[userProfile.role] || "/login");
  }, [loading, firebaseUser, userProfile, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#00e676] border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading Crickathon...</p>
      </div>
    </div>
  );
}
