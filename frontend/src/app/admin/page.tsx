"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useEventTimer } from "@/hooks/useEventTimer";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

const PHASES = ["PRE_MATCH", "POWERPLAY_1", "POWERPLAY_2", "POWERPLAY_3", "POWERPLAY_4", "SUPER_OVER", "ENDED"];

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function AdminDashboard() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [newPhase, setNewPhase] = useState("POWERPLAY_1");
  const [newPhaseName, setNewPhaseName] = useState("");
  const [duration, setDuration] = useState("30");
  const [newTeamName, setNewTeamName] = useState("");
  const [umpires, setUmpires] = useState<any[]>([]);
  const [selectedUmpireId, setSelectedUmpireId] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [walletAdjust, setWalletAdjust] = useState<Record<string, string>>({});
  
  // Provisioning State
  const [provEmail, setProvEmail] = useState("");
  const [provRole, setProvRole] = useState("ADMIN");
  
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { eventState, secondsLeft, isActive, isTimeout } = useEventTimer(selectedEvent?.event_id || "");

  useEffect(() => {
    if (userProfile && !["ADMIN", "SUPER_ADMIN"].includes(userProfile.role)) {
      router.replace("/");
    }
    setMounted(true);
  }, [userProfile, router]);

  useEffect(() => {
    const load = async () => {
      if (!userProfile) return;
      try {
        const [evRes, tmRes, usRes] = await Promise.all([
          api.get("/api/events/"),
          api.get("/api/teams/"),
          api.get("/api/users/")
        ]);
        setEvents(evRes.data);
        setTeams(tmRes.data);
        setUmpires(usRes.data.filter((u: any) => u.role === "UMPIRE"));
        if (evRes.data.length > 0 && !selectedEvent) setSelectedEvent(evRes.data[0]);
      } catch {}
    };
    load();
  }, [userProfile]);

  const liveEvents = useLiveEvents(events);
  const liveTeams = useLiveTeams(selectedEvent?.event_id?.toLowerCase() || "", teams);
  const eventTeams = liveTeams.filter((t: any) => 
    t.event_id?.toLowerCase() === selectedEvent?.event_id?.toLowerCase()
  );

  const showMsg = (text: string, type: "success" | "error", durationMs = 4000) => {
    setMsg({ text, type });
    if (durationMs > 0) {
      setTimeout(() => setMsg(null), durationMs);
    }
  };

  const getErrorText = (err: any, fallback: string) => {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d[0]?.msg || fallback;
    return fallback;
  };

  const handlePhaseChange = async () => {
    if (!selectedEvent) return;
    setLoading(true);
    try {
      const res = await api.patch(`/api/events/${selectedEvent.event_id}/phase`, {
        phase: newPhase,
        phase_name: newPhaseName || null,
        duration_minutes: parseInt(duration) || null,
      });
      setSelectedEvent(res.data);
      showMsg(`Phase updated to ${newPhaseName || newPhase}`, "success");
    } catch (err: any) {
      showMsg(getErrorText(err, "Phase update failed."), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventName) return;
    setLoading(true);
    try {
      const res = await api.post("/api/events/", {
        name: newEventName,
        org_id: userProfile?.org_id,
      });
      setEvents((prev) => [...prev, res.data]);
      setSelectedEvent(res.data);
      setNewEventName("");
      showMsg("Event created!", "success");
    } catch (err: any) {
      showMsg(getErrorText(err, "Failed to create event."), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName || !selectedEvent) return;
    setLoading(true);
    try {
      const res = await api.post("/api/teams/", {
        event_id: selectedEvent.event_id,
        name: newTeamName,
        umpire_id: selectedUmpireId || undefined,
      });
      setTeams((prev) => [...prev, res.data]);
      setNewTeamName("");
      showMsg(`Team created! Invite Code: ${res.data.invite_code}`, "success");
    } catch (err: any) {
      showMsg(getErrorText(err, "Failed to create team."), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionUser = async () => {
    if (!provEmail) return;
    setLoading(true);
    try {
      const res = await api.post("/api/users/assign-role", {
        email: provEmail.toLowerCase(),
        role: provRole,
      });
      const tempPw = res.data?.temporary_password;
      
      // Instantly update the umpire dropdown if an umpire was created
      if (provRole === "UMPIRE") {
        setUmpires(prev => [...prev, res.data]);
      }
      
      setProvEmail("");
      if (tempPw) {
        // Keep credential banner visible for 2 minutes so user can copy
        showMsg(`Granted ${provRole} to ${provEmail}!  |  Email: ${res.data.email}  |  Password: ${tempPw}`, "success", 0);
      } else {
        showMsg(`Successfully granted ${provRole} to ${provEmail}!`, "success");
      }
    } catch (err: any) {
      showMsg(getErrorText(err, "Provisioning failed."), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleWalletSet = async (teamId: string, amount: string, reason = "Admin wallet allocation") => {
    if (!amount) return;
    setLoading(true);
    try {
      await api.patch(`/api/teams/${teamId}/wallet`, { amount: parseInt(amount), reason });
      const res = await api.get("/api/teams/");
      setTeams(res.data);
      setWalletAdjust((prev) => ({ ...prev, [teamId]: "" }));
      showMsg("Wallet updated!", "success");
    } catch (err: any) {
      showMsg(getErrorText(err, "Wallet update failed."), "error");
    } finally {
      setLoading(false);
    }
  };

  const urgencyColor = secondsLeft < 300 ? "text-[#ff1744]" : secondsLeft < 600 ? "text-[#ffd600]" : "text-[#00e676]";

  // Derive the display name for the current phase
  const currentPhaseName = eventState?.phase_name || eventState?.current_phase || selectedEvent?.current_phase;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-10">
      {/* Header */}
      <header className="glass border-b border-[#2a2a3a] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏟</span>
          <div>
            <h1 className="font-bold text-white">Admin Control Center</h1>
            <p className="text-xs text-slate-500">{userProfile?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isTimeout ? (
            <div className="flex items-center gap-2 glass rounded-full px-4 py-1.5 border border-[#ff1744]/40 animate-pulse">
              <span className="text-sm">🚨</span>
              <span className="text-sm font-bold text-[#ff1744]">TIMEOUT — Power Play Ended</span>
            </div>
          ) : isActive ? (
            <div className="flex items-center gap-2 glass rounded-full px-4 py-1.5">
              <span className="w-2 h-2 rounded-full bg-[#00e676] pulse-green" />
              <span className="text-xs text-slate-400 font-medium mr-1">{currentPhaseName}</span>
              <span className={`text-sm font-mono font-black ${urgencyColor}`}>{formatTime(secondsLeft)}</span>
            </div>
          ) : null}
          <button onClick={logout} className="text-xs text-slate-400 hover:text-[#ff1744] transition-colors">Sign Out</button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 ${
            msg.type === "success" ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]" : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"
          }`}>
            <span className="flex-1 select-all">{msg.text}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { navigator.clipboard.writeText(msg.text); }}
                className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-all"
                title="Copy to clipboard"
              >
                Copy
              </button>
              <button
                onClick={() => setMsg(null)}
                className="text-xs hover:opacity-70 transition-all font-bold text-lg leading-none"
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column — Master Control */}
          <div className="lg:col-span-1 space-y-4">
            {/* Event Selector / Creator */}
            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Events</h2>
              <select
                value={selectedEvent?.event_id || ""}
                onChange={(e) => setSelectedEvent(liveEvents.find((ev: any) => ev.event_id === e.target.value))}
                className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none mb-3"
              >
                {liveEvents.map((ev: any) => (
                  <option key={ev.event_id} value={ev.event_id}>{ev.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  placeholder="New event name..."
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50"
                />
                <button onClick={handleCreateEvent} disabled={loading} className="bg-[#2979ff] hover:bg-[#1565c0] text-white text-xs font-bold px-3 py-2 rounded-xl transition-all">
                  +
                </button>
              </div>
            </div>

            {/* Master Timer (Phase Engine) */}
            <div className="glass rounded-2xl p-5 glow-green">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Match Engine</h2>
              {selectedEvent && (
                <div className="text-xs text-[#00e676] mb-3 font-medium">
                  Current: {currentPhaseName}
                </div>
              )}

              {/* Timeout Banner inside Match Engine */}
              {isTimeout && (
                <div className="mb-3 rounded-xl px-4 py-3 bg-[#ff1744]/10 border border-[#ff1744]/30 text-center animate-pulse">
                  <div className="text-lg font-black text-[#ff1744]">🚨 TIMEOUT</div>
                  <div className="text-xs text-[#ff1744]/80 mt-0.5">Power Play Ended</div>
                </div>
              )}

              <div className="space-y-2">
                <select
                  value={newPhase}
                  onChange={(e) => setNewPhase(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none"
                >
                  {PHASES.map((p) => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Phase name (e.g. Complete UI)"
                  value={newPhaseName}
                  onChange={(e) => setNewPhaseName(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00e676]/50"
                />
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    placeholder="Duration (mins)"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00e676]/50"
                  />
                  <span className="text-xs text-slate-500">min</span>
                </div>
                <button
                  id="start-phase-btn"
                  onClick={handlePhaseChange}
                  disabled={loading || !selectedEvent}
                  className="w-full bg-[#00e676] hover:bg-[#00c853] disabled:opacity-50 text-black font-black py-2.5 rounded-xl transition-all text-sm pulse-green"
                >
                  🚀 Start Power Play
                </button>
              </div>
            </div>

            {/* Create Team */}
            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Add Team</h2>
              <div className="space-y-2">
                <input
                  placeholder="Team name..."
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50"
                />
                <div className="flex gap-2">
                  <select
                    value={selectedUmpireId}
                    onChange={(e) => setSelectedUmpireId(e.target.value)}
                    className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-slate-400 outline-none focus:border-[#00e676]/50"
                  >
                    <option value="">No Umpire (Assign Later)</option>
                    {umpires.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.email} {u.display_name ? `(${u.display_name})` : ""}</option>
                    ))}
                  </select>
                  <button onClick={handleCreateTeam} disabled={loading} className="bg-[#00e676] hover:bg-[#00c853] text-black text-xs font-bold px-4 rounded-xl transition-all h-[34px]">
                    Create
                  </button>
                </div>
              </div>
            </div>

            {/* Super Admin Panel */}
            {userProfile?.role === "SUPER_ADMIN" && (
              <div className="glass rounded-2xl p-5 border border-[#d500f9]/30">
                <h2 className="text-xs font-bold text-[#d500f9] uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#d500f9] animate-pulse" />
                  Grant Roles
                </h2>
                <div className="space-y-3">
                  <input
                    type="email"
                    placeholder="User's Firebase Email"
                    value={provEmail}
                    onChange={(e) => setProvEmail(e.target.value)}
                    className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#d500f9]/50"
                  />
                  <div className="flex gap-2">
                    <select
                      value={provRole}
                      onChange={(e) => setProvRole(e.target.value)}
                      className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#d500f9]/50 cursor-pointer"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="UMPIRE">Umpire</option>
                    </select>
                    <button 
                      onClick={handleProvisionUser} 
                      disabled={loading || !provEmail} 
                      className="bg-[#d500f9] hover:bg-[#aa00ff] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                    >
                      Grant
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    *If the user doesn't have an account yet, one will be created automatically with a temporary password.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Global Leaderboard + Wallet Management */}
          <div className="lg:col-span-2 space-y-4">
            {/* Live Leaderboard */}
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white">🏆 Live Leaderboard</h2>
                <span className="text-xs text-slate-500">{selectedEvent?.name}</span>
              </div>
              <div className="space-y-2">
                {[...eventTeams]
                  .sort((a, b) => b.total_runs - a.total_runs)
                  .map((team, idx) => (
                    <div key={team.team_id} className="flex items-center gap-4 bg-[#0a0a0f] rounded-xl p-3 border border-[#2a2a3a]">
                      <div className={`text-lg font-black w-8 text-center ${idx === 0 ? "text-[#ffd600]" : idx === 1 ? "text-slate-300" : idx === 2 ? "text-orange-400" : "text-slate-600"}`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-white text-sm">{team.name}</div>
                        <div className="text-xs text-slate-500">Code: <span className="font-mono text-[#00e676]">{team.invite_code}</span></div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-400">Runs</div>
                        <div className="text-xl font-black text-[#00e676]">{team.total_runs}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-400">Wallet</div>
                        <div className="text-xl font-black text-[#ffd600]">{team.wallet_balance}</div>
                      </div>

                      {/* Wallet Quick Adjust */}
                      <div className="flex gap-1 items-center">
                        <input
                          type="number"
                          placeholder="±pts"
                          value={walletAdjust[team.team_id] || ""}
                          onChange={(e) => setWalletAdjust((prev) => ({ ...prev, [team.team_id]: e.target.value }))}
                          className="w-16 bg-[#111118] border border-[#2a2a3a] rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#ffd600]/50"
                        />
                        <button
                          onClick={() => handleWalletSet(team.team_id, walletAdjust[team.team_id])}
                          disabled={loading}
                          className="bg-[#ffd600]/10 border border-[#ffd600]/30 text-[#ffd600] text-xs font-bold px-2 py-1 rounded-lg hover:bg-[#ffd600]/20 transition-all"
                        >
                          Add / Sub
                        </button>
                      </div>
                    </div>
                  ))}
                {eventTeams.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">No teams yet. Create one above!</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
