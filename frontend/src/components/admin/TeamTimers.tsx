"use client";
import { useState } from "react";
import { useTeamTimers } from "@/hooks/useTeamTimers";
import type { Team } from "@/types";

const TIMER_TYPES = [
  { key: "DRS", label: "DRS", color: "#2979ff" },
  { key: "STRATEGIC_TIMEOUT", label: "Timeout", color: "#ffd600" },
  { key: "RETENTION", label: "Retain", color: "#ab47bc" },
  { key: "QUICK_SINGLE", label: "Quick", color: "#ff5722" },
];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function TeamTimerRow({ eventId, team, isExpanded, onToggle }: { eventId: string, team: Team, isExpanded: boolean, onToggle: () => void }) {
  const { countdowns } = useTeamTimers(eventId, team.team_id);
  
  // Check if any timer is active
  const hasActiveTimer = TIMER_TYPES.some(tt => (countdowns[tt.key] || 0) > 0);

  return (
    <div className="bg-[#0a0a0f] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <button 
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
          <span className="font-bold text-white text-sm">{team.name}</span>
          {hasActiveTimer && <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse ml-2" title="Active Timer" />}
        </div>
        <div className="text-xs text-slate-500">{isExpanded ? "Hide Timers" : "View Timers"}</div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#111118] border-t border-[#2a2a3a]">
          {TIMER_TYPES.map(tt => {
            const secs = countdowns[tt.key] || 0;
            const active = secs > 0;
            return (
              <div key={tt.key} className="text-center bg-[#0a0a0f] rounded-lg p-2 border border-[#2a2a3a]">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{tt.label}</div>
                <div className={`text-sm font-mono font-bold ${active ? "" : "text-slate-600"}`} style={active ? { color: tt.color } : {}}>
                  {active ? formatTime(secs) : "--:--"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TeamTimersSection({ eventId, teams }: { eventId: string, teams: Team[] }) {
  const [search, setSearch] = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});

  const filteredTeams = teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  if (!eventId) return null;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white">⏳ Team Action Timers</h2>
      </div>
      
      <input
        type="text"
        placeholder="Search team..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-[#0a0a0f] border border-[#2a2a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#00e676]/50 mb-4"
      />

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredTeams.map(team => (
          <TeamTimerRow
            key={team.team_id}
            eventId={eventId}
            team={team}
            isExpanded={!!expandedTeams[team.team_id]}
            onToggle={() => toggleTeam(team.team_id)}
          />
        ))}
        {filteredTeams.length === 0 && (
          <div className="text-center py-4 text-slate-500 text-sm">No teams found.</div>
        )}
      </div>
    </div>
  );
}
