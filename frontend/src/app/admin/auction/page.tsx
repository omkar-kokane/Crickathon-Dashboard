"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAuction } from "@/hooks/useAuction";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

export default function AdminAuctionPage() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();

  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [apiPlayers, setApiPlayers] = useState<any[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newBasePrice, setNewBasePrice] = useState("25");
  const [sellTeamId, setSellTeamId] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { players: livePlayers, currentPlayer, soldPlayers, unsoldPlayers, upcomingPlayers, biddingPlayer } =
    useAuction(selectedEvent?.event_id || "");
  const liveTeams = useLiveTeams(selectedEvent?.event_id?.toLowerCase() || "", teams);
  const eventTeams = liveTeams.filter(
    (t: any) => t.event_id?.toLowerCase() === selectedEvent?.event_id?.toLowerCase()
  );

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
        const [evRes, tmRes] = await Promise.all([api.get("/api/events/"), api.get("/api/teams/")]);
        setEvents(evRes.data);
        setTeams(tmRes.data);
        if (evRes.data.length > 0 && !selectedEvent) setSelectedEvent(evRes.data[0]);
      } catch {}
    };
    load();
  }, [userProfile]);

  useEffect(() => {
    if (!selectedEvent) return;
    const load = async () => {
      try {
        const res = await api.get(`/api/auction/players?event_id=${selectedEvent.event_id}`);
        setApiPlayers(res.data);
      } catch {}
    };
    load();
  }, [selectedEvent]);

  const allPlayers = livePlayers.length > 0 ? livePlayers : apiPlayers;
  const upcoming = allPlayers.filter((p: any) => p.status === "UPCOMING");
  const bidding = allPlayers.find((p: any) => p.status === "BIDDING") || null;
  const sold = allPlayers.filter((p: any) => p.status === "SOLD");
  const unsold = allPlayers.filter((p: any) => p.status === "UNSOLD");

  const showMsg = (text: string, type: "success" | "error") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 5000);
  };

  const getErr = (err: any, fallback: string) => {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d[0]?.msg || fallback;
    return fallback;
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName || !selectedEvent) return;
    setLoading(true);
    try {
      const res = await api.post("/api/auction/players", {
        event_id: selectedEvent.event_id,
        name: newPlayerName,
        base_price: parseInt(newBasePrice) || 25,
        display_order: allPlayers.length,
      });
      setApiPlayers((prev) => [...prev, res.data]);
      setNewPlayerName("");
      setNewBasePrice("25");
      showMsg(`Added ${res.data.name} to auction pool`, "success");
    } catch (err: any) {
      showMsg(getErr(err, "Failed to add player"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartBidding = async (playerId: string) => {
    setLoading(true);
    try {
      await api.patch(`/api/auction/players/${playerId}/start-bidding`);
      setSellAmount("");
      setSellTeamId("");
      showMsg("Player is now on the auction block!", "success");
    } catch (err: any) {
      showMsg(getErr(err, "Failed to start bidding"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!bidding || !sellTeamId || !sellAmount) return;
    setLoading(true);
    try {
      await api.post(`/api/auction/players/${bidding.player_id}/sell`, {
        team_id: sellTeamId,
        amount: parseInt(sellAmount),
      });
      const tmRes = await api.get("/api/teams/");
      setTeams(tmRes.data);
      setSellAmount("");
      setSellTeamId("");
      showMsg(`🔨 SOLD! ${bidding.name} for ${sellAmount} pts`, "success");
    } catch (err: any) {
      showMsg(getErr(err, "Sale failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsold = async () => {
    if (!bidding) return;
    setLoading(true);
    try {
      await api.post(`/api/auction/players/${bidding.player_id}/unsold`);
      showMsg(`${bidding.name} marked as UNSOLD`, "success");
    } catch (err: any) {
      showMsg(getErr(err, "Failed to mark unsold"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (playerId: string, playerName: string) => {
    setLoading(true);
    try {
      await api.delete(`/api/auction/players/${playerId}`);
      setApiPlayers((prev) => prev.filter((p) => p.player_id !== playerId));
      showMsg(`Removed ${playerName}`, "success");
    } catch (err: any) {
      showMsg(getErr(err, "Failed to delete"), "error");
    } finally {
      setLoading(false);
    }
  };

  const getTeamName = (teamId: string | null | undefined) => {
    if (!teamId) return "—";
    const t = eventTeams.find((t: any) => t.team_id?.toLowerCase() === teamId?.toLowerCase());
    return t?.name || "Unknown";
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-10">
      <header className="glass border-b border-[#2a2a3a] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏏</span>
          <div>
            <h1 className="font-bold text-white">Auction Control Center</h1>
            <p className="text-xs text-slate-500">{userProfile?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="text-xs text-slate-400 hover:text-[#00e676] transition-colors bg-[#111118] border border-[#2a2a3a] px-3 py-1.5 rounded-lg">← Dashboard</button>
          <button onClick={() => window.open(`/auction?event_id=${selectedEvent?.event_id}`, "_blank")} className="text-xs text-[#00e676] hover:text-white transition-colors bg-[#00e676]/10 border border-[#00e676]/30 px-3 py-1.5 rounded-lg">📺 Spectator View</button>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-[#ff1744] transition-colors">Sign Out</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.type === "success" ? "bg-[#00e676]/10 border border-[#00e676]/20 text-[#00e676]" : "bg-[#ff1744]/10 border border-[#ff1744]/20 text-[#ff1744]"}`}>{msg.text}</div>
        )}

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Event</label>
            <select value={selectedEvent?.event_id || ""} onChange={(e) => setSelectedEvent(events.find((ev: any) => ev.event_id === e.target.value))} className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-sm text-white outline-none">
              {events.map((ev: any) => (<option key={ev.event_id} value={ev.event_id}>{ev.name}</option>))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Player Queue */}
          <div className="lg:col-span-3 space-y-4">
            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Add Star Player</h2>
              <div className="space-y-2">
                <input placeholder="Player name..." value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()} className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50" />
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-xs text-slate-500">Base:</span>
                    <input type="number" value={newBasePrice} onChange={(e) => setNewBasePrice(e.target.value)} className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#ffd600]/50 w-16" />
                  </div>
                  <button onClick={handleAddPlayer} disabled={loading || !newPlayerName} className="bg-[#2979ff] hover:bg-[#1565c0] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">+ Add</button>
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Upcoming ({upcoming.length})</h2>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {upcoming.map((p: any) => (
                  <div key={p.player_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-3 flex items-center justify-between group card-hover">
                    <div>
                      <div className="font-semibold text-white text-sm">{p.name}</div>
                      <div className="text-xs text-slate-500">Base: <span className="text-[#ffd600] font-mono">{p.base_price}</span> pts</div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleStartBidding(p.player_id)} disabled={loading || !!bidding} className="bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] text-[10px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-[#00e676]/20 transition-all disabled:opacity-30" title={bidding ? "Finish current bidding first" : "Start bidding"}>▶ Bid</button>
                      <button onClick={() => handleDelete(p.player_id, p.name)} disabled={loading} className="text-[#ff1744]/60 hover:text-[#ff1744] text-xs transition-all opacity-0 group-hover:opacity-100" title="Remove">✕</button>
                    </div>
                  </div>
                ))}
                {upcoming.length === 0 && <div className="text-center py-6 text-slate-600 text-xs">No upcoming players. Add some above!</div>}
              </div>
            </div>

            {unsold.length > 0 && (
              <div className="glass rounded-2xl p-5 border border-[#ff1744]/20">
                <h2 className="text-xs font-bold text-[#ff1744] uppercase tracking-widest mb-3">Unsold ({unsold.length})</h2>
                <div className="space-y-2">
                  {unsold.map((p: any) => (
                    <div key={p.player_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white text-sm">{p.name}</div>
                        <div className="text-xs text-slate-500">Base: <span className="text-[#ffd600] font-mono">{p.base_price}</span></div>
                      </div>
                      <button onClick={() => handleStartBidding(p.player_id)} disabled={loading || !!bidding} className="bg-[#ffd600]/10 border border-[#ffd600]/30 text-[#ffd600] text-[10px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-[#ffd600]/20 transition-all disabled:opacity-30">🔄 Re-auction</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CENTER: Auction Block */}
          <div className="lg:col-span-5 space-y-4">
            <div className={`glass rounded-2xl p-6 min-h-[420px] flex flex-col ${bidding ? "glow-green border-[#00e676]/30" : "border-[#2a2a3a]"}`}>
              {bidding ? (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 bg-[#00e676]/10 border border-[#00e676]/30 rounded-full px-4 py-1 mb-4">
                      <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
                      <span className="text-xs font-bold text-[#00e676] uppercase tracking-widest">Live Bidding</span>
                    </div>
                    <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#00e676]/20 to-[#2979ff]/20 border-2 border-[#00e676]/40 flex items-center justify-center">
                      <span className="text-4xl">🏏</span>
                    </div>
                    <h2 className="text-3xl font-black text-white mb-1">{bidding.name}</h2>
                    <div className="text-sm text-slate-400 mb-2">Star Player</div>
                    <div className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-4 mb-4 text-center">
                      <p className="text-xs text-slate-600 italic">Player info coming soon...</p>
                    </div>
                    <div className="inline-flex items-center gap-2 bg-[#ffd600]/10 border border-[#ffd600]/30 rounded-xl px-4 py-2">
                      <span className="text-xs text-slate-400">Base Price</span>
                      <span className="text-2xl font-black text-[#ffd600]">{bidding.base_price}</span>
                      <span className="text-xs text-slate-400">pts</span>
                    </div>
                  </div>
                  <div className="mt-auto space-y-3">
                    <div className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-4 space-y-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Record Final Bid</h3>
                      <select value={sellTeamId} onChange={(e) => setSellTeamId(e.target.value)} className="w-full bg-[#111118] border border-[#2a2a3a] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#00e676]/50">
                        <option value="">Select winning team...</option>
                        {eventTeams.map((t: any) => (<option key={t.team_id} value={t.team_id}>{t.name} — 💰 {t.wallet_balance} pts</option>))}
                      </select>
                      <div className="flex gap-2">
                        <input type="number" placeholder="Final bid amount..." value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} step={5} min={bidding.base_price} className="flex-1 bg-[#111118] border border-[#2a2a3a] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ffd600]/50" />
                        <span className="self-center text-xs text-slate-500">pts</span>
                      </div>
                      {sellAmount && parseInt(sellAmount) % 5 !== 0 && <p className="text-[10px] text-[#ff1744]">Amount must be in increments of 5</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={handleSell} disabled={loading || !sellTeamId || !sellAmount || parseInt(sellAmount) % 5 !== 0} className="bg-[#00e676] hover:bg-[#00c853] disabled:opacity-40 text-black font-black py-3 rounded-xl transition-all text-sm pulse-green">🔨 SOLD!</button>
                      <button onClick={handleUnsold} disabled={loading} className="bg-[#ff1744]/10 border border-[#ff1744]/30 hover:bg-[#ff1744]/20 text-[#ff1744] font-bold py-3 rounded-xl transition-all text-sm">❌ UNSOLD</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-full bg-[#111118] border border-[#2a2a3a] flex items-center justify-center mb-4">
                    <span className="text-3xl opacity-40">🏏</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-500 mb-1">No Active Bidding</h3>
                  <p className="text-xs text-slate-600 max-w-xs">Select a player from the queue and click &quot;▶ Bid&quot; to start the auction</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Team Purses + Sold Log */}
          <div className="lg:col-span-4 space-y-4">
            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">💰 Team Purses</h2>
              <div className="space-y-2">
                {eventTeams.sort((a: any, b: any) => b.wallet_balance - a.wallet_balance).map((team: any) => {
                  const teamSold = sold.filter((p: any) => p.sold_to_team_id?.toLowerCase() === team.team_id?.toLowerCase());
                  return (
                    <div key={team.team_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-3 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-white text-sm">{team.name}</div>
                        <div className="text-[10px] text-slate-500">{teamSold.length} player{teamSold.length !== 1 ? "s" : ""} bought</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-[#ffd600]">{team.wallet_balance}</div>
                        <div className="text-[10px] text-slate-500">pts left</div>
                      </div>
                    </div>
                  );
                })}
                {eventTeams.length === 0 && <div className="text-center py-4 text-slate-600 text-xs">No teams found for this event</div>}
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">✅ Sold ({sold.length})</h2>
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {sold.map((p: any) => (
                  <div key={p.player_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white text-sm">{p.name}</div>
                      <div className="text-xs text-slate-500">→ <span className="text-[#00e676]">{getTeamName(p.sold_to_team_id)}</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-[#ffd600]">{p.sold_price}</div>
                      <div className="text-[10px] text-slate-500">pts</div>
                    </div>
                  </div>
                ))}
                {sold.length === 0 && <div className="text-center py-6 text-slate-600 text-xs">No players sold yet</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
