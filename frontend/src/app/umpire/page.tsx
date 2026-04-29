"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useActionRequests } from "@/hooks/useActionRequests";
import { useEventTimer } from "@/hooks/useEventTimer";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { useTeamTimers } from "@/hooks/useTeamTimers";
import { RequestHistorySection } from "@/components/admin/RequestHistory";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import type { Team, ActionRequestUpdate } from "@/types";

const PHASE_LABELS: Record<string, string> = {
  PRE_MATCH: "Pre-Match", POWERPLAY_1: "Powerplay 1", POWERPLAY_2: "Powerplay 2",
  POWERPLAY_3: "Powerplay 3", POWERPLAY_4: "Powerplay 4", SUPER_OVER: "Super Over", ENDED: "Match Ended",
};

const ACTION_META: Record<string, { label: string; icon: string; color: string }> = {
  DRS: { label: "DRS", icon: "🔍", color: "#2979ff" },
  STRATEGIC_TIMEOUT: { label: "Timeout", icon: "⏱", color: "#ffd600" },
  RETENTION: { label: "Retention", icon: "🔒", color: "#ab47bc" },
  QUICK_SINGLE: { label: "Quick Single", icon: "⚡", color: "#ff5722" },
};

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
  // Retention forwarding state
  const [retentionAmounts, setRetentionAmounts] = useState<Record<string, string>>({});
  const [retentionNotes, setRetentionNotes] = useState<Record<string, string>>({});
  // Quick Single completion state
  const [qsRunsInput, setQsRunsInput] = useState<Record<string, string>>({});
  const [qsNotes, setQsNotes] = useState<Record<string, string>>({});
  // Resolve notes
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});

  const { eventState, secondsLeft, isActive, isTimeout } = useEventTimer(eventId);
  const liveRequests = useActionRequests(eventId);
  const pendingRequests = liveRequests.filter((r) => r.status === "PENDING");
  const approvedQS = liveRequests.filter((r) => r.type === "QUICK_SINGLE" && (r.status === "APPROVED" || r.status === "TIMER_EXPIRED"));

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
    } catch { /* handled */ }
  }, [userProfile]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const getErrorText = (err: Record<string, unknown>, fallback: string) => {
    const resp = err?.response as Record<string, unknown> | undefined;
    const d = (resp?.data as Record<string, unknown>)?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return (d[0] as Record<string, string>)?.msg || fallback;
    return fallback;
  };

  const showMsg = (text: string, type: "success" | "error") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 5000);
  };

  // Score submit
  const handleScoreSubmit = async (teamId: string) => {
    const data = runs[teamId];
    if (!data || !data.amount || !data.reason) return;
    const amount = parseInt(data.amount);
    setScoring(teamId);
    try {
      await api.post("/api/ledger/runs", { team_id: teamId, amount, reason: data.reason, event_id: eventId });
      setRuns((prev) => ({ ...prev, [teamId]: { amount: "", reason: "" } }));
      const sign = amount >= 0 ? "+" : "";
      showMsg(`${sign}${amount} runs → ${liveTeams.find(t => t.team_id === teamId)?.name}`, "success");
    } catch (err: unknown) {
      showMsg(getErrorText(err as Record<string, unknown>, "Score update failed."), "error");
    } finally { setScoring(null); }
  };

  // Approve/Reject
  const handleResolve = async (requestId: string, outcome: string) => {
    if (!resolveNotes[requestId]?.trim()) { showMsg("Message is required before approving/rejecting.", "error"); return; }
    setResolving(requestId);
    try {
      await api.patch(`/api/requests/${requestId}/resolve`, { outcome, notes: resolveNotes[requestId] || "" });
      showMsg(`Request ${outcome.toLowerCase()} successfully.`, "success");
      setResolveNotes(prev => ({ ...prev, [requestId]: "" }));
    } catch (err: unknown) {
      showMsg(getErrorText(err as Record<string, unknown>, "Failed to resolve."), "error");
    } finally { setResolving(null); }
  };

  // Forward Retention to Admin
  const handleForwardRetention = async (requestId: string) => {
    const amount = parseInt(retentionAmounts[requestId] || "0");
    if (!amount || amount <= 0) { showMsg("Enter a valid deduction amount.", "error"); return; }
    if (!retentionNotes[requestId]?.trim()) { showMsg("Justification message is required.", "error"); return; }
    setResolving(requestId);
    try {
      await api.patch(`/api/requests/${requestId}/forward-to-admin`, {
        deduction_amount: amount,
        notes: retentionNotes[requestId] || "",
      });
      showMsg(`Retention forwarded to Admin (${amount} wallet pts).`, "success");
    } catch (err: unknown) {
      showMsg(getErrorText(err as Record<string, unknown>, "Failed to forward."), "error");
    } finally { setResolving(null); }
  };

  // Quick Single timer complete
  const handleQSComplete = async (requestId: string, completed: boolean) => {
    if (!qsNotes[requestId]?.trim()) { showMsg("Notes are required for Quick Single verdict.", "error"); return; }
    setResolving(requestId);
    try {
      await api.patch(`/api/requests/${requestId}/timer-complete`, {
        task_completed: completed,
        runs_awarded: completed ? parseInt(qsRunsInput[requestId] || "0") : 0,
        notes: qsNotes[requestId] || "",
      });
      showMsg(completed ? "Quick Single success! Runs awarded." : "Quick Single failed. Forwarded to Admin.", completed ? "success" : "error");
    } catch (err: unknown) {
      showMsg(getErrorText(err as Record<string, unknown>, "Failed."), "error");
    } finally { setResolving(null); }
  };

  const currentPhaseName = eventState?.phase_name || (eventState ? PHASE_LABELS[eventState.current_phase] || eventState.current_phase : "—");

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
        <button onClick={logout} className="text-xs text-slate-400 hover:text-[#ff1744] transition-colors">Sign Out</button>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* ═══ EVENT TIMER ═══ */}
        <div className="glass rounded-2xl p-6 text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Event Timer</div>
          {isTimeout ? (
            <>
              <div className="text-xs text-[#ff1744] uppercase tracking-widest mb-2 font-bold">{currentPhaseName}</div>
              <div className="text-5xl font-black text-[#ff1744] tracking-tight animate-pulse">🚨 TIMEOUT</div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">{currentPhaseName}</div>
              <div className={`text-5xl font-mono font-black tracking-tight ${
                secondsLeft < 300 ? "text-[#ff1744]" : secondsLeft < 600 ? "text-[#ffd600]" : "text-[#00e676]"
              } transition-colors`}>
                {isActive ? formatTime(secondsLeft) : "-- : --"}
              </div>
              <div className="mt-2">
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#00e676]"><span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" /> LIVE</span>
                ) : (
                  <span className="text-xs text-slate-500">{eventState ? "Waiting for Admin..." : "No event loaded"}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ═══ STATUS ═══ */}
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between transition-all ${
            msg.type === "success" ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]" : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
          }`}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="ml-3 opacity-60 hover:opacity-100 font-bold">&times;</button>
          </div>
        )}

        {/* ═══ PENDING REQUESTS ═══ */}
        {pendingRequests.length > 0 && (
          <div className="glass rounded-2xl p-6 border border-[#ffd600]/20">
            <h2 className="text-sm font-bold text-[#ffd600] mb-4">🔔 Pending Requests ({pendingRequests.length})</h2>
            <div className="space-y-3">
              {pendingRequests.map((req) => {
                const teamName = teams.find((t) => t.team_id?.toLowerCase() === req.team_id)?.name || "Unknown";
                const meta = ACTION_META[req.type] || { label: req.type, icon: "📋", color: "#fff" };
                const isRetention = req.type === "RETENTION";

                return (
                  <div key={req.request_id} className="bg-[#0a0a0f] rounded-xl p-4 border border-[#2a2a3a]">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-bold text-white text-sm">{meta.icon} {meta.label}</span>
                        <p className="text-xs text-slate-400">{teamName} • {new Date(req.created_at).toLocaleTimeString()}</p>
                      </div>
                      <span className="text-[10px] bg-[#ffd600]/10 text-[#ffd600] border border-[#ffd600]/20 rounded-full px-2 py-0.5 font-bold">PENDING</span>
                    </div>
                    {/* Participant's message */}
                    {req.message && (
                      <div className="mb-3 bg-[#1a1a2e] rounded-lg px-3 py-2 text-xs text-slate-300 border border-[#2a2a3a]">
                        💬 &ldquo;{req.message}&rdquo;
                      </div>
                    )}
                    {/* Umpire notes input */}
                    <input
                      type="text" placeholder="Your notes (required)..."
                      value={resolveNotes[req.request_id] || ""}
                      onChange={(e) => setResolveNotes(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                      className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50 mb-2"
                    />

                    {isRetention ? (
                      /* Retention: enter deduction amount and forward to admin */
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number" placeholder="Wallet pts to deduct"
                            value={retentionAmounts[req.request_id] || ""}
                            onChange={(e) => setRetentionAmounts(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                            className="w-40 bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#ab47bc]/50"
                          />
                          <input
                            type="text" placeholder="Justification..."
                            value={retentionNotes[req.request_id] || ""}
                            onChange={(e) => setRetentionNotes(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                            className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#ab47bc]/50"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleForwardRetention(req.request_id)}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#ab47bc]/10 border border-[#ab47bc]/30 text-[#ab47bc] text-xs font-bold py-2 rounded-lg hover:bg-[#ab47bc]/20 transition-all disabled:opacity-50"
                          >📋 Forward to Admin</button>
                          <button
                            onClick={() => handleResolve(req.request_id, "REJECTED")}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2 rounded-lg hover:bg-[#ff1744]/20 transition-all disabled:opacity-50"
                          >✗ Reject</button>
                        </div>
                      </div>
                    ) : (
                      /* DRS / Timeout / Quick Single: standard approve/reject */
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResolve(req.request_id, "APPROVED")}
                          disabled={resolving === req.request_id}
                          className="flex-1 bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] text-xs font-bold py-2 rounded-lg hover:bg-[#00e676]/20 transition-all disabled:opacity-50"
                        >✓ Approve</button>
                        <button
                          onClick={() => handleResolve(req.request_id, "REJECTED")}
                          disabled={resolving === req.request_id}
                          className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2 rounded-lg hover:bg-[#ff1744]/20 transition-all disabled:opacity-50"
                        >✗ Reject</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ QUICK SINGLE TIMER COMPLETION ═══ */}
        {approvedQS.length > 0 && (
          <div className="glass rounded-2xl p-6 border border-[#ff5722]/20">
            <h2 className="text-sm font-bold text-[#ff5722] mb-4">⚡ Quick Single — Awaiting Verdict</h2>
            <div className="space-y-3">
              {approvedQS.map((req) => {
                const teamName = teams.find((t) => t.team_id?.toLowerCase() === req.team_id)?.name || "Unknown";
                const timerEnd = req.action_timer_end ? new Date(req.action_timer_end).getTime() : 0;
                const remaining = Math.max(0, Math.floor((timerEnd - Date.now()) / 1000));
                const timerDone = timerEnd > 0 && remaining === 0;

                return (
                  <div key={req.request_id} className="bg-[#0a0a0f] rounded-xl p-4 border border-[#2a2a3a]">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-bold text-white text-sm">⚡ {teamName}</span>
                        <p className="text-xs text-slate-400">Task: &ldquo;{req.message}&rdquo;</p>
                      </div>
                      <div className={`text-lg font-mono font-bold ${timerDone ? "text-[#ff1744]" : "text-[#ff5722]"}`}>
                        {timerDone ? "00:00" : remaining > 0 ? formatTime(remaining) : "--:--"}
                      </div>
                    </div>

                    {timerDone && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-[#2a2a3a]">
                        <p className="text-xs text-[#ffd600] font-bold">Did the team complete the task?</p>
                        <div className="flex gap-2">
                          <input
                            type="number" placeholder="Runs to award"
                            value={qsRunsInput[req.request_id] || ""}
                            onChange={(e) => setQsRunsInput(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                            className="w-32 bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-white outline-none"
                          />
                          <input
                            type="text" placeholder="Notes..."
                            value={qsNotes[req.request_id] || ""}
                            onChange={(e) => setQsNotes(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                            className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-white outline-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleQSComplete(req.request_id, true)}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] text-xs font-bold py-2 rounded-lg hover:bg-[#00e676]/20 disabled:opacity-50"
                          >✓ Yes — Award Runs</button>
                          <button
                            onClick={() => handleQSComplete(req.request_id, false)}
                            disabled={resolving === req.request_id}
                            className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2 rounded-lg hover:bg-[#ff1744]/20 disabled:opacity-50"
                          >✗ No — Penalize (-10 wallet)</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ TEAMS & SCORING ═══ */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white">Teams</h2>
          {liveTeams.map((team) => (
            <TeamCard
              key={team.team_id}
              team={team}
              eventId={eventId}
              runs={runs}
              setRuns={setRuns}
              scoring={scoring}
              handleScoreSubmit={handleScoreSubmit}
            />
          ))}
        </div>

        {/* ═══ REQUEST HISTORY ═══ */}
        <RequestHistorySection teams={liveTeams} />
      </div>
    </div>
  );
}

/* ── Team Card with action timers ────────────────────────────────── */
function TeamCard({ team, eventId, runs, setRuns, scoring, handleScoreSubmit }: {
  team: Team; eventId: string;
  runs: Record<string, { amount: string; reason: string }>;
  setRuns: React.Dispatch<React.SetStateAction<Record<string, { amount: string; reason: string }>>>;
  scoring: string | null; handleScoreSubmit: (id: string) => void;
}) {
  const { countdowns } = useTeamTimers(eventId?.toLowerCase() || "", team.team_id?.toLowerCase() || "");

  const timerTypes = [
    { key: "DRS", label: "DRS", icon: "🔍", color: "#2979ff" },
    { key: "STRATEGIC_TIMEOUT", label: "Timeout", icon: "⏱", color: "#ffd600" },
    { key: "RETENTION", label: "Retain", icon: "🔒", color: "#ab47bc" },
    { key: "QUICK_SINGLE", label: "Quick", icon: "⚡", color: "#ff5722" },
  ];

  return (
    <div className="glass rounded-2xl p-6 card-hover">
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

      {/* Action Timers */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {timerTypes.map(tt => {
          const secs = countdowns[tt.key] || 0;
          const active = secs > 0;
          return (
            <div key={tt.key} className="text-center bg-[#0a0a0f] rounded-lg py-2 px-1 border border-[#2a2a3a]">
              <div className="text-xs">{tt.icon}</div>
              <div className={`text-sm font-mono font-bold ${active ? "" : "text-slate-600"}`} style={active ? { color: tt.color } : {}}>
                {active ? formatTime(secs) : "--:--"}
              </div>
              <div className="text-[9px] text-slate-500">{tt.label}</div>
            </div>
          );
        })}
      </div>

      {/* Score Entry */}
      <div className="flex gap-2">
        <input
          type="text" placeholder="+45 or -5"
          value={runs[team.team_id]?.amount || ""}
          onChange={(e) => setRuns((prev) => ({ ...prev, [team.team_id]: { ...prev[team.team_id], amount: e.target.value } }))}
          className="w-28 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00e676]/50"
        />
        <input
          type="text" placeholder="Reason (e.g. PP1 Evaluation)"
          value={runs[team.team_id]?.reason || ""}
          onChange={(e) => setRuns((prev) => ({ ...prev, [team.team_id]: { ...prev[team.team_id], reason: e.target.value } }))}
          className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00e676]/50"
        />
        <button
          onClick={() => handleScoreSubmit(team.team_id)}
          disabled={scoring === team.team_id}
          className="bg-[#00e676] hover:bg-[#00c853] disabled:opacity-50 text-black text-xs font-bold px-4 rounded-xl transition-all"
        >{scoring === team.team_id ? "..." : "Update"}</button>
      </div>
    </div>
  );
}
