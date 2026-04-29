"use client";
import { useState } from "react";
import { useAdminRequests } from "@/hooks/useAdminRequests";
import type { Team } from "@/types";
import api from "@/lib/api";

export function IncomingRequests({ eventId, teams, showMsg }: { eventId: string, teams: Team[], showMsg: (t: string, type: "success" | "error") => void }) {
  const requests = useAdminRequests(eventId);
  const [resolving, setResolving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const handleResolve = async (requestId: string, approved: boolean) => {
    if (!notes[requestId]?.trim()) { showMsg("Admin notes are required before approving/rejecting.", "error"); return; }
    setResolving(requestId);
    try {
      await api.patch(`/api/requests/${requestId}/admin-resolve`, {
        approved,
        notes: notes[requestId] || "",
      });
      showMsg(`Request ${approved ? "approved" : "rejected"}.`, "success");
      setNotes(prev => ({ ...prev, [requestId]: "" }));
    } catch (err: unknown) {
      const e = err as any;
      const msgText = e.response?.data?.detail || "Failed to resolve request.";
      showMsg(msgText, "error");
    } finally {
      setResolving(null);
    }
  };

  if (!eventId) return null;

  return (
    <div className="glass rounded-2xl p-5 border border-[#ab47bc]/30">
      <h2 className="text-sm font-bold text-[#ab47bc] mb-4">🔔 Incoming Requests ({requests.length})</h2>
      {requests.length === 0 ? (
        <div className="text-center py-4 text-slate-500 text-sm">No pending requests from umpires.</div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const team = teams.find(t => t.team_id === req.team_id);
            const teamName = team ? team.name : "Unknown Team";
            const deduction = req.umpire_deduction_amount || 0;
            const actionLabel = req.type.replace("_", " ");

            return (
              <div key={req.request_id} className="bg-[#0a0a0f] rounded-xl p-4 border border-[#2a2a3a]">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-white text-sm">Team: {teamName}</div>
                    <div className="text-xs text-slate-400">Action: {actionLabel}</div>
                  </div>
                  <div className="text-xs font-bold text-[#ff1744] bg-[#ff1744]/10 px-2 py-1 rounded">
                    Penalty: -{deduction} pts
                  </div>
                </div>
                
                <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-2 text-xs text-slate-300 mb-3">
                  <span className="font-bold text-[#ab47bc]">Umpire/Participant says:</span> &quot;{req.message}&quot;
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Admin Notes (Sent to participant)..."
                    value={notes[req.request_id] || ""}
                    onChange={(e) => setNotes(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#ab47bc]/50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolve(req.request_id, true)}
                      disabled={resolving === req.request_id}
                      className="flex-1 bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] text-xs font-bold py-2 rounded-lg hover:bg-[#00e676]/20 disabled:opacity-50"
                    >
                      ✓ Approve Penalty
                    </button>
                    <button
                      onClick={() => handleResolve(req.request_id, false)}
                      disabled={resolving === req.request_id}
                      className="flex-1 bg-[#ff1744]/10 border border-[#ff1744]/30 text-[#ff1744] text-xs font-bold py-2 rounded-lg hover:bg-[#ff1744]/20 disabled:opacity-50"
                    >
                      ✗ Reject Penalty
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
