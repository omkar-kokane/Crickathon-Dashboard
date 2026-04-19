"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function SetupPage() {
  const { firebaseUser, logout } = useAuth();
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) return;

    setLoading(true);
    setMsg(null);
    try {
      await api.post("/api/users/bootstrap", { secret });
      setMsg({ text: "Super Admin privileges granted! Redirecting...", type: "success" });
      setTimeout(() => {
        // Reload to let AuthContext fetch the new profile
        window.location.href = "/admin";
      }, 1500);
    } catch (err: any) {
      setMsg({
        text: err?.response?.data?.detail || "Failed to bootstrap. Check your secret key.",
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!firebaseUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0a0a0f]">
        <div className="glass p-8 rounded-2xl max-w-sm w-full text-center">
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-sm text-slate-400 mb-6">You must be signed in to access the system setup.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-[#00e676] hover:bg-[#00c853] text-black font-bold py-3 rounded-xl transition-all"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0a0f] relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#d500f9]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass rounded-2xl p-8 relative z-10 border border-[#d500f9]/30">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-3xl">⚙️</span>
            <h1 className="text-2xl font-bold text-white">System Setup</h1>
          </div>
          <p className="text-slate-400 text-sm">Bootstrap the Platform Database</p>
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-lg mt-4 px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Logged in as:</span>
            <span className="text-xs font-mono text-[#00e676]">{firebaseUser.email}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Bootstrap Secret
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full bg-[#0a0a0f] border border-[#2a2a3a] focus:border-[#d500f9]/50 rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200 font-mono"
              placeholder="Enter BOOTSTRAP_SECRET"
              required
            />
          </div>

          {msg && (
            <div className={`rounded-xl px-4 py-3 text-xs ${
              msg.type === "success" 
                ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]" 
                : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
            }`}>
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !secret}
            className="w-full bg-[#d500f9] hover:bg-[#aa00ff] text-white font-bold py-3 rounded-xl transition-all duration-200 disabled:opacity-50 mt-4 glow-purple"
          >
            {loading ? "Bootstrapping..." : "Initialize Super Admin"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={logout} 
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
