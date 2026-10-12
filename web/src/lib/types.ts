export type RoundCode = "R1" | "R2" | "R3";

export type RoundPhase = "scheduled" | "live" | "flash_crash" | "paused" | "completed";

export type SubmissionType = "prediction" | "signal";

export interface AuthRequest {
  team_id: string;
  password: string;
}

export interface AuthResponse {
  token: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
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
  submissions_count?: number;
  submissions_remaining?: number;
  latest_score?: number | null;
}

export interface DownloadResponse {
  filename: string;
  download_url: string;
  expires_in_seconds: number;
}

export interface UploadSuccess {
  status: "success";
  team_id: string;
  round: number;
  submission_number: number;
  submissions_remaining: number;
  public_score?: number;
}

export interface TeamProfile {
  team_id: string;
  team_name: string;
  assigned_stock: AssignedStock;
  train_start: number;
  train_end: number;
  predict_start: number;
  predict_end: number;
  download_available: boolean;
}

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
  teams_total: number;
  submissions_count: number;
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

export interface LeaderboardEntry {
  rank: number;
  team: string;
  score: number;
  submissions: number;
}

export interface CumulativeLeaderboardEntry {
  rank: number;
  team: string;
  cumulative_score: number;
  r1_score: number | null;
  r2_score: number | null;
  r3_score: number | null;
  submissions: number;
}

export interface FinalResultsEntry {
  rank: number;
  team: string;
  score: number;
  r1_score?: number | null;
  r2_score?: number | null;
  r3_score?: number | null;
  submissions?: number;
}

export interface AdminLeaderboardEntry {
  rank: number;
  team: string;
  team_code: string;
  score: number;
  submissions: number;
  last_submission_at: string | null;
  private_score?: number | null;
}

export interface SnapshotResult {
  status: "success";
  snapshot_id: string;
  entries: number;
}

export interface FinalBacktestEntry {
  rank: number;
  team: string;
  score: number;
  cumulative_score?: number;
  r1_score?: number | null;
  r2_score?: number | null;
  r3_score?: number | null;
  submissions?: number;
}

export interface FinalBacktestResult {
  status: "success";
  round: "R3";
  rankings: FinalBacktestEntry[];
}

export interface PublicFinalResults {
  status: "success" | "pending";
  rankings: FinalResultsEntry[];
}
