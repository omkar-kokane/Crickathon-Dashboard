"use client";
import { useEffect, useState } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import type { CrickathonEvent } from "@/types";

export function useLiveEvents(initialEvents: CrickathonEvent[] = []) {
  const [firebaseData, setFirebaseData] = useState<Record<string, CrickathonEvent>>({});

  useEffect(() => {
    if (!rtdb) return;
    const eventsRef = ref(rtdb, "/event_list");
    const unsubscribe = onValue(eventsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Normalize keys to lowercase for safety
        const normalized: Record<string, CrickathonEvent> = {};
        Object.entries(data).forEach(([key, val]) => {
          normalized[key.toLowerCase()] = val as CrickathonEvent;
        });
        setFirebaseData(normalized);
      }
    });

    return () => unsubscribe();
  }, []);

  // Merge them declaratively
  const mergedEvents = initialEvents.map((event) => {
    const id = event.event_id.toLowerCase();
    if (firebaseData[id]) {
      return { ...event, ...firebaseData[id] };
    }
    return event;
  });

  // Include any extra events strictly from Firebase that API hasn't loaded yet
  const initialEventIds = new Set(initialEvents.map((e) => e.event_id.toLowerCase()));
  Object.values(firebaseData).forEach((fbEvent) => {
    if (!initialEventIds.has(fbEvent.event_id.toLowerCase())) {
      mergedEvents.push(fbEvent);
    }
  });

  return mergedEvents;
}
