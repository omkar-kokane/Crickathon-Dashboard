"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useActionRequests } from "@/hooks/useActionRequests";
import { useEventTimer } from "@/hooks/useEventTimer";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { useTeamTimers } from "@/hooks/useTeamTimers";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { MyTeamHistory } from "@/components/participant/MyTeamHistory";
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
  { type: "DRS", label: "🔍 DRS", description: "Doubt Resolution Session", color: "#2979ff", timerMin: 10 },
  { type: "STRATEGIC_TIMEOUT", label: "⏱ Timeout", description: "Strategic Timeout", color: "#ffd600", timerMin: 5 },
  { type: "RETENTION", label: "🔒 Retention", description: "Retain a technology", color: "#ab47bc", timerMin: 10 },
  { type: "QUICK_SINGLE", label: "⚡ Quick Single", description: "High-risk gamble", color: "#ff5722", timerMin: 10 },
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
  const [toasts, setToasts] = useState<ScoreToast[]>([]);
  const toastIdRef = useRef(0);
  const [messageInputs, setMessageInputs] = useState<Record<string, string>>({});
  const [activeInput, setActiveInput] = useState<string | null>(null);

  const prevRunsRef = useRef<number | null>(null);
  const prevWalletRef = useRef<number | null>(null);
  const prevRequestStatusRef = useRef<Record<string, string>>({});

  const { eventState, secondsLeft, isActive, isTimeout } = useEventTimer(eventId?.toLowerCase() || "");
  const liveRequests = useActionRequests(eventId?.toLowerCase() || "");
  const liveTeams = useLiveTeams(eventId?.toLowerCase() || "", team ? [team] : []);
  const currentTeam = liveTeams.find((t) => t.team_id?.toLowerCase() === team?.team_id?.toLowerCase()) || team;
  const { countdowns } = useTeamTimers(eventId?.toLowerCase() || "", team?.team_id?.toLowerCase() || "");

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
    } catch { /* handled */ }
  }, []);

  useEffect(() => {
    if (userProfile) refreshTeam();
  }, [userProfile, refreshTeam]);

  const addToast = useCallback((text: string, type: ScoreToast["type"], delta?: number) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, text, type, delta }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 5000);
  }, []);

  // Detect runs/wallet changes
  useEffect(() => {
    if (!currentTeam) return;
    const currentRuns = currentTeam.total_runs;
    const currentWallet = currentTeam.wallet_balance;

    if (prevRunsRef.current !== null && currentRuns !== prevRunsRef.current) {
      const delta = currentRuns - prevRunsRef.current;
      const sign = delta >= 0 ? "+" : "";
      const reason = currentTeam.last_reason;
      const reasonSuffix = reason ? ` (${reason})` : "";
      addToast(`${sign}${delta} runs${reasonSuffix}  →  Total: ${currentRuns}`, "runs", delta);
    }
    if (prevWalletRef.current !== null && currentWallet !== prevWalletRef.current) {
      const delta = currentWallet - prevWalletRef.current;
      const sign = delta >= 0 ? "+" : "";
      addToast(`${sign}${delta} wallet pts  →  Balance: ${currentWallet}`, "wallet", delta);
    }
    prevRunsRef.current = currentRuns;
    prevWalletRef.current = currentWallet;
  }, [currentTeam?.total_runs, currentTeam?.wallet_balance, currentTeam, addToast]);

  // Detect request status changes
  const myRequests = liveRequests.filter((r: ActionRequestUpdate) => r.team_id === team?.team_id?.toLowerCase());
  useEffect(() => {
    if (!team) return;
    for (const req of myRequests) {
      const prevStatus = prevRequestStatusRef.current[req.request_id];
      if (prevStatus && prevStatus !== req.status && prevStatus === "PENDING") {
        const typeLabel = req.type.replaceAll("_", " ");
        const emoji = ["APPROVED", "COMPLETED"].includes(req.status) ? "✅" : req.status === "FORWARDED_TO_ADMIN" ? "📋" : "❌";
        addToast(`${emoji} ${typeLabel} — ${req.status.replaceAll("_", " ")}`, "request");
        setActionMsg(null);
      }
      // Admin resolution notification
      if (prevStatus && req.admin_status && prevStatus !== req.status) {
        const emoji = req.admin_status === "APPROVED" ? "⚠️" : "✅";
        const adminMsg = req.admin_notes ? `: ${req.admin_notes}` : "";
        addToast(`${emoji} Admin ${req.admin_status.toLowerCase()} ${req.type.replaceAll("_", " ")}${adminMsg}`, "request");
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
    const msg = messageInputs[type]?.trim();
    if (!msg) {
      setActionMsg({ text: "Please enter a message before sending the request.", type: "error" });
      return;
    }
    setLoadingAction(type);
    setActionMsg(null);
    try {
      await api.post("/api/requests/", { team_id: team.team_id, event_id: team.event_id, type, message: msg });
      setActionMsg({ text: `${type.replaceAll("_", " ")} request sent! Waiting for Umpire...`, type: "success" });
      setMessageInputs(prev => ({ ...prev, [type]: "" }));
      setActiveInput(null);
      await refreshTeam();
    } catch (err: unknown) {
      setActionMsg({ text: getErrorText(err as Record<string, unknown>, "Request failed."), type: "error" });
    } finally {
      setLoadingAction(null);
    }
  };

  const urgencyColor = secondsLeft < 300 ? "text-[#ff1744]" : secondsLeft < 600 ? "text-[#ffd600]" : "text-[#00e676]";
  const currentPhaseName = eventState?.phase_name || (eventState ? PHASE_LABELS[eventState.current_phase] || eventState.current_phase : "Waiting...");

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-8">
      {/* Floating Toasts */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const bgColor = toast.type === "runs"
            ? (toast.delta && toast.delta >= 0 ? "bg-[#00e676]/15 border-[#00e676]/40 text-[#00e676]" : "bg-[#ff1744]/15 border-[#ff1744]/40 text-[#ff1744]")
            : toast.type === "wallet"
            ? (toast.delta && toast.delta >= 0 ? "bg-[#ffd600]/15 border-[#ffd600]/40 text-[#ffd600]" : "bg-[#ff1744]/15 border-[#ff1744]/40 text-[#ff1744]")
            : "bg-[#2979ff]/15 border-[#2979ff]/40 text-[#2979ff]";
          const icon = toast.type === "runs" ? "🏏" : toast.type === "wallet" ? "💰" : "📋";
          return (
            <div key={toast.id} className={`pointer-events-auto ${bgColor} border rounded-xl px-4 py-3 text-sm font-bold shadow-lg backdrop-blur-sm animate-slide-in-right flex items-center gap-2 min-w-[250px]`}>
              <span className="text-lg">{icon}</span>
              <span className="flex-1">{toast.text}</span>
              <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="opacity-60 hover:opacity-100 text-xs font-bold">✕</button>
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
          <button onClick={logout} className="text-xs text-slate-400 hover:text-[#ff1744] transition-colors">Sign Out</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* ═══ EVENT TIMER ═══ */}
        <div className="glass rounded-2xl p-6 text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Event Timer</div>
          {isTimeout ? (
            <>
              <div className="text-xs text-[#ff1744] uppercase tracking-widest mb-2 font-bold">{currentPhaseName}</div>
              <div className="text-5xl sm:text-7xl font-black text-[#ff1744] tracking-tight animate-pulse">🚨 TIMEOUT</div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">{currentPhaseName}</div>
              <div className={`text-5xl sm:text-7xl font-mono font-black tracking-tight ${urgencyColor} transition-colors`}>
                {isActive ? formatTime(secondsLeft) : "-- : --"}
              </div>
              <div className="mt-2">
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#00e676]">
                    <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" /> LIVE
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">{eventState ? "Waiting for Admin..." : "No event loaded"}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ═══ ACTION TIMERS (4-grid) ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ACTION_TYPES.map((at) => {
            const secs = countdowns[at.type] || 0;
            const timerActive = secs > 0;
            return (
              <div key={at.type} className={`glass rounded-xl p-4 text-center border ${timerActive ? `border-[${at.color}]/40` : "border-[#2a2a3a]"} transition-all`}>
                <div className="text-lg mb-1">{at.label.split(" ")[0]}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">{at.label.split(" ").slice(1).join(" ") || at.type.replaceAll("_", " ")}</div>
                <div className={`text-2xl font-mono font-black ${timerActive ? `text-[${at.color}]` : "text-slate-600"}`}>
                  {timerActive ? formatTime(secs) : "--:--"}
                </div>
                {timerActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] mt-1" style={{ color: at.color }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: at.color }} /> ACTIVE
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ═══ SCOREBOARD ═══ */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-6 text-center">
            <div className="text-xs text-slate-400 mb-1">Total Runs</div>
            <div className="text-4xl font-black text-[#00e676]">{currentTeam?.total_runs ?? 0}</div>
          </div>
          <div className="glass rounded-2xl p-6 text-center">
            <div className="text-xs text-slate-400 mb-1">Wallet Balance</div>
            <div className="text-4xl font-black text-[#ffd600]">{currentTeam?.wallet_balance ?? 0}</div>
          </div>
        </div>

        {/* ═══ STATUS MESSAGE ═══ */}
        {actionMsg && (
          <div className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between ${
            actionMsg.type === "success" ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]" : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
          }`}>
            <span>{actionMsg.text}</span>
            <button onClick={() => setActionMsg(null)} className="ml-3 opacity-60 hover:opacity-100 font-bold">&times;</button>
          </div>
        )}

        {/* ═══ ACTION BUTTONS ═══ */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-white">The Paddle</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTION_TYPES.map((action) => (
              <div key={action.type} className="glass rounded-xl overflow-hidden">
                <button
                  onClick={() => {
                    if (activeInput === action.type) {
                      handleActionRequest(action.type);
                    } else {
                      setActiveInput(action.type);
                    }
                  }}
                  disabled={loadingAction === action.type}
                  className="w-full px-4 py-4 text-left hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">{action.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{action.description}</div>
                    </div>
                    {loadingAction === action.type ? (
                      <span className="text-xs text-slate-400 animate-pulse">Sending...</span>
                    ) : activeInput === action.type ? (
                      <span className="text-xs font-bold" style={{ color: action.color }}>Send →</span>
                    ) : (
                      <span className="text-xs text-slate-500">Tap</span>
                    )}
                  </div>
                </button>
                {activeInput === action.type && (
                  <div className="px-4 pb-3 flex gap-2">
                    <input
                      type="text"
                      placeholder={action.type === "RETENTION" ? "Tech name (e.g. React.js)" : "Describe your request..."}
                      value={messageInputs[action.type] || ""}
                      onChange={(e) => setMessageInputs(prev => ({ ...prev, [action.type]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && handleActionRequest(action.type)}
                      className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50"
                      autoFocus
                    />
                    <button onClick={() => setActiveInput(null)} className="text-xs text-slate-500 hover:text-white">Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ═══ TRANSACTION HISTORY ═══ */}
        {team && <MyTeamHistory teamId={team.team_id} />}
      </div>
    </div>
  );
}
