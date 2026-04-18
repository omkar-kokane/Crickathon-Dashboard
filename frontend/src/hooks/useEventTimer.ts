"use client";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";

interface EventState {
  event_id: string;
  current_phase: string;
  phase_end_time: string | null;
}

interface CountdownResult {
  eventState: EventState | null;
  secondsLeft: number;
  isActive: boolean;
}

/**
 * Subscribes to Firebase Realtime DB for live event phase/timer state.
 * Computes local countdown from phase_end_time to prevent server lag.
 */
export function useEventTimer(eventId: string): CountdownResult {
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Subscribe to Firebase for real-time updates
  useEffect(() => {
    if (!eventId) return;
    const eventRef = ref(rtdb, `/events/${eventId}`);
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
      return;
    }
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

  return { eventState, secondsLeft, isActive };
}
