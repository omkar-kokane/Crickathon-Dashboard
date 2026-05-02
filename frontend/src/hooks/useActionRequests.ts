"use client";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { ActionRequestUpdate } from "@/types";

/**
 * Subscribes to Firebase for all active action requests for a given event.
 * Umpires use this to see incoming PENDING requests in real-time.
 */
export function useActionRequests(eventId: string): ActionRequestUpdate[] {
  const [requests, setRequests] = useState<ActionRequestUpdate[]>([]);

  useEffect(() => {
    if (!eventId || !rtdb) return;
    
    // Clear state immediately when switching events to prevent leakage
    setRequests([]);

    const pathId = eventId.toLowerCase();
    const reqRef = ref(rtdb, `/action_requests/${pathId}`);
    
    const unsubscribe = onValue(reqRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Normalize IDs in the returned array as well
        const arr: ActionRequestUpdate[] = Object.values(data).map((req: unknown) => {
          const r = req as Record<string, unknown>;
          return {
            ...r,
            request_id: (r.request_id as string)?.toLowerCase(),
            team_id: (r.team_id as string)?.toLowerCase(),
            event_id: (r.event_id as string)?.toLowerCase(),
          } as ActionRequestUpdate;
        });
        
        // Show most recent first
        setRequests(arr.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
      } else {
        setRequests([]);
      }
    });
    return () => unsubscribe();
  }, [eventId]);

  return requests;
}
