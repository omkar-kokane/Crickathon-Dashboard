"use client";
import { useEffect, useState, useCallback } from "react";
import { ref, onValue, off } from "firebase/database";
import { rtdb } from "@/lib/firebase";

interface AuctionPlayer {
  player_id: string;
  event_id: string;
  name: string;
  bio?: string;
  specialization?: string;
  photo_url?: string;
  base_price: number;
  sold_price?: number;
  sold_to_team_id?: string;
  status: "UPCOMING" | "BIDDING" | "SOLD" | "UNSOLD";
  display_order: number;
}

interface AuctionCurrent {
  player_id: string;
  name: string;
  base_price: number;
  sold_price?: number;
  sold_to_team_id?: string;
  status: string;
}

export function useAuction(eventId: string) {
  const [players, setPlayers] = useState<AuctionPlayer[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<AuctionCurrent | null>(null);

  useEffect(() => {
    if (!eventId) return;

    const eid = eventId.toLowerCase();

    // Listen to all auction players
    const playersRef = ref(rtdb, `/auction/${eid}/players`);
    const playersHandler = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: AuctionPlayer[] = Object.values(data);
        list.sort((a, b) => a.display_order - b.display_order);
        setPlayers(list);
      } else {
        setPlayers([]);
      }
    });

    // Listen to current player on the auction block
    const currentRef = ref(rtdb, `/auction/${eid}/current`);
    const currentHandler = onValue(currentRef, (snapshot) => {
      const data = snapshot.val();
      setCurrentPlayer(data || null);
    });

    return () => {
      off(playersRef);
      off(currentRef);
    };
  }, [eventId]);

  const soldPlayers = players.filter((p) => p.status === "SOLD");
  const unsoldPlayers = players.filter((p) => p.status === "UNSOLD");
  const upcomingPlayers = players.filter((p) => p.status === "UPCOMING");
  const biddingPlayer = players.find((p) => p.status === "BIDDING") || null;

  return {
    players,
    currentPlayer,
    soldPlayers,
    unsoldPlayers,
    upcomingPlayers,
    biddingPlayer,
  };
}
