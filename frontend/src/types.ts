/**
 * Shared TypeScript interfaces for the Crickathon Dashboard frontend.
 * Used across pages, hooks, and context to replace `any` types.
 */

// ── User & Auth ──────────────────────────────────────────────────────────────

export type UserRoleKey = "SUPER_ADMIN" | "ADMIN" | "UMPIRE" | "PARTICIPANT";

export interface UserProfile {
  user_id: string;
  firebase_uid: string;
  email: string;
  display_name?: string;
  role: UserRoleKey;
  org_id?: string;
}

// ── Events ───────────────────────────────────────────────────────────────────

export type EventPhase =
  | "PRE_MATCH"
  | "POWERPLAY_1"
  | "POWERPLAY_2"
  | "POWERPLAY_3"
  | "POWERPLAY_4"
  | "SUPER_OVER"
  | "ENDED";

export interface CrickathonEvent {
  event_id: string;
  name: string;
  org_id?: string;
  current_phase: EventPhase;
  phase_name?: string | null;
  phase_end_time?: string | null;
}

// ── Teams ────────────────────────────────────────────────────────────────────

export interface Team {
  team_id: string;
  event_id: string;
  name: string;
  invite_code: string;
  wallet_balance: number;
  total_runs: number;
  umpire_id?: string | null;
}

// ── Action Requests ──────────────────────────────────────────────────────────

export type ActionRequestType = "DRS" | "STRATEGIC_TIMEOUT" | "RETENTION" | "QUICK_SINGLE";

export type ActionRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "FAILED";

export interface ActionRequestUpdate {
  request_id: string;
  team_id: string;
  event_id?: string;
  type: ActionRequestType;
  status: ActionRequestStatus;
  created_at: string;
  resolved_at: string | null;
}

// ── Umpire ───────────────────────────────────────────────────────────────────

export interface UmpireUser {
  user_id: string;
  email: string;
  display_name?: string;
  role: string;
}

// ── Timer State (from Firebase RTDB) ─────────────────────────────────────────

export interface EventState {
  event_id: string;
  current_phase: string;
  phase_name?: string | null;
  phase_end_time: string | null;
}

export interface CountdownResult {
  eventState: EventState | null;
  secondsLeft: number;
  isActive: boolean;
  isTimeout: boolean;
}
