import { ApiError } from "@/lib/errors";
import { config } from "@/lib/config";
import type {
  AdminAuthRequest,
  AdminLeaderboardEntry,
  AdminStatus,
  AuthRequest,
  AuthResponse,
  DownloadResponse,
  EventStatus,
  FinalBacktestResult,
  FlashCrashRequest,
  IntegrityApplyRequest,
  IntegrityApplyResult,
  IntegrityResults,
  IntegrityRunRequest,
  IntegrityStatus,
  IntegritySubmission,
  IntegrityTeam,
  IntegrityThresholds,
  RoundCode,
  RoundPhase,
  ScoreAdjustment,
  ScoreAdjustmentRequest,
  SnapshotResult,
  StartRoundRequest,
  SubmissionType,
  TeamNoticeRecord,
  TimerRequest,
  UploadSuccess,
} from "@/lib/types";

export const MOCK_STATE_KEY = "qe.mock.state";
const SCHEMA = 5;
const TEAM_PASSWORD = "demo";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "admin";
const ADMIN_TOKEN = "mock-admin";
const MAX_SUBMISSIONS = 10;
const TOTAL_TEAMS = 40;
// Matches the backend's ACCESS_TOKEN_MINUTES default (7 hours).
const SESSION_SECONDS = 25200;

interface RoundDefinition {
  code: RoundCode;
  name: string;
  minutes: number;
  submissionType: SubmissionType;
}

const ROUNDS: RoundDefinition[] = [
  { code: "R1", name: "Round 1: Foundation", minutes: 75, submissionType: "prediction" },
  { code: "R2", name: "Round 2: Signal Hunt", minutes: 105, submissionType: "prediction" },
  { code: "R3", name: "Round 3: Alpha", minutes: 60, submissionType: "signal" },
];

export const RIVALS = [
  "Mean Reverters", "Alpha Seekers", "Gradient Descent", "Random Walkers", "Sharpe Shooters",
  "Black Swans", "Volatility Smile", "Market Makers", "Long Gamma", "Delta Neutral",
  "Momentum Crew", "Kalman Filters", "Brownian Motion", "Fat Tails", "Order Flow",
  "Bid Ask Bounce", "Stat Arb", "Hidden Markov", "Overfit Club", "Lookahead Free",
  "Drawdown Dodgers", "Rolling Window", "Bayesian Bulls", "Quant Quokkas", "Signal Noise",
  "The Regressors", "Short Squeeze", "Beta Hedgers", "Monte Carlo", "Tick Data",
  "Vol Surface", "Carry Trade", "Martingales", "Theta Gang", "Pairs Traders",
  "Neural Nets", "Ensemble Avengers", "Cross Validators", "Sigma Squad", "Fourier Transformers",
];

export const TEAM_CODES = Array.from({ length: TOTAL_TEAMS }, (_, i) => `${"ABCDE"[Math.floor(i / 8)]}${String((i % 8) + 1).padStart(2, "0")}`);

type PerRound<T> = Record<RoundCode, T>;

interface TeamRecord {
  submissions: PerRound<number>;
  best: PerRound<number | null>;
  last: PerRound<number | null>;
}

interface MockState {
  schema: number;
  version: number;
  roundIndex: number;
  phase: RoundPhase;
  endsAt: number;
  pausedRemainingMs: number | null;
  resumePhase: RoundPhase;
  flashActive: boolean;
  flashMessage: string | null;
  flashTriggeredAt: number | null;
  durations: PerRound<number>;
  teams: Record<string, TeamRecord>;
}

const DEFAULT_FLASH_MESSAGE =
  "A flash crash has hit the market. Volatility has spiked and your Round 1 model is likely broken. Download the crash data and adapt.";

function perRound<T>(value: T): PerRound<T> {
  return { R1: value, R2: value, R3: value };
}

function freshState(): MockState {
  return {
    schema: SCHEMA,
    version: 1,
    roundIndex: 0,
    phase: "scheduled",
    endsAt: Date.now() + ROUNDS[0].minutes * 60000,
    pausedRemainingMs: null,
    resumePhase: "live",
    flashActive: false,
    flashMessage: null,
    flashTriggeredAt: null,
    durations: { R1: ROUNDS[0].minutes * 60, R2: ROUNDS[1].minutes * 60, R3: ROUNDS[2].minutes * 60 },
    teams: {},
  };
}

