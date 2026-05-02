"use client";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { TeamTimers, TeamTimerEntry } from "@/types";

const ACTION_TYPES = ["DRS", "STRATEGIC_TIMEOUT", "RETENTION", "QUICK_SINGLE"] as const;

/**
 * Subscribes to Firebase for team-specific action timers.
 * Path: /team_timers/{eventId}/{teamId}
 * Returns an object with countdown seconds for each action type.
 */
export function useTeamTimers(eventId: string, teamId: string) {
  const [timers, setTimers] = useState<TeamTimers>({});
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  // Subscribe to Firebase
  useEffect(() => {
    if (!eventId || !teamId || !rtdb) return;

    // Clear state immediately when switching contexts to prevent leakage
    setTimers({});
    setCountdowns({});

    const pathEid = eventId.toLowerCase();
    const pathTid = teamId.toLowerCase();
    const timerRef = ref(rtdb, `/team_timers/${pathEid}/${pathTid}`);

    const unsubscribe = onValue(timerRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTimers(data as TeamTimers);
      } else {
        setTimers({});
      }
    });
    return () => unsubscribe();
  }, [eventId, teamId]);

  // Tick every second to compute countdowns
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const result: Record<string, number> = {};
      for (const at of ACTION_TYPES) {
        const entry = timers[at] as TeamTimerEntry | undefined;
        if (entry?.active && entry?.end_time) {
          const end = new Date(entry.end_time).getTime();
          result[at] = Math.max(0, Math.floor((end - now) / 1000));
        } else {
          result[at] = 0;
        }
      }
      setCountdowns(result);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timers]);

  return { timers, countdowns };
}
