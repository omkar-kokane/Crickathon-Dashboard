"use client";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";

interface ActionRequestUpdate {
  request_id: string;
  team_id: string;
  type: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

/**
 * Subscribes to Firebase for all active action requests for a given event.
 * Umpires use this to see incoming PENDING requests in real-time.
 * Participants can use it to track their request status.
 */
export function useActionRequests(eventId: string): ActionRequestUpdate[] {
  const [requests, setRequests] = useState<ActionRequestUpdate[]>([]);

  useEffect(() => {
    if (!eventId) return;
    const reqRef = ref(rtdb, `/action_requests/${eventId}`);
    const unsubscribe = onValue(reqRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr: ActionRequestUpdate[] = Object.values(data);
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
