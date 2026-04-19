"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useEventTimer } from "@/hooks/useEventTimer";
import { useActionRequests } from "@/hooks/useActionRequests";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

const PHASE_LABELS: Record<string, string> = {
  PRE_MATCH: "Pre-Match",
  POWERPLAY_1: "Powerplay 1",
  POWERPLAY_2: "Powerplay 2",
  POWERPLAY_3: "Powerplay 3",
  POWERPLAY_4: "Powerplay 4",
  SUPER_OVER: "Super Over",
  ENDED: "Match Ended",
};

const ACTION_TYPES = [
  { type: "DRS", label: "🔍 DRS", description: "Doubt Resolution Session", color: "blue" },
  { type: "STRATEGIC_TIMEOUT", label: "⏱ Timeout", description: "Strategic Timeout (5 min)", color: "yellow" },
  { type: "RETENTION", label: "🔒 Retention", description: "Retain a technology", color: "purple" },
  { type: "QUICK_SINGLE", label: "⚡ Quick Single", description: "High-risk challenge", color: "red" },
];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ParticipantDashboard() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();
  const [team, setTeam] = useState<any>(null);
  const [eventId, setEventId] = useState<string>("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const { eventState, secondsLeft, isActive, isTimeout } = useEventTimer(eventId);
  const liveRequests = useActionRequests(eventId);

  // Redirect if not participant
  useEffect(() => {
    if (userProfile && !["PARTICIPANT"].includes(userProfile.role)) {
      router.replace("/");
    }
  }, [userProfile, router]);

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const res = await api.get("/api/teams/");
        // Get the team the participant belongs to
        if (res.data.length > 0) {
          setTeam(res.data[0]);
          setEventId(res.data[0].event_id);
        }
      } catch {}
    };
    fetchTeam();
  }, []);

  const getErrorText = (err: any, fallback: string) => {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d[0]?.msg || fallback;
    return fallback;
  };

  const handleActionRequest = async (type: string) => {
    if (!team) return;
    setLoadingAction(type);
    setActionMsg(null);
    try {
      await api.post("/api/requests/", {
        team_id: team.team_id,
        event_id: team.event_id,
        type,
      });
      setActionMsg({ text: `${type.replace("_", " ")} request sent! Waiting for Umpire...`, type: "success" });
    } catch (err: any) {
      setActionMsg({ text: getErrorText(err, "Request failed."), type: "error" });
    } finally {
      setLoadingAction(null);
    }
  };

  const urgencyColor = secondsLeft < 300 ? "text-[#ff1744]" : secondsLeft < 600 ? "text-[#ffd600]" : "text-[#00e676]";

  const myRequests = liveRequests.filter((r) => r.team_id === team?.team_id);

  // Derive the display name for the current phase — prefer custom name, fallback to label map
  const currentPhaseName = eventState?.phase_name
    || (eventState ? PHASE_LABELS[eventState.current_phase] || eventState.current_phase : "Waiting...");

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-8">
      {/* Header */}
      <header className="glass border-b border-[#2a2a3a] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏏</span>
          <div>
            <h1 className="font-bold text-white text-sm">Crickathon</h1>
            <p className="text-xs text-slate-500">{team?.name || "Loading..."}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:block">{userProfile?.email}</span>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-[#ff1744] transition-colors">
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Live Timer — Hero Section */}
        {isTimeout ? (
          <div className="glass rounded-2xl p-6 text-center border border-[#ff1744]/30 animate-pulse">
            <div className="text-xs text-[#ff1744] uppercase tracking-widest mb-2 font-bold">
              {currentPhaseName}
            </div>
            <div className="text-5xl sm:text-7xl font-black text-[#ff1744] tracking-tight">
              🚨 TIMEOUT
            </div>
            <div className="mt-3 text-sm text-[#ff1744]/80 font-medium">
              Power Play Ended
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-6 text-center glow-green">
            <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">
              {currentPhaseName}
            </div>
            <div className={`text-7xl font-mono font-black tracking-tight ${urgencyColor} text-glow-green transition-colors`}>
              {isActive ? formatTime(secondsLeft) : "-- : --"}
            </div>
            <div className="mt-2">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#00e676]">
                  <span className="w-2 h-2 rounded-full bg-[#00e676] pulse-green" />
                  Live
                </span>
              ) : (
                <span className="text-xs text-slate-500">No active timer</span>
              )}
            </div>
          </div>
        )}

        {/* Team Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5 text-center card-hover">
            <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Wallet Points</div>
            <div className="text-5xl font-black text-[#ffd600] text-glow-yellow">
              {team?.wallet_balance ?? "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">pts remaining</div>
          </div>
          <div className="glass rounded-2xl p-5 text-center card-hover">
            <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Total Runs</div>
            <div className="text-5xl font-black text-[#00e676] text-glow-green">
              {team?.total_runs ?? "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">scored</div>
          </div>
        </div>

        {/* The Paddle — Action Requests */}
        <div className="glass rounded-2xl p-6">
          <h2 className="text-sm font-bold text-white mb-1">🏏 The Paddle</h2>
          <p className="text-xs text-slate-500 mb-4">Raise a request to your Umpire</p>

          {actionMsg && (
            <div className={`mb-4 rounded-xl px-4 py-3 text-xs ${
              actionMsg.type === "success"
                ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]"
                : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
            }`}>
              {actionMsg.text}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {ACTION_TYPES.map((action) => {
              const colorMap: Record<string, string> = {
                blue: "border-[#2979ff]/30 hover:border-[#2979ff] text-[#2979ff]",
                yellow: "border-[#ffd600]/30 hover:border-[#ffd600] text-[#ffd600]",
                purple: "border-[#d500f9]/30 hover:border-[#d500f9] text-[#d500f9]",
                red: "border-[#ff1744]/30 hover:border-[#ff1744] text-[#ff1744]",
              };
              return (
                <button
                  id={`action-btn-${action.type.toLowerCase()}`}
                  key={action.type}
                  onClick={() => handleActionRequest(action.type)}
                  disabled={loadingAction === action.type}
                  className={`glass border ${colorMap[action.color]} rounded-xl p-4 text-left transition-all duration-200 hover:bg-[#1a1a24] disabled:opacity-50`}
                >
                  <div className="text-lg mb-1">{action.label}</div>
                  <div className="text-xs text-slate-400">{action.description}</div>
                  {loadingAction === action.type && (
                    <div className="text-xs mt-1 animate-pulse">Sending...</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Requests */}
        {myRequests.length > 0 && (
          <div className="glass rounded-2xl p-6">
            <h2 className="text-sm font-bold text-white mb-4">Recent Requests</h2>
            <div className="space-y-2">
              {myRequests.slice(0, 5).map((req) => {
                const statusColor: Record<string, string> = {
                  PENDING: "text-[#ffd600] bg-[#ffd600]/10",
                  APPROVED: "text-[#00e676] bg-[#00e676]/10",
                  REJECTED: "text-[#ff1744] bg-[#ff1744]/10",
                  COMPLETED: "text-[#00e676] bg-[#00e676]/10",
                  FAILED: "text-[#ff1744] bg-[#ff1744]/10",
                };
                return (
                  <div key={req.request_id} className="flex items-center justify-between py-2 border-b border-[#2a2a3a] last:border-0">
                    <div>
                      <span className="text-xs font-medium text-white">{req.type.replace("_", " ")}</span>
                      <p className="text-[10px] text-slate-500">{new Date(req.created_at).toLocaleTimeString()}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusColor[req.status] || "text-slate-400"}`}>
                      {req.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
