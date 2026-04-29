"use client";
import { useEffect, useState } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import type { Team } from "@/types";

export function useLiveTeams(eventId: string, initialTeams: Team[] = []) {
  const [firebaseData, setFirebaseData] = useState<Record<string, Team>>({});

  useEffect(() => {
    if (!eventId || !rtdb) return;

    // Use lowercase for path consistency
    const pathId = eventId.toLowerCase();
    const teamsRef = ref(rtdb, `/teams/${pathId}`);

    const unsubscribe = onValue(teamsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Normalize keys to lowercase for safety
        const normalized: Record<string, Team> = {};
        Object.entries(data).forEach(([key, val]) => {
          normalized[key.toLowerCase()] = val as Team;
        });
        setFirebaseData(normalized);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [eventId]);

  // Merge them declaratively
  const mergedTeams = initialTeams.map((team) => {
    const tid = team.team_id.toLowerCase();
    if (firebaseData[tid]) {
      return { ...team, ...firebaseData[tid] };
    }
    return team;
  });

  // Include any extra teams strictly from Firebase that API hasn't loaded yet
  const initialTeamIds = new Set(initialTeams.map((t) => t.team_id.toLowerCase()));
  Object.values(firebaseData).forEach((fbTeam) => {
    if (!initialTeamIds.has(fbTeam.team_id.toLowerCase())) {
      mergedTeams.push(fbTeam);
    }
  });

  return mergedTeams;
}
