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
 */
export function useActionRequests(eventId: string): ActionRequestUpdate[] {
  const [requests, setRequests] = useState<ActionRequestUpdate[]>([]);

  useEffect(() => {
    if (!eventId) return;
    
    const pathId = eventId.toLowerCase();
    const reqRef = ref(rtdb, `/action_requests/${pathId}`);
    
    const unsubscribe = onValue(reqRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Normalize IDs in the returned array as well
        const arr: ActionRequestUpdate[] = Object.values(data).map((req: any) => ({
          ...req,
          request_id: req.request_id?.toLowerCase(),
          team_id: req.team_id?.toLowerCase(),
          event_id: req.event_id?.toLowerCase()
        }));
        
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
