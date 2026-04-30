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
  last_reason?: string;
  last_amount?: number;
}

// ── Action Requests ──────────────────────────────────────────────────────────

export type ActionRequestType = "DRS" | "STRATEGIC_TIMEOUT" | "RETENTION" | "QUICK_SINGLE";

export type ActionRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "FAILED"
  | "TIMER_EXPIRED"
  | "FORWARDED_TO_ADMIN"
  | "IN_PROGRESS";

export interface ActionRequestUpdate {
  request_id: string;
  team_id: string;
  event_id?: string;
  type: ActionRequestType;
  status: ActionRequestStatus;
  created_at: string;
  resolved_at: string | null;
  message?: string | null;
  action_timer_end?: string | null;
  forwarded_to_admin?: boolean;
  admin_status?: string | null;
  admin_notes?: string | null;
  umpire_deduction_amount?: number | null;
  duration_minutes?: number | null;
  point_cost?: number | null;
}

// ── Team Timers (from Firebase RTDB) ─────────────────────────────────────────

export interface TeamTimerEntry {
  action_type: string;
  end_time: string | null;
  label: string;
  active: boolean;
}

export interface TeamTimers {
  DRS?: TeamTimerEntry;
  STRATEGIC_TIMEOUT?: TeamTimerEntry;
  RETENTION?: TeamTimerEntry;
  QUICK_SINGLE?: TeamTimerEntry;
}

// ── Umpire ───────────────────────────────────────────────────────────────────

export interface UmpireUser {
  user_id: string;
  email: string;
  display_name?: string;
  role: string;
}

// ── Ledger History ───────────────────────────────────────────────────────────

export interface LedgerHistoryEntry {
  transaction_id: string;
  team_id: string;
  type: string;
  amount: number;
  reason: string;
  timestamp: string;
  processed_by_user_id: string;
  processed_by_email?: string;
  request_id?: string | null;
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
