"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuction } from "@/hooks/useAuction";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";

interface TeamInfo {
  team_id: string;
  name: string;
  wallet_balance: number;
  total_runs: number;
}

function AuctionSpectatorInner() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("event_id") || "";

  const { players, currentPlayer, soldPlayers, unsoldPlayers, upcomingPlayers, biddingPlayer } = useAuction(eventId);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [soldAnimation, setSoldAnimation] = useState(false);
  const [lastSoldPlayer, setLastSoldPlayer] = useState<any>(null);

  useEffect(() => {
    if (!eventId) return;
    const teamsRef = ref(rtdb, `/teams/${eventId.toLowerCase()}`);
    const unsub = onValue(teamsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setTeams(Object.values(data));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (currentPlayer?.status === "SOLD" && !soldAnimation) {
      setSoldAnimation(true);
      setLastSoldPlayer(currentPlayer);
      timeoutId = setTimeout(() => setSoldAnimation(false), 4000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [currentPlayer, soldAnimation]);

  const getTeamName = (teamId: string | null | undefined) => {
    if (!teamId) return "—";
    const t = teams.find((t) => t.team_id === teamId);
    return t?.name || "Unknown";
  };

  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Auction Spectator View</h1>
          <p className="text-slate-400 text-sm">Missing <code className="text-[#ffd600]">event_id</code> query parameter.</p>
          <p className="text-slate-500 text-xs mt-2">Usage: <code className="text-[#00e676]">/auction?event_id=your-event-id</code></p>
        </div>
      </div>
    );
  }

  const activeBidding = biddingPlayer || (soldAnimation ? lastSoldPlayer : null);

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-[0.08]" style={{ background: activeBidding ? "radial-gradient(ellipse, #00e676, transparent)" : "radial-gradient(ellipse, #2979ff, transparent)" }} />
        <div className="absolute bottom-0 right-0 w-[600px] h-[300px] rounded-full opacity-[0.05]" style={{ background: "radial-gradient(ellipse, #ffd600, transparent)" }} />
      </div>

      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏏</span>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">CRICKATHON AUCTION</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Live</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[#111118] border border-[#2a2a3a] rounded-full px-4 py-1.5">
          <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
          <span className="text-xs text-slate-300 font-medium">{soldPlayers.length} sold · {upcomingPlayers.length} remaining</span>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-160px)]">
          <div className="lg:col-span-8 flex items-center justify-center">
            {activeBidding ? (
              <div className="w-full max-w-2xl">
                {soldAnimation && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="animate-bounce">
                      <div className="text-8xl font-black text-[#00e676] drop-shadow-2xl" style={{ textShadow: "0 0 60px rgba(0,230,118,0.5), 0 0 120px rgba(0,230,118,0.3)" }}>SOLD!</div>
                      <div className="text-center mt-4">
                        <div className="text-3xl font-bold text-white">{lastSoldPlayer?.name}</div>
                        <div className="text-xl text-[#ffd600] font-black mt-2">{lastSoldPlayer?.sold_price} pts → {getTeamName(lastSoldPlayer?.sold_to_team_id)}</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className={`glass rounded-3xl p-8 text-center transition-all duration-500 ${biddingPlayer ? "glow-green border-[#00e676]/40" : soldAnimation ? "glow-yellow" : ""}`}>
                  <div className="mb-6">
                    {biddingPlayer && (
                      <span className="inline-flex items-center gap-2 bg-[#00e676]/10 border border-[#00e676]/30 rounded-full px-5 py-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#00e676] animate-pulse" />
                        <span className="text-sm font-bold text-[#00e676] uppercase tracking-widest">Now Bidding</span>
                      </span>
                    )}
                  </div>
                  <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#00e676]/20 via-[#2979ff]/10 to-[#d500f9]/20 border-2 border-[#00e676]/30 flex items-center justify-center shadow-lg shadow-[#00e676]/10">
                    <span className="text-6xl">🏏</span>
                  </div>
                  <h2 className="text-5xl font-black text-white mb-2 tracking-tight" style={{ textShadow: "0 0 40px rgba(255,255,255,0.1)" }}>{activeBidding.name}</h2>
                  <div className="bg-[#0a0a0f]/50 border border-[#2a2a3a] rounded-2xl p-6 my-6 max-w-md mx-auto">
                    <p className="text-sm text-slate-600 italic">Player information coming soon</p>
                  </div>
                  <div className="flex items-center justify-center gap-8">
                    <div className="text-center">
                      <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Base Price</div>
                      <div className="text-3xl font-black text-[#ffd600]">{activeBidding.base_price}</div>
                    </div>
                    {activeBidding.sold_price && (
                      <>
                        <div className="w-px h-12 bg-[#2a2a3a]" />
                        <div className="text-center">
                          <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Final Bid</div>
                          <div className="text-4xl font-black text-[#00e676] text-glow-green">{activeBidding.sold_price}</div>
                        </div>
                      </>
                    )}
                  </div>
                  {activeBidding.sold_to_team_id && (
                    <div className="mt-6 inline-flex items-center gap-2 bg-[#00e676]/10 border border-[#00e676]/30 rounded-xl px-6 py-3">
                      <span className="text-sm text-slate-400">Won by</span>
                      <span className="text-lg font-black text-[#00e676]">{getTeamName(activeBidding.sold_to_team_id)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-28 h-28 mx-auto mb-6 rounded-full bg-[#111118] border border-[#2a2a3a] flex items-center justify-center">
                  <span className="text-5xl opacity-30">🏏</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-600 mb-2">Waiting for Auction</h2>
                <p className="text-slate-700 text-sm">{upcomingPlayers.length > 0 ? `${upcomingPlayers.length} players in queue` : soldPlayers.length > 0 ? "Auction Complete! 🎉" : "No players added yet"}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-4">
            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">💰 Team Purses</h2>
              <div className="space-y-2">
                {[...teams].sort((a, b) => b.wallet_balance - a.wallet_balance).map((team) => {
                  const teamBought = soldPlayers.filter((p) => p.sold_to_team_id === team.team_id);
                  return (
                    <div key={team.team_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-3 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-white text-sm">{team.name}</div>
                        <div className="text-[10px] text-slate-500">{teamBought.length} player{teamBought.length !== 1 ? "s" : ""}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-[#ffd600]">{team.wallet_balance}</div>
                        <div className="text-[10px] text-slate-500">pts</div>
                      </div>
                    </div>
                  );
                })}
                {teams.length === 0 && <div className="text-center py-4 text-slate-600 text-xs">Loading teams...</div>}
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">✅ Sold ({soldPlayers.length})</h2>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {soldPlayers.map((p) => (
                  <div key={p.player_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white text-sm">{p.name}</div>
                      <div className="text-xs text-slate-500">→ <span className="text-[#00e676]">{getTeamName(p.sold_to_team_id)}</span></div>
                    </div>
                    <div className="text-lg font-black text-[#ffd600]">{p.sold_price}</div>
                  </div>
                ))}
                {soldPlayers.length === 0 && <div className="text-center py-4 text-slate-600 text-xs">No players sold yet</div>}
              </div>
            </div>

            {unsoldPlayers.length > 0 && (
              <div className="glass rounded-2xl p-5 border border-[#ff1744]/20">
                <h2 className="text-xs font-bold text-[#ff1744] uppercase tracking-widest mb-3">Unsold ({unsoldPlayers.length})</h2>
                <div className="space-y-1">
                  {unsoldPlayers.map((p) => (<div key={p.player_id} className="text-sm text-slate-400 py-1">{p.name}</div>))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 glass border-t border-[#2a2a3a]">
        <div className="flex items-center overflow-x-auto py-3 px-6 gap-6">
          {teams.map((team) => (
            <div key={team.team_id} className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-bold text-white">{team.name}</span>
              <span className="text-sm font-mono text-[#ffd600]">{team.wallet_balance}</span>
              <span className="text-[10px] text-slate-600">pts</span>
            </div>
          ))}
        </div>
      </div>

      {soldAnimation && <div className="fixed inset-0 z-40 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(0,230,118,0.15) 0%, transparent 70%)" }} />}
    </div>
  );
}

export default function AuctionSpectatorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#00e676] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading Auction...</p>
        </div>
      </div>
    }>
      <AuctionSpectatorInner />
    </Suspense>
  );
}
