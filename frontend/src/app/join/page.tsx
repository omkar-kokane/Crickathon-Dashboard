"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function JoinPage() {
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/teams/join", { invite_code: code.trim().toUpperCase() });
      router.push("/participant");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Invalid invite code. Please check with your Admin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#00e676]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass rounded-2xl p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🏏</div>
          <h1 className="text-2xl font-bold text-white mb-2">Join Your Team</h1>
          <p className="text-slate-400 text-sm">
            Enter the invite code given to you by your Admin to join the match.
          </p>
          {firebaseUser && (
            <p className="text-slate-500 text-xs mt-2">Signed in as {firebaseUser.email}</p>
          )}
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-2">Team Invite Code</label>
            <input
              id="invite-code-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full bg-[#0a0a0f] border border-[#2a2a3a] focus:border-[#00e676]/50 rounded-xl px-4 py-4 text-center text-xl font-mono font-bold text-[#00e676] tracking-widest outline-none transition-all duration-200 uppercase"
              placeholder="A3F1C8"
              maxLength={6}
              required
            />
          </div>

          {error && (
            <div className="bg-[#ff1744]/10 border border-[#ff1744]/20 rounded-xl px-4 py-3">
              <p className="text-[#ff1744] text-xs">{error}</p>
            </div>
          )}

          <button
            id="join-team-btn"
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full bg-[#00e676] hover:bg-[#00c853] disabled:bg-[#00e676]/30 text-black font-bold py-3 rounded-xl transition-all duration-200 glow-green"
          >
            {loading ? "Joining..." : "Join Team →"}
          </button>
        </form>
      </div>
    </div>
  );
}
