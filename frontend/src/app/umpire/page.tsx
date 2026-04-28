"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useActionRequests } from "@/hooks/useActionRequests";
import { useEventTimer } from "@/hooks/useEventTimer";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import type { Team } from "@/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function UmpireDashboard() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [runs, setRuns] = useState<Record<string, { amount: string; reason: string }>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [scoring, setScoring] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedHistoryTeams, setExpandedHistoryTeams] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((requestId: string) => {
    setExpandedRequests((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
    // If user manually toggles individual cards, turn off "expand all"
    setAllExpanded(false);
  }, []);

  const { eventState, secondsLeft, isActive, isTimeout } = useEventTimer(eventId);
  const liveRequests = useActionRequests(eventId);
  const pendingRequests = liveRequests.filter((r) => r.status === "PENDING");
  const resolvedRequests = liveRequests.filter((r) => r.status !== "PENDING");
  
  // Only maintain teams that the umpire was initially assigned to
  const liveTeamsUnfiltered = useLiveTeams(eventId?.toLowerCase() || "", teams);
  const liveTeams = liveTeamsUnfiltered.filter((t) => 
    teams.some(og => og.team_id?.toLowerCase() === t.team_id?.toLowerCase())
  );

  useEffect(() => {
    if (userProfile && !["UMPIRE", "ADMIN", "SUPER_ADMIN"].includes(userProfile.role)) {
      router.replace("/");
    }
  }, [userProfile, router]);

  const fetchTeams = useCallback(async () => {
    if (!userProfile) return;
    try {
      const res = await api.get("/api/teams/umpire/assigned");
      setTeams(res.data);
      if (res.data.length > 0) setEventId(res.data[0].event_id);
    } catch { /* handled by auth interceptor */ }
  }, [userProfile]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);



  const getErrorText = (err: Record<string, unknown>, fallback: string) => {
    const resp = err?.response as Record<string, unknown> | undefined;
    const d = (resp?.data as Record<string, unknown>)?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return (d[0] as Record<string, string>)?.msg || fallback;
    return fallback;
  };

  const handleScoreSubmit = async (teamId: string) => {
    const data = runs[teamId];
    if (!data || !data.amount || !data.reason) return;
    const teamName = liveTeams.find(t => t.team_id === teamId)?.name || "Team";
    const amount = parseInt(data.amount);
    setScoring(teamId);
    setMsg(null);
    try {
      await api.post("/api/ledger/runs", {
        team_id: teamId,
        amount: amount,
        reason: data.reason,
        event_id: eventId,
      });
      // the useLiveTeams hook will automatically pull down the updated score 
      setRuns((prev) => ({ ...prev, [teamId]: { amount: "", reason: "" } }));
      const sign = amount >= 0 ? "+" : "";
      setMsg({ text: `${sign}${amount} runs → ${teamName} (${data.reason})`, type: "success" });
      console.log(`[Umpire] Score updated: ${sign}${amount} runs → ${teamName} | Reason: ${data.reason}`);
    } catch (err: unknown) {
      setMsg({ text: getErrorText(err as Record<string, unknown>, "Score update failed."), type: "error" });
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
      console.log(`[Umpire] Request ${requestId} resolved: ${outcome}`);
    } catch (err: unknown) {
      setMsg({ text: getErrorText(err as Record<string, unknown>, "Resolution failed."), type: "error" });
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
            <div className={`text-5xl sm:text-7xl font-mono font-black tracking-tight ${
              secondsLeft < 300 ? "text-[#ff1744]" : secondsLeft < 600 ? "text-[#ffd600]" : "text-[#00e676]"
            } transition-colors`}>
              {isActive ? formatTime(secondsLeft) : "-- : --"}
            </div>
            <div className="mt-2">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#00e676]">
                  <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  {eventState ? "Waiting for Admin to start phase..." : "No event loaded"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Auto-dismissing notification */}
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between transition-all ${
            msg.type === "success" ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]" : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
          }`}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="ml-3 opacity-60 hover:opacity-100 font-bold">&times;</button>
          </div>
        )}

        {/* Pending Action Requests */}
        {pendingRequests.length > 0 && (
          <div className="glass rounded-2xl p-6 border border-[#ffd600]/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#ffd600]">
                🔔 Pending Requests ({pendingRequests.length})
              </h2>
              <button
                onClick={() => setAllExpanded((prev) => !prev)}
                className="text-[10px] text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-lg border border-[#2a2a3a] hover:border-[#ffd600]/30"
              >
                {allExpanded ? "▲ Collapse All" : "▼ Expand All"}
              </button>
            </div>
            <div className="space-y-3">
              {pendingRequests.map((req) => {
                const teamName = teams.find((t) => t.team_id === req.team_id)?.name || "Unknown Team";
                const isExpanded = allExpanded || expandedRequests.has(req.request_id);
                const actionEmoji: Record<string, string> = {
                  DRS: "🔍",
                  STRATEGIC_TIMEOUT: "⏱",
                  RETENTION: "🔒",
                  QUICK_SINGLE: "⚡",
                };
                const actionColor: Record<string, string> = {
                  DRS: "#2979ff",
                  STRATEGIC_TIMEOUT: "#ffd600",
                  RETENTION: "#d500f9",
                  QUICK_SINGLE: "#ff1744",
                };
                const color = actionColor[req.type] || "#ffd600";

                return (
                  <div
                    key={req.request_id}
                    className="bg-[#0a0a0f] rounded-xl border border-[#2a2a3a] overflow-hidden transition-all duration-300"
                    style={{ borderLeftColor: color, borderLeftWidth: "3px" }}
                  >
                    {/* Collapsed Header — always visible, clickable */}
                    <button
                      onClick={() => toggleExpand(req.request_id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#12121a] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg flex-shrink-0">{actionEmoji[req.type] || "📋"}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{req.type.replaceAll("_", " ")}</span>
                            {req.message && (
                              <span className="text-[10px] bg-[#2979ff]/15 text-[#2979ff] px-1.5 py-0.5 rounded-full font-medium">
                                💬 msg
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">
                            {teamName} • {new Date(req.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] bg-[#ffd600]/10 text-[#ffd600] border border-[#ffd600]/20 rounded-full px-2 py-0.5 font-bold">
                          PENDING
                        </span>
                        <span className="text-xs text-slate-500 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                          ▼
                        </span>
                      </div>
                    </button>

                    {/* Expanded Content */}
                    <div
                      className="overflow-hidden transition-all duration-300 ease-in-out"
                      style={{ maxHeight: isExpanded ? "400px" : "0px", opacity: isExpanded ? 1 : 0 }}
                    >
                      <div className="px-4 pb-4 pt-1 border-t border-[#2a2a3a]/50 space-y-3">
                        {/* Participant Message */}
                        {req.message && (
                          <div className="bg-[#2979ff]/5 border border-[#2979ff]/15 rounded-lg px-3 py-2.5">
                            <div className="text-[10px] uppercase tracking-wider text-[#2979ff]/70 font-bold mb-1">
                              💬 Message from Team
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                              {req.message}
                            </p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleResolve(req.request_id, "APPROVED")}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] text-xs font-bold py-2.5 rounded-lg hover:bg-[#00e676]/20 transition-all disabled:opacity-50"
                          >
                            ✓ Approve
                          </button>
                          {(req.type === "DRS" || req.type === "QUICK_SINGLE") && (
                            <>
                              <button
                                onClick={() => handleResolve(req.request_id, "COMPLETED", true)}
                                disabled={resolving === req.request_id}
                                className="flex-1 bg-[#2979ff]/10 border border-[#2979ff]/30 text-[#2979ff] text-xs font-bold py-2.5 rounded-lg hover:bg-[#2979ff]/20 transition-all disabled:opacity-50"
                              >
                                +Runs (Success)
                              </button>
                              <button
                                onClick={() => handleResolve(req.request_id, "FAILED", false)}
                                disabled={resolving === req.request_id}
                                className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2.5 rounded-lg hover:bg-[#ff1744]/20 transition-all disabled:opacity-50"
                              >
                                -Runs (Fail)
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleResolve(req.request_id, "REJECTED")}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2.5 rounded-lg hover:bg-[#ff1744]/20 transition-all disabled:opacity-50"
                          >
                            ✗ Reject
                          </button>
                        </div>
                      </div>
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
          {liveTeams.map((team) => (
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
                    type="text"
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

        {/* Request History — grouped by team */}
        {resolvedRequests.length > 0 && (
          <div className="glass rounded-2xl p-6">
            <h2 className="text-sm font-bold text-white mb-4">📜 Request History</h2>
            <div className="space-y-3">
              {liveTeams.map((team) => {
                const teamHistory = resolvedRequests
                  .filter((r) => r.team_id?.toLowerCase() === team.team_id?.toLowerCase())
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                if (teamHistory.length === 0) return null;

                const isTeamExpanded = expandedHistoryTeams.has(team.team_id);

                const actionEmoji: Record<string, string> = {
                  DRS: "🔍",
                  STRATEGIC_TIMEOUT: "⏱",
                  RETENTION: "🔒",
                  QUICK_SINGLE: "⚡",
                };

                const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
                  APPROVED: { bg: "bg-[#00e676]/10", text: "text-[#00e676]", label: "✓ Approved" },
                  COMPLETED: { bg: "bg-[#00e676]/10", text: "text-[#00e676]", label: "✓ Completed" },
                  REJECTED: { bg: "bg-[#ff1744]/10", text: "text-[#ff1744]", label: "✗ Rejected" },
                  FAILED: { bg: "bg-[#ff1744]/10", text: "text-[#ff1744]", label: "✗ Failed" },
                };

                return (
                  <div key={team.team_id} className="bg-[#0a0a0f] rounded-xl border border-[#2a2a3a] overflow-hidden">
                    {/* Team Header — collapsible */}
                    <button
                      onClick={() => {
                        setExpandedHistoryTeams((prev) => {
                          const next = new Set(prev);
                          if (next.has(team.team_id)) next.delete(team.team_id);
                          else next.add(team.team_id);
                          return next;
                        });
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#12121a] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">🏏</span>
                        <div>
                          <span className="font-bold text-white text-sm">{team.name}</span>
                          <p className="text-xs text-slate-500">
                            {teamHistory.length} resolved request{teamHistory.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-[#2979ff]/10 text-[#2979ff] border border-[#2979ff]/20 rounded-full px-2 py-0.5 font-bold">
                          {teamHistory.length}
                        </span>
                        <span
                          className="text-xs text-slate-500 transition-transform duration-200"
                          style={{ transform: isTeamExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                        >
                          ▼
                        </span>
                      </div>
                    </button>

                    {/* Team History Items */}
                    <div
                      className="overflow-hidden transition-all duration-300 ease-in-out"
                      style={{ maxHeight: isTeamExpanded ? `${teamHistory.length * 100 + 20}px` : "0px", opacity: isTeamExpanded ? 1 : 0 }}
                    >
                      <div className="px-4 pb-3 space-y-1.5 border-t border-[#2a2a3a]/50">
                        {teamHistory.map((req) => {
                          const style = statusStyle[req.status] || { bg: "bg-slate-500/10", text: "text-slate-400", label: req.status };
                          return (
                            <div key={req.request_id} className="flex items-center justify-between py-2 border-b border-[#1a1a24] last:border-0">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-sm flex-shrink-0">{actionEmoji[req.type] || "📋"}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-white">{req.type.replaceAll("_", " ")}</span>
                                    {req.message && (
                                      <span className="text-[9px] text-[#2979ff]/60" title={req.message}>💬</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-slate-500">
                                      {new Date(req.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                    {req.message && (
                                      <span className="text-[10px] text-slate-600 truncate max-w-[150px]" title={req.message}>
                                        — &ldquo;{req.message}&rdquo;
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
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
