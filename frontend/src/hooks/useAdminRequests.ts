"use client";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { ActionRequestUpdate } from "@/types";

/**
 * Subscribes to Firebase for admin-facing forwarded requests.
 * Path: /admin_requests/{eventId}
 */
export function useAdminRequests(eventId: string): ActionRequestUpdate[] {
  const [requests, setRequests] = useState<ActionRequestUpdate[]>([]);

  useEffect(() => {
    if (!eventId || !rtdb) return;

    // Clear state immediately when switching events to prevent leakage
    setRequests([]);

    const pathId = eventId.toLowerCase();
    const reqRef = ref(rtdb, `/admin_requests/${pathId}`);

    const unsubscribe = onValue(reqRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr: ActionRequestUpdate[] = Object.values(data).map((req: unknown) => {
          const r = req as Record<string, unknown>;
          return {
            ...r,
            request_id: (r.request_id as string)?.toLowerCase(),
            team_id: (r.team_id as string)?.toLowerCase(),
            event_id: (r.event_id as string)?.toLowerCase(),
          } as ActionRequestUpdate;
        });
        // Filter only unresolved, sort newest first
        setRequests(
          arr
            .filter((r) => !r.admin_status)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        );
      } else {
        setRequests([]);
      }
    });
    return () => unsubscribe();
  }, [eventId]);

  return requests;
}