function saveState(state: MockState) {
  try {
    window.localStorage.setItem(MOCK_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function loadState(): MockState {
  try {
    const raw = window.localStorage.getItem(MOCK_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockState;
      if (parsed.schema === SCHEMA) return parsed;
    }
  } catch {}
  const state = freshState();
  saveState(state);
  return state;
}

function mutate(change: (state: MockState) => void): MockState {
  const state = loadState();
  change(state);
  state.version += 1;
  saveState(state);
  return state;
}

function delay<T>(value: T, ms = 200 + Math.random() * 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function teamFromToken(token: string | null): string {
  if (!token || !token.startsWith("mock.")) throw new ApiError("Your session has expired. Please sign in again.", 401);
  return token.slice(5);
}

function requireAdmin(token: string | null) {
  if (token !== ADMIN_TOKEN) throw new ApiError("Admin session expired. Sign in again.", 401);
}

function stockFor(team: string) {
  const letter = team.trim().charAt(0).toUpperCase();
  const code = "ABCDE".includes(letter) && letter ? letter : "A";
  return { code: `STOCK_${code}`, name: `Stock ${code}` };
}

function remainingMs(state: MockState): number {
  if (state.pausedRemainingMs !== null) return Math.max(0, state.pausedRemainingMs);
  if (state.phase === "completed") return 0;
  return Math.max(0, state.endsAt - Date.now());
}

function effectivePhase(state: MockState): RoundPhase {
  if ((state.phase === "live" || state.phase === "flash_crash") && remainingMs(state) === 0) return "completed";
  return state.phase;
}

function currentRound(state: MockState): RoundDefinition {
  return ROUNDS[state.roundIndex];
}

function isOpen(state: MockState): boolean {
  const phase = effectivePhase(state);
  return phase === "live" || phase === "flash_crash";
}

function roundScore(code: RoundCode, rand: () => number): number {
  if (code === "R3") return Number((rand() * 3.2 - 0.9).toFixed(4));
  return Number((0.44 + rand() * 0.24).toFixed(4));
}

function teamRecord(state: MockState, team: string): TeamRecord {
  if (!state.teams[team]) {
    state.teams[team] = { submissions: perRound(0), best: perRound(null), last: perRound(null) };
  }
  return state.teams[team];
}

function startTimer(state: MockState, seconds: number, phase: RoundPhase) {
  state.endsAt = Date.now() + seconds * 1000;
  state.pausedRemainingMs = null;
  state.phase = phase;
  state.resumePhase = phase;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildDataset(team: string, crash: boolean): string {
  const rand = seeded(hashString(`${team}:${crash ? "crash" : "base"}`));
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const total = crash ? 1050 : 850;
  const closes: number[] = [];
  let price = 100;
  for (let t = 0; t < total + 60; t++) {
    const inCrash = crash && t >= 850 + 60;
    const mu = inCrash ? -0.008 : 0.0002;
    const sigma = inCrash ? 0.045 : 0.015;
    price *= Math.exp(mu - (sigma * sigma) / 2 + sigma * gauss());
    closes.push(price);
  }
  const lines = ["timestamp,open,high,low,close,volume,returns,volatility_5,volatility_20,rsi_14,sma_10,sma_50,target"];
  const std = (values: number[]) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  };
  const returns = closes.map((c, i) => (i === 0 ? 0 : Math.log(c / closes[i - 1])));
  for (let i = 60; i < total + 60; i++) {
    const local = i - 59;
    const close = closes[i];
    const open = closes[i - 1] * (1 + gauss() * 0.002);
    const high = Math.max(open, close) * (1 + Math.abs(gauss()) * 0.003);
    const low = Math.min(open, close) * (1 - Math.abs(gauss()) * 0.003);
    const volume = 15000 * Math.exp(0.25 * gauss());
    const window14 = returns.slice(i - 13, i + 1);
    const gains = window14.filter((r) => r > 0).reduce((a, b) => a + b, 0);
    const losses = -window14.filter((r) => r < 0).reduce((a, b) => a + b, 0);
    const rsi = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    const sma = (n: number) => closes.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n;
    const isTraining = local <= total - 50;
    const target = isTraining ? (closes[i + 1] > close ? "1" : "0") : "";
    lines.push(
      [
        local,
        open.toFixed(4),
        high.toFixed(4),
        low.toFixed(4),
        close.toFixed(4),
        volume.toFixed(1),
        returns[i].toFixed(4),
        std(returns.slice(i - 4, i + 1)).toFixed(4),
        std(returns.slice(i - 19, i + 1)).toFixed(4),
        rsi.toFixed(4),
        sma(10).toFixed(4),
        sma(50).toFixed(4),
        target,
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function validateCsv(text: string, type: SubmissionType): string | null {
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rows.length === 0) return "Missing columns: timestamp";
  const header = rows[0].split(",").map((h) => h.trim().toLowerCase());
  const valueColumn = type === "prediction" ? "prediction" : "signal";
  const required = ["timestamp", valueColumn];
  const missing = required.filter((column) => !header.includes(column));
  if (missing.length > 0) return `Missing columns: ${missing.join(", ")}`;

  const data = rows.slice(1);
  if (data.length !== config.predictionRows) return `Expected ${config.predictionRows} rows, got ${data.length}.`;

  const tsIndex = header.indexOf("timestamp");
  const valueIndex = header.indexOf(valueColumn);
  const confidenceIndex = header.indexOf("confidence");
  const seen = new Set<number>();

  for (let i = 0; i < data.length; i++) {
    const rowNumber = i + 1;
    const cells = data[i].split(",").map((c) => c.trim());
    const numeric = [tsIndex, valueIndex, ...(confidenceIndex >= 0 && type === "prediction" ? [confidenceIndex] : [])];
    for (const index of numeric) {
      const cell = cells[index];
      if (index === confidenceIndex && (cell === undefined || cell === "")) continue;
      if (cell === undefined || cell === "" || !Number.isFinite(Number(cell))) return `Row ${rowNumber}: non-numeric value found.`;
    }
    const timestamp = Number(cells[tsIndex]);
    if (seen.has(timestamp)) return `Duplicate timestamp found at row ${rowNumber}.`;
    seen.add(timestamp);
    if (!Number.isInteger(timestamp) || timestamp < 1 || timestamp > config.predictionRows) {
      return `Timestamp ${cells[tsIndex]} is outside your assigned window.`;
    }
    const value = Number(cells[valueIndex]);
    if (type === "prediction") {
      if (value !== 0 && value !== 1) return `Row ${rowNumber}: prediction must be 0 or 1.`;
      if (confidenceIndex >= 0 && cells[confidenceIndex]) {
        const confidence = Number(cells[confidenceIndex]);
        if (confidence < 0 || confidence > 1) return `Row ${rowNumber}: confidence must be between 0.0 and 1.0.`;
      }
    } else if (value < -1 || value > 1) {
      return `Row ${rowNumber}: signal must be between -1.0 and 1.0.`;
    }
  }
  return null;
}

function buildAdminStatus(state: MockState): AdminStatus {
  const round = currentRound(state);
  const now = Date.now();
  const remaining = remainingMs(state);
  const submissions = Object.values(state.teams).reduce((sum, team) => sum + team.submissions[round.code], 0);
  return {
    state_version: state.version,
    server_time: new Date(now).toISOString(),
    current_round: round.code,
    round_name: round.name,
    round_phase: effectivePhase(state),
    round_ends_at: new Date(now + remaining).toISOString(),
    time_remaining_seconds: Math.floor(remaining / 1000),
    flash_crash_active: state.flashActive,
    flash_crash_message: state.flashMessage,
    flash_crash_triggered_at: state.flashTriggeredAt ? new Date(state.flashTriggeredAt).toISOString() : null,
    rounds: ROUNDS.map((definition, index) => ({
      code: definition.code,
      name: definition.name,
      submission_type: definition.submissionType,
      phase: index < state.roundIndex ? "completed" : index > state.roundIndex ? "scheduled" : effectivePhase(state),
      duration_seconds: state.durations[definition.code],
      ends_at: index === state.roundIndex ? new Date(now + remaining).toISOString() : null,
    })),
    teams_total: TOTAL_TEAMS,
    submissions_count: submissions,
  };
}

export const mockBackend = {
  async login({ team_id, password }: AuthRequest): Promise<AuthResponse> {
    const team = team_id.trim().toUpperCase();
    if (!team || password !== TEAM_PASSWORD) {
      await delay(null);
      throw new ApiError("Invalid team ID or password.", 401);
    }
    loadState();
    return delay({ token: `mock.${team}`, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
  },

  async getStatus(token: string | null): Promise<EventStatus> {
    const team = teamFromToken(token);
    const state = loadState();
    const round = currentRound(state);
    const now = Date.now();
    const remaining = remainingMs(state);
    return delay(
      {
        state_version: state.version,
        server_time: new Date(now).toISOString(),
        current_round: round.code,
        round_name: round.name,
        round_phase: effectivePhase(state),
        round_ends_at: new Date(now + remaining).toISOString(),
        time_remaining_seconds: Math.floor(remaining / 1000),
        flash_crash_active: state.flashActive,
        flash_crash_message: state.flashMessage,
        assigned_stock: stockFor(team),
        download_available: state.phase !== "scheduled",
        submission_type: round.submissionType,
        notices: [],
      },
      100,
    );
  },

  async getDownload(token: string | null): Promise<DownloadResponse> {
    const team = teamFromToken(token);
    const state = loadState();
    const crash = state.roundIndex > 0 || state.flashActive;
    const stock = stockFor(team);
    const blob = new Blob([buildDataset(team, crash)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return delay({
      filename: `${stock.code}_${team}_${crash ? "round2_flash_crash" : "round1"}.csv`,
      download_url: url,
      expires_in_seconds: 120,
    });
  },

  async upload(token: string | null, file: File, requestedRound: RoundCode): Promise<UploadSuccess> {
    const team = teamFromToken(token);
    await delay(null, 700 + Math.random() * 700);
    const state = loadState();
    const round = currentRound(state);
    const roundNumber = state.roundIndex + 1;
    const record = teamRecord(state, team);
    if (!file.name.toLowerCase().endsWith(".csv")) throw new ApiError("Only .csv files are accepted.", 400);
    if (requestedRound !== round.code) throw new ApiError(`Round ${requestedRound.slice(1)} is closed.`, 400);
    if (!isOpen(state)) throw new ApiError(`Round ${roundNumber} is closed.`, 400);
    const totalSubmitted = Object.values(record.submissions).reduce((sum, n) => sum + (n ?? 0), 0);
    if (totalSubmitted >= MAX_SUBMISSIONS) {
      throw new ApiError(`Submission limit (${MAX_SUBMISSIONS} total across all rounds) reached.`, 400);
    }
    const text = await file.text();
    const error = validateCsv(text, round.submissionType);
    if (error) throw new ApiError(error, 400);

    const rand = seeded(hashString(`${team}:${round.code}:${text}`));
    const score = roundScore(round.code, rand);
    const submissionNumber = record.submissions[round.code] + 1;
    record.submissions[round.code] = submissionNumber;
    const previous = record.best[round.code];
    record.best[round.code] = previous === null ? score : Math.max(previous, score);
    record.last[round.code] = Date.now();
    saveState(state);

    return {
      status: "success",
      team_id: team,
      round: roundNumber,
      submission_number: submissionNumber,
      submissions_remaining: MAX_SUBMISSIONS - totalSubmitted - 1,
    };
  },
};

export const mockAdminBackend = {
  async login({ username, password }: AdminAuthRequest): Promise<AuthResponse> {
    if (username.trim().toLowerCase() !== ADMIN_USER || password !== ADMIN_PASSWORD) {
      await delay(null);
      throw new ApiError("Invalid admin credentials.", 401);
    }
    loadState();
    return delay({ token: ADMIN_TOKEN, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
  },

  async getStatus(token: string | null): Promise<AdminStatus> {
    requireAdmin(token);
    return delay(buildAdminStatus(loadState()), 80);
  },

  async timer(token: string | null, { action, seconds }: TimerRequest): Promise<AdminStatus> {
    requireAdmin(token);
    const amount = Math.round(seconds ?? 0);
    if ((action === "set" || action === "extend") && !Number.isFinite(amount)) {
      throw new ApiError("seconds must be a number.", 400);
    }
    const state = mutate((s) => {
      const remaining = remainingMs(s);
      const running = s.pausedRemainingMs === null;
      const openPhase: RoundPhase = s.flashActive ? "flash_crash" : "live";
      if (action === "pause") {
        if (!running) return;
        s.pausedRemainingMs = remaining;
        s.resumePhase = remaining > 0 ? openPhase : s.resumePhase;
        s.phase = "paused";
      } else if (action === "resume") {
        if (running) return;
        startTimer(s, (s.pausedRemainingMs ?? 0) / 1000, openPhase);
      } else if (action === "extend") {
        const next = Math.max(0, remaining + amount * 1000);
        if (running) startTimer(s, next / 1000, next > 0 ? openPhase : "completed");
        else s.pausedRemainingMs = next;
      } else if (action === "set") {
        const next = Math.max(0, amount) * 1000;
        if (running) startTimer(s, next / 1000, next > 0 ? openPhase : "completed");
        else s.pausedRemainingMs = next;
      } else if (action === "end") {
        s.pausedRemainingMs = null;
        s.endsAt = Date.now();
        s.phase = "completed";
      }
    });
    return delay(buildAdminStatus(state), 120);
  },

  async startRound(token: string | null, { round, duration_seconds }: StartRoundRequest): Promise<AdminStatus> {
    requireAdmin(token);
    const index = ROUNDS.findIndex((definition) => definition.code === round);
    if (index < 0) throw new ApiError(`Unknown round ${round}.`, 400);
    if (!(duration_seconds > 0)) throw new ApiError("duration_seconds must be positive.", 400);
    const state = mutate((s) => {
      s.roundIndex = index;
      s.durations[round] = Math.round(duration_seconds);
      if (round === "R2") {
        if (!s.flashActive) {
          s.flashActive = true;
          s.flashMessage = DEFAULT_FLASH_MESSAGE;
          s.flashTriggeredAt = Date.now();
        }
      } else {
        s.flashActive = false;
        s.flashMessage = null;
        s.flashTriggeredAt = null;
      }
      startTimer(s, duration_seconds, s.flashActive ? "flash_crash" : "live");
    });
    return delay(buildAdminStatus(state), 120);
  },

  async flashCrash(token: string | null, { active, message, duration_seconds }: FlashCrashRequest): Promise<AdminStatus> {
    requireAdmin(token);
    if (!active) throw new ApiError("The crash stays on for all of Round 2. Restart Round 1 to undo it.", 409);
    const current = loadState();
    if (current.flashActive || current.roundIndex !== 0) {
      throw new ApiError("Flash Crash can only start once from Round 1.", 409);
    }
    const state = mutate((s) => {
      const seconds = duration_seconds && duration_seconds > 0 ? Math.round(duration_seconds) : s.durations.R2;
      s.roundIndex = 1;
      s.durations.R2 = seconds;
      s.flashActive = true;
      s.flashMessage = message?.trim() || DEFAULT_FLASH_MESSAGE;
      s.flashTriggeredAt = Date.now();
      startTimer(s, seconds, "flash_crash");
    });
    return delay(buildAdminStatus(state), 150);
  },

  async getLeaderboard(token: string | null, round: RoundCode): Promise<AdminLeaderboardEntry[]> {
    requireAdmin(token);
    const state = loadState();
    const index = ROUNDS.findIndex((definition) => definition.code === round);
    const entries: Omit<AdminLeaderboardEntry, "rank" | "penalty" | "adjusted_score" | "private_adjusted_score">[] = [];
    const simulated = index <= state.roundIndex;
    TEAM_CODES.forEach((code, i) => {
      const record = state.teams[code];
      const best = record?.best[round] ?? null;
      if (record && best !== null) {
        const last = record.last[round];
        entries.push({
          team: `Team ${code}`,
          team_code: code,
          score: best,
          submissions: record.submissions[round],
          last_submission_at: last ? new Date(last).toISOString() : null,
        });
        return;
      }
      if (!simulated) return;
      const rand = seeded(hashString(`${RIVALS[i]}:${round}`));
      entries.push({
        team: RIVALS[i],
        team_code: code,
        score: roundScore(round, rand),
        submissions: 1 + Math.floor(rand() * 9),
        last_submission_at: new Date(Date.now() - Math.floor(rand() * 3600) * 1000).toISOString(),
      });
    });
    Object.entries(state.teams).forEach(([code, record]) => {
      const best = record.best[round];
      if (TEAM_CODES.includes(code) || best === null) return;
      const last = record.last[round];
      entries.push({
        team: `Team ${code}`,
        team_code: code,
        score: best,
        submissions: record.submissions[round],
        last_submission_at: last ? new Date(last).toISOString() : null,
      });
    });
    const withPenalties = entries.map((entry) => {
      const penalty = mockPenaltyFor(round, entry.team_code);
      return {
        ...entry,
        penalty,
        adjusted_score: mockAdjusted(entry.score, penalty),
        private_adjusted_score: null,
      };
    });
    withPenalties.sort((a, b) => b.adjusted_score - a.adjusted_score);
    return delay(withPenalties.map((entry, index) => ({ ...entry, rank: index + 1 })), 120);
  },

  async publishSnapshot(token: string | null): Promise<SnapshotResult> {
    const round = currentRound(loadState());
    const entries = await this.getLeaderboard(token, round.code);
    return delay({ status: "success", snapshot_id: `mock-${round.code}-${Date.now()}`, entries: entries.length });
  },

  async runFinalBacktest(token: string | null): Promise<FinalBacktestResult> {
    requireAdmin(token);
    if (loadState().roundIndex < 2) {
      throw new ApiError("One or more active teams are missing a valid R3 submission.", 409);
    }
    const entries = await this.getLeaderboard(token, "R3");
    const rankings = entries.map((entry) => ({ team: entry.team, score: Number((entry.score * 0.9).toFixed(4)) }));
    rankings.sort((a, b) => b.score - a.score || a.team.localeCompare(b.team));
    return delay({
      status: "success",
      round: "R3",
      rankings: rankings.map((entry, index) => ({ rank: index + 1, ...entry })),
    });
  },

  reset() {
    saveState(freshState());
    resetMockIntegrity();
  },
};

// ---- Integrity (in memory only: it resets on page reload and on "Reset mock") ----

interface MockIntegrityRun {
  checkedAt: string;
  thresholds: IntegrityThresholds;
  submissions: IntegritySubmission[];
}

interface MockIntegrityStore {
  runs: Partial<Record<RoundCode, MockIntegrityRun>>;
  adjustments: ScoreAdjustment[];
  notices: TeamNoticeRecord[];
}

let mockIntegrity: MockIntegrityStore = { runs: {}, adjustments: [], notices: [] };

function resetMockIntegrity() {
  mockIntegrity = { runs: {}, adjustments: [], notices: [] };
}

function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mockAdjusted(score: number, penalty: number): number {
  if (penalty <= 0) return score;
  return Math.max(score - penalty, Math.min(score, 0));
}

function mockPenaltyFor(round: RoundCode, teamCode: string): number {
  return mockIntegrity.adjustments
    .filter((item) => item.round === round && item.team_code === teamCode && item.revoked_at === null)
    .reduce((sum, item) => sum + item.points, 0);
}

function mockStatusFor(match: number, thresholds: IntegrityThresholds): IntegrityStatus {
  if (match >= thresholds.flag) return "FLAGGED";
  if (match >= thresholds.review) return "REVIEW";
  return "OK";
}

function mockRun(round: RoundCode, thresholds: IntegrityThresholds): MockIntegrityRun {
  const checkedAt = new Date().toISOString();
  const submissions = TEAM_CODES.map((code, index): IntegritySubmission => {
    const rand = seeded(hashString(`${code}:${round}:integrity`));
    // Demo spread: the first team copies the look-ahead rule, every 11th team sits in the review band, the rest are honest.
    const match = index === 0 ? 1 : index % 11 === 3 ? 0.6 + rand() * 0.09 : 0.44 + rand() * 0.14;
    const rule = { rule_acc: 0.8, agreement: Number(match.toFixed(3)) };
    return {
      submission_id: `mock-sub-${code}-${round}`,
      team_id: code,
      team_code: code,
      team_name: RIVALS[index],
      stock: "STOCK_A",
      submission_no: 1,
      submitted_at: checkedAt,
      public_score: Number((match * 60 + rand() * 10).toFixed(2)),
      private_score: Number((40 + rand() * 40).toFixed(2)),
      status: mockStatusFor(match, thresholds),
      worst_rule: "next_open",
      worst_agreement: Number(match.toFixed(3)),
      note: "",
      rules: { next_open: rule, next_candle: rule, next_flow: rule, next_rsi: rule },
    };
  });
  return { checkedAt, thresholds, submissions };
}

function mockResults(round: RoundCode): IntegrityResults {
  const run = mockIntegrity.runs[round];
  if (!run) return { round, check_run_id: null, checked_at: null, thresholds: null, submissions: [], teams: [] };
  const teams: IntegrityTeam[] = run.submissions.map((sub) => {
    const suggested =
      sub.status === "FLAGGED"
        ? { points: 20, key: "WARNING_LOOKAHEAD" as const }
        : sub.status === "REVIEW"
          ? { points: 10, key: "WARNING_CHECK" as const }
          : { points: 0, key: null };
    const active = mockIntegrity.adjustments.find(
      (item) => item.round === round && item.team_code === sub.team_code && item.kind === "lookahead" && item.revoked_at === null,
    );
    const notices = mockIntegrity.notices.filter((item) => item.team_code === sub.team_code);
    return {
      team_id: sub.team_id,
      team_code: sub.team_code,
      team_name: sub.team_name,
      status: sub.status,
      submission_count: 1,
      submission_no: sub.submission_no,
      worst_submission_id: sub.submission_id,
      worst_rule: sub.worst_rule,
      worst_agreement: sub.worst_agreement,
      public_score: sub.public_score,
      private_score: sub.private_score,
      suggested_points: suggested.points,
      suggested_message_key: suggested.key,
      current_adjustment: active ? { id: active.id, points: active.points, created_at: active.created_at } : null,
      last_notice_at: notices.length ? notices[notices.length - 1].created_at : null,
    };
  });
  const order: Record<IntegrityStatus, number> = { FLAGGED: 0, REVIEW: 1, OK: 2, NO_FILE: 3, NO_TARGETS: 3 };
  teams.sort((a, b) => order[a.status] - order[b.status] || (b.worst_agreement ?? 0) - (a.worst_agreement ?? 0));
  return {
    round,
    check_run_id: `mock-run-${round}`,
    checked_at: run.checkedAt,
    thresholds: run.thresholds,
    submissions: run.submissions,
    teams,
  };
}

export const mockIntegrityBackend = {
  async run(token: string | null, payload: IntegrityRunRequest): Promise<IntegrityResults> {
    requireAdmin(token);
    if (payload.round === "R3") throw new ApiError("Round 3 is not checked", 400);
    if (!(payload.rule_min > 0 && payload.rule_min <= 1 && payload.review > 0 && payload.review <= payload.flag && payload.flag <= 1)) {
      throw new ApiError("Thresholds must be between 0 and 1, with review at or below flag.", 400);
    }
    mockIntegrity.runs[payload.round] = mockRun(payload.round, {
      flag: payload.flag,
      review: payload.review,
      rule_min: payload.rule_min,
    });
    return delay(mockResults(payload.round), 400);
  },

  async results(token: string | null, round: RoundCode): Promise<IntegrityResults> {
    requireAdmin(token);
    return delay(mockResults(round), 80);
  },

  async apply(token: string | null, payload: IntegrityApplyRequest): Promise<IntegrityApplyResult> {
    requireAdmin(token);
    const run = mockIntegrity.runs[payload.round];
    if (!run) throw new ApiError(`${payload.round} has no look-ahead check. Run the check first.`, 400);
    for (const item of payload.items) {
      if (!run.submissions.some((entry) => entry.team_code === item.team_code)) {
        throw new ApiError(`Team ${item.team_code} not found.`, 404);
      }
      if (!(item.points > 0 && item.points <= 100)) throw new ApiError("Points must be greater than 0 and at most 100.", 400);
      if (!item.message.trim()) throw new ApiError("Message is required.", 400);
    }
    const now = new Date().toISOString();
    const adjustments: ScoreAdjustment[] = [];
    const notices: TeamNoticeRecord[] = [];
    for (const item of payload.items) {
      const sub = run.submissions.find((entry) => entry.team_code === item.team_code)!;
      mockIntegrity.adjustments = mockIntegrity.adjustments.map((existing) =>
        existing.round === payload.round &&
        existing.team_code === item.team_code &&
        existing.kind === "lookahead" &&
        existing.revoked_at === null
          ? { ...existing, revoked_at: now, revoked_by: "admin" }
          : existing,
      );
      const adjustment: ScoreAdjustment = {
        id: mockId("adj"),
        team_code: item.team_code,
        team_name: sub.team_name,
        round: payload.round,
        kind: "lookahead",
        points: Number(item.points.toFixed(2)),
        reason: `Look-ahead check: ${sub.status} ${Math.round((sub.worst_agreement ?? 0) * 100)}%`,
        created_by: "admin",
        created_at: now,
        revoked_at: null,
        revoked_by: null,
      };
      const notice: TeamNoticeRecord = {
        id: mockId("notice"),
        team_code: item.team_code,
        team_name: sub.team_name,
        round: payload.round,
        message: item.message.trim(),
        created_by: "admin",
        created_at: now,
        acknowledged_at: null,
      };
      mockIntegrity.adjustments.push(adjustment);
      mockIntegrity.notices.push(notice);
      adjustments.push(adjustment);
      notices.push(notice);
    }
    return delay({ adjustments, notices }, 300);
  },

  async listAdjustments(token: string | null, round?: RoundCode): Promise<ScoreAdjustment[]> {
    requireAdmin(token);
    const rows = mockIntegrity.adjustments.filter((item) => !round || item.round === round);
    return delay([...rows].reverse(), 80);
  },

  async createAdjustment(token: string | null, payload: ScoreAdjustmentRequest): Promise<ScoreAdjustment> {
    requireAdmin(token);
    if (!(payload.points > 0 && payload.points <= 100)) throw new ApiError("Points must be greater than 0 and at most 100.", 400);
    const reason = payload.reason.trim();
    if (!reason) throw new ApiError("Reason is required.", 400);
    const adjustment: ScoreAdjustment = {
      id: mockId("adj"),
      team_code: payload.team_code,
      team_name: RIVALS[TEAM_CODES.indexOf(payload.team_code)] ?? payload.team_code,
      round: payload.round,
      kind: "manual",
      points: Number(payload.points.toFixed(2)),
      reason,
      created_by: "admin",
      created_at: new Date().toISOString(),
      revoked_at: null,
      revoked_by: null,
    };
    mockIntegrity.adjustments.push(adjustment);
    return delay(adjustment, 150);
  },

  async revokeAdjustment(token: string | null, id: string): Promise<ScoreAdjustment> {
    requireAdmin(token);
    const target = mockIntegrity.adjustments.find((item) => item.id === id);
    if (!target) throw new ApiError("Deduction not found.", 404);
    if (target.revoked_at) throw new ApiError("This deduction has already been revoked.", 400);
    target.revoked_at = new Date().toISOString();
    target.revoked_by = "admin";
    return delay({ ...target }, 150);
  },

  async listNotices(token: string | null, teamCode?: string): Promise<TeamNoticeRecord[]> {
    requireAdmin(token);
    const rows = mockIntegrity.notices.filter((item) => !teamCode || item.team_code === teamCode);
    return delay([...rows].reverse(), 80);
  },

  async createNotice(token: string | null, payload: { team_code: string; message: string }): Promise<TeamNoticeRecord> {
    requireAdmin(token);
    const message = payload.message.trim();
    if (!message) throw new ApiError("Message is required.", 400);
    const notice: TeamNoticeRecord = {
      id: mockId("notice"),
      team_code: payload.team_code,
      team_name: RIVALS[TEAM_CODES.indexOf(payload.team_code)] ?? payload.team_code,
      round: null,
      message,
      created_by: "admin",
      created_at: new Date().toISOString(),
      acknowledged_at: null,
    };
    mockIntegrity.notices.push(notice);
    return delay(notice, 150);
  },
};

