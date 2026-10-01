export type RoundCode = "R1" | "R2" | "R3";

export type RoundPhase = "scheduled" | "live" | "flash_crash" | "paused" | "completed";

export type SubmissionType = "prediction" | "position";

export interface AuthRequest {
  team_id: string;
  password: string;
}

export interface AuthResponse {
  token: string;
}

export interface AssignedStock {
  code: string;
  name: string;
}

export interface EventStatus {
  state_version: number;
  server_time: string;
  current_round: RoundCode;
  round_name: string;
  round_phase: RoundPhase;
  round_ends_at: string;
  time_remaining_seconds: number;
  flash_crash_active: boolean;
  flash_crash_message: string | null;
  assigned_stock: AssignedStock;
  download_available: boolean;
  submission_type: SubmissionType;
}

export interface DownloadResponse {
  filename: string;
  download_url: string;
  expires_in_seconds: number;
}

export interface UploadSuccess {
  status: "success";
  message?: string;
  score: number;
  team_id?: string;
  round?: number | RoundCode;
  balanced_accuracy?: number;
  mcc?: number;
  submission_number?: number;
  submissions_remaining?: number;
}

export interface UploadError {
  status: "error";
  message: string;
  code?: number;
}

export type UploadResponse = UploadSuccess | UploadError;

export interface AdminAuthRequest {
  username: string;
  password: string;
}

export interface AdminRound {
  code: RoundCode;
  name: string;
  submission_type: SubmissionType;
  phase: RoundPhase;
  duration_seconds: number;
  ends_at: string | null;
}

export interface AdminStatus {
  state_version: number;
  server_time: string;
  current_round: RoundCode;
  round_name: string;
  round_phase: RoundPhase;
  round_ends_at: string;
  time_remaining_seconds: number;
  flash_crash_active: boolean;
  flash_crash_message: string | null;
  flash_crash_triggered_at: string | null;
  rounds: AdminRound[];
  teams_total?: number;
  submissions_current_round?: number;
}

export type TimerAction = "pause" | "resume" | "extend" | "set" | "end";

export interface TimerRequest {
  action: TimerAction;
  seconds?: number;
}

export interface StartRoundRequest {
  round: RoundCode;
  duration_seconds: number;
}

export interface FlashCrashRequest {
  active: boolean;
  message?: string;
  duration_seconds?: number;
}

export interface AdminLeaderboardEntry {
  team: string;
  team_code: string;
  score: number;
  submissions: number;
  last_submission_at: string | null;
}
