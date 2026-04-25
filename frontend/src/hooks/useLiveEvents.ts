import { useEffect, useState } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

export function useLiveEvents(initialEvents: any[] = []) {
  const [firebaseData, setFirebaseData] = useState<Record<string, any>>({});

  useEffect(() => {
    const eventsRef = ref(rtdb, "/event_list");
    const unsubscribe = onValue(eventsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Normalize keys to lowercase for safety
        const normalized: Record<string, any> = {};
        Object.entries(data).forEach(([key, val]) => {
          normalized[key.toLowerCase()] = val;
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
  Object.values(firebaseData).forEach((fbEvent: any) => {
    if (!initialEventIds.has(fbEvent.event_id.toLowerCase())) {
      mergedEvents.push(fbEvent);
    }
  });

  return mergedEvents;
}
