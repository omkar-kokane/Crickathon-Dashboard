import { useEffect, useState } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

export function useLiveTeams(eventId: string, initialTeams: any[] = []) {
  const [firebaseData, setFirebaseData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!eventId) return;

    // Use lowercase for path consistency
    const pathId = eventId.toLowerCase();
    const teamsRef = ref(rtdb, `/teams/${pathId}`);
    
    console.log(`[useLiveTeams] Subscribing to: /teams/${pathId}`);

    const unsubscribe = onValue(teamsRef, (snapshot) => {
      const data = snapshot.val();
      console.log(`[useLiveTeams] Received snapshot for ${pathId}:`, data);
      if (data) {
        // Normalize keys to lowercase for safety
        const normalized: Record<string, any> = {};
        Object.entries(data).forEach(([key, val]) => {
          normalized[key.toLowerCase()] = val;
        });
        setFirebaseData(normalized);
      }
    });

    return () => {
      console.log(`[useLiveTeams] Unsubscribing from: /teams/${pathId}`);
      unsubscribe();
    };
  }, [eventId]);

  // Merge them declaratively
  const mergedTeams = initialTeams.map((team) => {
    const tid = team.team_id.toLowerCase();
    if (firebaseData[tid]) {
      // console.log(`[useLiveTeams] Merging team ${tid} with firebase data`);
      return { ...team, ...firebaseData[tid] };
    }
    return team;
  });

  // Include any extra teams strictly from Firebase that API hasn't loaded yet
  const initialTeamIds = new Set(initialTeams.map((t) => t.team_id.toLowerCase()));
  Object.values(firebaseData).forEach((fbTeam: any) => {
    if (!initialTeamIds.has(fbTeam.team_id.toLowerCase())) {
      mergedTeams.push(fbTeam);
    }
  });

  return mergedTeams;
}
