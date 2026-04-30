"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import type { Team, ActionRequestUpdate } from "@/types";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: "bg-[#ffd600]/10 border-[#ffd600]/20", text: "text-[#ffd600]", label: "⏳ Pending" },
  APPROVED: { bg: "bg-[#00e676]/10 border-[#00e676]/20", text: "text-[#00e676]", label: "✅ Approved" },
  REJECTED: { bg: "bg-[#ff1744]/10 border-[#ff1744]/20", text: "text-[#ff1744]", label: "❌ Rejected" },
  COMPLETED: { bg: "bg-[#00e676]/10 border-[#00e676]/20", text: "text-[#00e676]", label: "✅ Completed" },
  FAILED: { bg: "bg-[#ff1744]/10 border-[#ff1744]/20", text: "text-[#ff1744]", label: "💀 Failed" },
  TIMER_EXPIRED: { bg: "bg-[#ff5722]/10 border-[#ff5722]/20", text: "text-[#ff5722]", label: "⏰ Timer Expired" },
  FORWARDED_TO_ADMIN: { bg: "bg-[#ab47bc]/10 border-[#ab47bc]/20", text: "text-[#ab47bc]", label: "📋 Forwarded" },
  IN_PROGRESS: { bg: "bg-[#2979ff]/10 border-[#2979ff]/20", text: "text-[#2979ff]", label: "🔄 In Progress" },
};

const ACTION_ICONS: Record<string, string> = {
  DRS: "🔍",
  STRATEGIC_TIMEOUT: "⏱",
  RETENTION: "🔒",
  QUICK_SINGLE: "⚡",
};

function TeamRequestRow({ team }: { team: Team }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [requests, setRequests] = useState<ActionRequestUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isExpanded && requests.length === 0) {
      setLoading(true);
      api.get(`/api/requests/team/${team.team_id}`)
        .then(res => setRequests(res.data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isExpanded, team.team_id, requests.length]);

  // Re-fetch when expanded (to get latest)
  const refresh = () => {
    api.get(`/api/requests/team/${team.team_id}`)
      .then(res => setRequests(res.data))
      .catch(() => {});
  };

  return (
    <div className="bg-[#0a0a0f] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <button
        onClick={() => { setIsExpanded(!isExpanded); if (!isExpanded) refresh(); }}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
          <span className="font-bold text-white text-sm">{team.name}</span>
          {requests.filter(r => r.status === "PENDING").length > 0 && (
            <span className="bg-[#ffd600]/10 text-[#ffd600] text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-[#ffd600]/20">
              {requests.filter(r => r.status === "PENDING").length} pending
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">{isExpanded ? "Hide" : "View"} Requests</div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[#2a2a3a] bg-[#111118]">
          {loading ? (
            <div className="text-center py-4 text-xs text-slate-500 animate-pulse">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">No requests yet.</div>
          ) : (
            <div className="space-y-2 mt-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {requests.map(req => {
                const style = STATUS_STYLES[req.status] || STATUS_STYLES.PENDING;
                const icon = ACTION_ICONS[req.type] || "📋";
                const actionLabel = req.type.replaceAll("_", " ");

                return (
                  <div key={req.request_id} className={`border rounded-lg p-3 ${style.bg}`}>
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-1.5">
                        <span>{icon}</span>
                        <span className="font-bold text-white text-xs">{actionLabel}</span>
                      </div>
                      <span className={`text-[10px] font-bold ${style.text}`}>{style.label}</span>
                    </div>

                    {/* Message from participant */}
                    {req.message && (
                      <div className="text-xs text-slate-300 mb-1">
                        💬 &quot;{req.message}&quot;
                      </div>
                    )}

                    {/* Admin status if forwarded */}
                    {req.forwarded_to_admin && (
                      <div className="text-[10px] mt-1">
                        <span className="text-[#ab47bc]">Admin: </span>
                        <span className={req.admin_status === "APPROVED" ? "text-[#00e676]" : req.admin_status === "REJECTED" ? "text-[#ff1744]" : "text-slate-400"}>
                          {req.admin_status || "Pending review"}
                        </span>
                        {req.admin_notes && <span className="text-slate-500"> — &quot;{req.admin_notes}&quot;</span>}
                        {req.umpire_deduction_amount && (
                          <span className="text-[#ff1744]"> (-{req.umpire_deduction_amount} wallet)</span>
                        )}
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="flex gap-3 mt-1.5 text-[10px] text-slate-500">
                      <span>Sent: {new Date(req.created_at).toLocaleString()}</span>
                      {req.resolved_at && <span>Resolved: {new Date(req.resolved_at).toLocaleString()}</span>}
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

export function RequestHistorySection({ teams }: { teams: Team[] }) {
  const [search, setSearch] = useState("");

  const filteredTeams = teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white">📋 Request History</h2>
      </div>

      {teams.length > 3 && (
        <input
          type="text"
          placeholder="Search team..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50 mb-4"
        />
      )}

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredTeams.map(team => (
          <TeamRequestRow key={team.team_id} team={team} />
        ))}
        {filteredTeams.length === 0 && (
          <div className="text-center py-4 text-slate-500 text-sm">No teams found.</div>
        )}
      </div>
    </div>
  );
}
