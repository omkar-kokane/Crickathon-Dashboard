"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import type { LedgerHistoryEntry } from "@/types";

export function MyTeamHistory({ teamId }: { teamId: string }) {
  const [history, setHistory] = useState<LedgerHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen && teamId && history.length === 0) {
      setLoading(true);
      api.get(`/api/ledger/team/${teamId}/history`)
        .then(res => setHistory(res.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, teamId, history.length]);

  const refresh = () => {
    if (!teamId) return;
    api.get(`/api/ledger/team/${teamId}/history`)
      .then(res => setHistory(res.data))
      .catch(() => {});
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) refresh(); }}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-all text-left"
      >
        <h2 className="text-sm font-bold text-white">📜 Transaction History</h2>
        <span className={`text-xs text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
      </button>

      {isOpen && (
        <div className="px-6 pb-4 border-t border-[#2a2a3a]">
          {loading ? (
            <div className="text-center py-4 text-xs text-slate-500 animate-pulse">Loading...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">No transactions yet.</div>
          ) : (
            <div className="space-y-2 mt-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {history.map(entry => {
                const isCredit = entry.amount >= 0;
                const isWallet = entry.type.includes("WALLET");
                const color = isCredit ? "text-[#00e676]" : "text-[#ff1744]";
                const icon = isWallet ? "💰" : "🏏";

                return (
                  <div key={entry.transaction_id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className={`font-bold text-xs flex items-center gap-1.5 ${color}`}>
                        {icon} {isCredit ? "+" : ""}{entry.amount} {isWallet ? "Wallet" : "Runs"}
                      </span>
                      <span className="text-[10px] text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-slate-400 leading-snug">{entry.reason}</div>
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
