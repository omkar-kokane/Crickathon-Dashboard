"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useActionRequests } from "@/hooks/useActionRequests";
import { useEventTimer } from "@/hooks/useEventTimer";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function UmpireDashboard() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [runs, setRuns] = useState<Record<string, { amount: string; reason: string }>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [scoring, setScoring] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const { eventState, secondsLeft, isActive, isTimeout } = useEventTimer(eventId);
  const liveRequests = useActionRequests(eventId);
  const pendingRequests = liveRequests.filter((r) => r.status === "PENDING");

  useEffect(() => {
    if (userProfile && !["UMPIRE", "ADMIN", "SUPER_ADMIN"].includes(userProfile.role)) {
      router.replace("/");
    }
  }, [userProfile, router]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await api.get("/api/teams/");
        setTeams(res.data);
        if (res.data.length > 0) setEventId(res.data[0].event_id);
      } catch {}
    };
    fetchTeams();
  }, []);

  const getErrorText = (err: any, fallback: string) => {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d[0]?.msg || fallback;
    return fallback;
  };

  const handleScoreSubmit = async (teamId: string) => {
    const data = runs[teamId];
    if (!data || !data.amount || !data.reason) return;
    setScoring(teamId);
    setMsg(null);
    try {
      await api.post("/api/ledger/runs", {
        team_id: teamId,
        amount: parseInt(data.amount),
        reason: data.reason,
      });
      // Refresh team data
      const res = await api.get("/api/teams/");
      setTeams(res.data);
      setRuns((prev) => ({ ...prev, [teamId]: { amount: "", reason: "" } }));
      setMsg({ text: "Score updated successfully!", type: "success" });
    } catch (err: any) {
      setMsg({ text: getErrorText(err, "Score update failed."), type: "error" });
    } finally {
      setScoring(null);
    }
  };

  const handleResolve = async (requestId: string, outcome: string, applyReward?: boolean) => {
    setResolving(requestId);
    setMsg(null);
    try {
      await api.patch(`/api/requests/${requestId}/resolve`, {
        outcome,
        apply_reward: applyReward,
      });
      setMsg({ text: `Request ${outcome.toLowerCase()} successfully.`, type: "success" });
    } catch (err: any) {
      setMsg({ text: getErrorText(err, "Resolution failed."), type: "error" });
    } finally {
      setResolving(null);
    }
  };

  // Derive the display name for the current phase
  const currentPhaseName = eventState?.phase_name || eventState?.current_phase || "—";

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-8">
      {/* Header */}
      <header className="glass border-b border-[#2a2a3a] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🟢</span>
          <div>
            <h1 className="font-bold text-white text-sm">Umpire Panel</h1>
            <p className="text-xs text-slate-500">{userProfile?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isTimeout ? (
            <div className="flex items-center gap-2 glass rounded-full px-4 py-1.5 border border-[#ff1744]/40 animate-pulse">
              <span className="text-sm">🚨</span>
              <span className="text-xs font-bold text-[#ff1744]">TIMEOUT — Power Play Ended</span>
            </div>
          ) : isActive ? (
            <div className="hidden sm:flex items-center gap-2 glass rounded-full px-4 py-1.5">
              <span className="w-2 h-2 rounded-full bg-[#00e676] pulse-green" />
              <span className="text-xs text-slate-400 font-medium mr-1">{currentPhaseName}</span>
              <span className="text-xs font-mono font-bold text-[#00e676]">{formatTime(secondsLeft)}</span>
            </div>
          ) : null}
          <button onClick={logout} className="text-xs text-slate-400 hover:text-[#ff1744] transition-colors">Sign Out</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Timeout Banner */}
        {isTimeout && (
          <div className="rounded-2xl px-6 py-5 bg-[#ff1744]/10 border border-[#ff1744]/30 text-center animate-pulse">
            <div className="text-2xl font-black text-[#ff1744]">🚨 TIMEOUT</div>
            <div className="text-sm text-[#ff1744]/80 mt-1">Power Play Ended — {currentPhaseName}</div>
          </div>
        )}

        {msg && (
          <div className={`rounded-xl px-4 py-3 text-xs ${
            msg.type === "success" ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]" : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
          }`}>
            {msg.text}
          </div>
        )}

        {/* Pending Action Requests */}
        {pendingRequests.length > 0 && (
          <div className="glass rounded-2xl p-6 border border-[#ffd600]/20">
            <h2 className="text-sm font-bold text-[#ffd600] mb-4">
              🔔 Pending Requests ({pendingRequests.length})
            </h2>
            <div className="space-y-3">
              {pendingRequests.map((req) => {
                const teamName = teams.find((t) => t.team_id === req.team_id)?.name || "Unknown Team";
                return (
                  <div key={req.request_id} className="bg-[#0a0a0f] rounded-xl p-4 border border-[#2a2a3a]">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-bold text-white text-sm">{req.type.replace("_", " ")}</span>
                        <p className="text-xs text-slate-400">{teamName} • {new Date(req.created_at).toLocaleTimeString()}</p>
                      </div>
                      <span className="text-[10px] bg-[#ffd600]/10 text-[#ffd600] border border-[#ffd600]/20 rounded-full px-2 py-0.5 font-bold">PENDING</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleResolve(req.request_id, "APPROVED")}
                        disabled={resolving === req.request_id}
                        className="flex-1 bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] text-xs font-bold py-2 rounded-lg hover:bg-[#00e676]/20 transition-all disabled:opacity-50"
                      >
                        ✓ Approve
                      </button>
                      {(req.type === "DRS" || req.type === "QUICK_SINGLE") && (
                        <>
                          <button
                            onClick={() => handleResolve(req.request_id, "COMPLETED", true)}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#2979ff]/10 border border-[#2979ff]/30 text-[#2979ff] text-xs font-bold py-2 rounded-lg hover:bg-[#2979ff]/20 transition-all disabled:opacity-50"
                          >
                            +Runs (Success)
                          </button>
                          <button
                            onClick={() => handleResolve(req.request_id, "FAILED", false)}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2 rounded-lg hover:bg-[#ff1744]/20 transition-all disabled:opacity-50"
                          >
                            -Runs (Fail)
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleResolve(req.request_id, "REJECTED")}
                        disabled={resolving === req.request_id}
                        className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2 rounded-lg hover:bg-[#ff1744]/20 transition-all disabled:opacity-50"
                      >
                        ✗ Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Teams Scoring Panel */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white">Teams</h2>
          {teams.map((team) => (
            <div key={team.team_id} className="glass rounded-2xl p-6 card-hover">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">{team.name}</h3>
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-xs text-slate-400">Wallet</div>
                    <div className="text-lg font-black text-[#ffd600]">{team.wallet_balance}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400">Runs</div>
                    <div className="text-lg font-black text-[#00e676]">{team.total_runs}</div>
                  </div>
                </div>
              </div>

              {/* Quick Score Entry */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="+45 or -5"
                    value={runs[team.team_id]?.amount || ""}
                    onChange={(e) => setRuns((prev) => ({ ...prev, [team.team_id]: { ...prev[team.team_id], amount: e.target.value } }))}
                    className="w-28 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00e676]/50 transition-all"
                  />
                  <input
                    type="text"
                    placeholder="Reason (e.g. PP1 Evaluation)"
                    value={runs[team.team_id]?.reason || ""}
                    onChange={(e) => setRuns((prev) => ({ ...prev, [team.team_id]: { ...prev[team.team_id], reason: e.target.value } }))}
                    className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00e676]/50 transition-all"
                  />
                  <button
                    onClick={() => handleScoreSubmit(team.team_id)}
                    disabled={scoring === team.team_id}
                    className="bg-[#00e676] hover:bg-[#00c853] disabled:opacity-50 text-black text-xs font-bold px-4 rounded-xl transition-all"
                  >
                    {scoring === team.team_id ? "..." : "Update"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
