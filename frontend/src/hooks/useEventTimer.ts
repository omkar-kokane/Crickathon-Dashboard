"use client";
import { useEffect, useState, useRef } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { EventState, CountdownResult } from "@/types";

/**
 * Subscribes to Firebase Realtime DB for live event phase/timer state.
 * Computes local countdown from phase_end_time to prevent server lag.
 * Returns isTimeout=true when a timed phase reaches 0.
 */
export function useEventTimer(eventId: string): CountdownResult {
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Track whether a phase_end_time was set (so we can distinguish "no timer" from "timer ended")
  const hadTimer = useRef(false);

  // Subscribe to Firebase for real-time updates
  useEffect(() => {
    if (!eventId || !rtdb) return;

    const pathId = eventId.toLowerCase();
    const eventRef = ref(rtdb, `/events/${pathId}`);
    const unsubscribe = onValue(eventRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setEventState(data);
    });
    return () => unsubscribe();
  }, [eventId]);

  // Locally compute countdown every second using phase_end_time
  useEffect(() => {
    if (!eventState?.phase_end_time) {
      setSecondsLeft(0);
      hadTimer.current = false;
      return;
    }
    hadTimer.current = true;
    const tick = () => {
      const end = new Date(eventState.phase_end_time!).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [eventState?.phase_end_time]);

  const isActive = secondsLeft > 0 && eventState?.current_phase !== "ENDED";
  // Timeout = timer was set, reached 0, and phase is not ENDED or PRE_MATCH
  const isTimeout =
    hadTimer.current &&
    secondsLeft === 0 &&
    !!eventState?.phase_end_time &&
    eventState?.current_phase !== "ENDED" &&
    eventState?.current_phase !== "PRE_MATCH";

  return { eventState, secondsLeft, isActive, isTimeout };
}
