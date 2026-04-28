"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useActionRequests } from "@/hooks/useActionRequests";
import { useEventTimer } from "@/hooks/useEventTimer";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import type { Team, ActionRequestUpdate } from "@/types";

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

interface ScoreToast {
  id: number;
  text: string;
  type: "runs" | "wallet" | "request";
  delta?: number;
}

export default function ParticipantDashboard() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [eventId, setEventId] = useState<string>("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [actionMessage, setActionMessage] = useState("");  // message participant wants to send to umpire
  const [toasts, setToasts] = useState<ScoreToast[]>([]);
  const toastIdRef = useRef(0);

  // Track previous values to detect changes
  const prevRunsRef = useRef<number | null>(null);
  const prevWalletRef = useRef<number | null>(null);
  const prevRequestStatusRef = useRef<Record<string, string>>({});

  const { eventState, secondsLeft, isActive, isTimeout } = useEventTimer(eventId?.toLowerCase() || "");
  const liveRequests = useActionRequests(eventId?.toLowerCase() || "");
  const liveTeams = useLiveTeams(eventId?.toLowerCase() || "", team ? [team] : []);
  const currentTeam = liveTeams.find((t) => t.team_id?.toLowerCase() === team?.team_id?.toLowerCase()) || team;

  // Redirect if not participant
  useEffect(() => {
    if (userProfile && !["PARTICIPANT"].includes(userProfile.role)) {
      router.replace("/");
    }
  }, [userProfile, router]);

  const refreshTeam = useCallback(async () => {
    try {
      const res = await api.get("/api/teams/me/current");
      setTeam(res.data);
      setEventId(res.data.event_id);
    } catch { /* handled by auth interceptor */ }
  }, []);

  useEffect(() => {
    if (userProfile) {
      refreshTeam();
    }
  }, [userProfile, refreshTeam]);



  // Helper to add a toast notification
  const addToast = useCallback((text: string, type: ScoreToast["type"], delta?: number) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, text, type, delta }]);
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  // Detect runs/wallet changes from live data and show toasts
  useEffect(() => {
    if (!currentTeam) return;

    const currentRuns = currentTeam.total_runs;
    const currentWallet = currentTeam.wallet_balance;

    // Only show toasts after initial load (skip first render)
    if (prevRunsRef.current !== null && currentRuns !== prevRunsRef.current) {
      const delta = currentRuns - prevRunsRef.current;
      const sign = delta >= 0 ? "+" : "";
      const reason = (currentTeam as Record<string, unknown>)?.last_reason;
      const reasonSuffix = reason ? ` (${reason})` : "";
      const text = `${sign}${delta} runs${reasonSuffix}  →  Total: ${currentRuns}`;
      addToast(text, "runs", delta);
      console.log(`[Participant] 🏏 Score updated: ${sign}${delta} runs${reasonSuffix} | New total: ${currentRuns}`);
    }

    if (prevWalletRef.current !== null && currentWallet !== prevWalletRef.current) {
      const delta = currentWallet - prevWalletRef.current;
      const sign = delta >= 0 ? "+" : "";
      const text = `${sign}${delta} wallet pts  →  Balance: ${currentWallet}`;
      addToast(text, "wallet", delta);
      console.log(`[Participant] 💰 Wallet updated: ${sign}${delta} pts | New balance: ${currentWallet}`);
    }

    prevRunsRef.current = currentRuns;
    prevWalletRef.current = currentWallet;
  }, [currentTeam?.total_runs, currentTeam?.wallet_balance, currentTeam, addToast]);

  // Detect request status changes and notify
  const myRequests = liveRequests.filter((r: ActionRequestUpdate) => r.team_id === team?.team_id);

  useEffect(() => {
    if (!team) return;

    for (const req of myRequests) {
      const prevStatus = prevRequestStatusRef.current[req.request_id];
      if (prevStatus && prevStatus !== req.status && prevStatus === "PENDING") {
        const typeLabel = req.type.replaceAll("_", " ");
        const emoji = req.status === "APPROVED" || req.status === "COMPLETED" ? "✅" : "❌";
        const text = `${emoji} ${typeLabel} — ${req.status}`;
        addToast(text, "request");
        console.log(`[Participant] Request ${req.request_id}: ${typeLabel} → ${req.status}`);
        // Clear the "Waiting for Umpire..." message when request is resolved
        setActionMsg(null);
      }
      prevRequestStatusRef.current[req.request_id] = req.status;
    }
  }, [myRequests, team, addToast]);

  const getErrorText = (err: Record<string, unknown>, fallback: string) => {
    const resp = err?.response as Record<string, unknown> | undefined;
    const d = (resp?.data as Record<string, unknown>)?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return (d[0] as Record<string, string>)?.msg || fallback;
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
        message: actionMessage.trim() || null,
      });
      setActionMsg({ text: `${type.replaceAll("_", " ")} request sent! Waiting for Umpire...`, type: "success" });
      setActionMessage("");
      console.log(`[Participant] Sent ${type} request for team ${team.name}`);
      // Refresh team data so wallet/runs update immediately
      await refreshTeam();
    } catch (err: unknown) {
      setActionMsg({ text: getErrorText(err as Record<string, unknown>, "Request failed."), type: "error" });
    } finally {
      setLoadingAction(null);
    }
  };

  const urgencyColor = secondsLeft < 300 ? "text-[#ff1744]" : secondsLeft < 600 ? "text-[#ffd600]" : "text-[#00e676]";

  // Derive the display name for the current phase — prefer custom name, fallback to label map
  const currentPhaseName = eventState?.phase_name
    || (eventState ? PHASE_LABELS[eventState.current_phase] || eventState.current_phase : "Waiting...");

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-8">
      {/* Floating Toast Notifications — score/wallet/request changes */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const bgColor = toast.type === "runs"
            ? (toast.delta && toast.delta >= 0 ? "bg-[#00e676]/15 border-[#00e676]/40 text-[#00e676]" : "bg-[#ff1744]/15 border-[#ff1744]/40 text-[#ff1744]")
            : toast.type === "wallet"
            ? (toast.delta && toast.delta >= 0 ? "bg-[#ffd600]/15 border-[#ffd600]/40 text-[#ffd600]" : "bg-[#ff1744]/15 border-[#ff1744]/40 text-[#ff1744]")
            : "bg-[#2979ff]/15 border-[#2979ff]/40 text-[#2979ff]";

          const icon = toast.type === "runs" ? "🏏" : toast.type === "wallet" ? "💰" : "📋";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto ${bgColor} border rounded-xl px-4 py-3 text-sm font-bold shadow-lg backdrop-blur-sm animate-slide-in-right flex items-center gap-2 min-w-[250px]`}
            >
              <span className="text-lg">{icon}</span>
              <span className="flex-1">{toast.text}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="opacity-60 hover:opacity-100 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

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
              {currentTeam?.wallet_balance ?? "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">pts remaining</div>
          </div>
          <div className="glass rounded-2xl p-5 text-center card-hover">
            <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Total Runs</div>
            <div className="text-5xl font-black text-[#00e676] text-glow-green">
              {currentTeam?.total_runs ?? "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">scored</div>
          </div>
        </div>

        {/* The Paddle — Action Requests */}
        <div className="glass rounded-2xl p-6">
          <h2 className="text-sm font-bold text-white mb-1">🏏 The Paddle</h2>
          <p className="text-xs text-slate-500 mb-4">Raise a request to your Umpire</p>

          {actionMsg && (
            <div className={`mb-4 rounded-xl px-4 py-3 text-xs flex items-center justify-between ${
              actionMsg.type === "success"
                ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]"
                : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
            }`}>
              <span>{actionMsg.text}</span>
              <button onClick={() => setActionMsg(null)} className="ml-3 opacity-60 hover:opacity-100 font-bold">&times;</button>
            </div>
          )}

          {/* Message to Umpire */}
          <div className="mb-4">
            <textarea
              id="action-message-input"
              value={actionMessage}
              onChange={(e) => setActionMessage(e.target.value)}
              placeholder="Add a message for the umpire (optional)..."
              maxLength={500}
              rows={2}
              className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-[#2979ff]/50 transition-all resize-none"
            />
            {actionMessage.length > 0 && (
              <div className="text-right text-[10px] text-slate-500 mt-1">{actionMessage.length}/500</div>
            )}
          </div>

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
                      <span className="text-xs font-medium text-white">{req.type.replaceAll("_", " ")}</span>
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
