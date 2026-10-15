export type RoundCode = "R1" | "R2" | "R3";

export type RoundPhase = "scheduled" | "live" | "flash_crash" | "paused" | "completed";

export type SubmissionType = "prediction" | "signal";

export interface AuthRequest {
  team_id: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  expires_in_seconds: number;
}

export interface AssignedStock {
  code: string;
  name: string;
}

export interface TeamNotice {
  id: string;
  message: string;
  created_at: string;
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
  notices: TeamNotice[];
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
  penalty: number;
  adjusted_score: number;
  submissions: number;
  last_submission_at: string | null;
  private_score?: number | null;
  private_adjusted_score?: number | null;
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

export type IntegrityStatus = "FLAGGED" | "REVIEW" | "OK" | "NO_FILE" | "NO_TARGETS";

export type IntegrityMessageKey = "WARNING_LOOKAHEAD" | "WARNING_CHECK";

export interface IntegrityThresholds {
  flag: number;
  review: number;
  rule_min: number;
}

export interface IntegrityRuleResult {
  rule_acc: number | null;
  agreement: number | null;
}

export interface IntegritySubmission {
  submission_id: string;
  team_id: string;
  team_code: string;
  team_name: string;
  stock: string;
  submission_no: number;
  submitted_at: string;
  public_score: number;
  private_score: number | null;
  status: IntegrityStatus;
  worst_rule: string | null;
  worst_agreement: number | null;
  note: string;
  rules: Record<string, IntegrityRuleResult>;
}

export interface IntegrityCurrentAdjustment {
  id: string;
  points: number;
  created_at: string;
}

export interface IntegrityTeam {
  team_id: string;
  team_code: string;
  team_name: string;
  status: IntegrityStatus;
  submission_count: number;
  submission_no: number;
  worst_submission_id: string;
  worst_rule: string | null;
  worst_agreement: number | null;
  public_score: number;
  private_score: number | null;
  suggested_points: number;
  suggested_message_key: IntegrityMessageKey | null;
  current_adjustment: IntegrityCurrentAdjustment | null;
  last_notice_at: string | null;
}

export interface IntegrityResults {
  round: RoundCode;
  check_run_id: string | null;
  checked_at: string | null;
  thresholds: IntegrityThresholds | null;
  submissions: IntegritySubmission[];
  teams: IntegrityTeam[];
}

export interface IntegrityRunRequest {
  round: RoundCode;
  flag: number;
  review: number;
  rule_min: number;
}

export interface IntegrityApplyItem {
  team_code: string;
  points: number;
  message: string;
}

export interface IntegrityApplyRequest {
  round: RoundCode;
  items: IntegrityApplyItem[];
}

export interface ScoreAdjustment {
  id: string;
  team_code: string;
  team_name: string;
  round: RoundCode;
  kind: "lookahead" | "manual";
  points: number;
  reason: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface ScoreAdjustmentRequest {
  team_code: string;
  round: RoundCode;
  points: number;
  reason: string;
}

export interface TeamNoticeRecord {
  id: string;
  team_code: string;
  team_name: string;
  round: RoundCode | null;
  message: string;
  created_by: string;
  created_at: string;
  acknowledged_at: string | null;
}

export interface IntegrityApplyResult {
  adjustments: ScoreAdjustment[];
  notices: TeamNoticeRecord[];
}
