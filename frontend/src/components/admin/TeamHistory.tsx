"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import type { Team, LedgerHistoryEntry } from "@/types";

function TeamHistoryRow({ team }: { team: Team }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [history, setHistory] = useState<LedgerHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isExpanded && history.length === 0) {
      setLoading(true);
      api.get(`/api/ledger/team/${team.team_id}/history`)
        .then(res => setHistory(res.data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isExpanded, team.team_id, history.length]);

  return (
    <div className="bg-[#0a0a0f] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
          <span className="font-bold text-white text-sm">{team.name}</span>
        </div>
        <div className="text-xs text-slate-500">History</div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[#2a2a3a] bg-[#111118]">
          {loading ? (
            <div className="text-center py-4 text-xs text-slate-500 animate-pulse">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">No ledger entries found.</div>
          ) : (
            <div className="space-y-2 mt-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {history.map(entry => {
                const isCredit = entry.amount >= 0;
                const isWallet = entry.type.includes("WALLET");
                const color = isCredit ? "text-[#00e676]" : "text-[#ff1744]";
                const icon = isWallet ? "💰" : "🏏";
                
                return (
                  <div key={entry.transaction_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <span>{icon}</span>
                        <span className={color}>
                          {isCredit ? "+" : ""}{entry.amount} {isWallet ? "Wallet" : "Runs"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 mb-1 leading-snug">
                      {entry.reason}
                    </div>
                    <div className="text-[10px] text-slate-500 bg-[#1a1a2e] px-2 py-1 rounded inline-block mt-1">
                      Processed by: {entry.processed_by_email || entry.processed_by_user_id.split("-")[0]}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamHistorySection({ teams }: { teams: Team[] }) {
  const [search, setSearch] = useState("");

  const filteredTeams = teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white">📜 Team Ledger History</h2>
      </div>
      
      <input
        type="text"
        placeholder="Search team..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50 mb-4"
      />

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredTeams.map(team => (
          <TeamHistoryRow key={team.team_id} team={team} />
        ))}
        {filteredTeams.length === 0 && (
          <div className="text-center py-4 text-slate-500 text-sm">No teams found.</div>
        )}
      </div>
    </div>
  );
}
