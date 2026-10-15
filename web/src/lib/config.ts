import type { SubmissionType } from "./types";

const PREDICTION_ROWS = 50;

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  useMocks: process.env.NEXT_PUBLIC_USE_MOCKS !== "false",
  apiBaseUrl: (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, ""),
  statusPollMs: numberFromEnv(process.env.NEXT_PUBLIC_STATUS_POLL_MS, 5000),
  adminPollMs: numberFromEnv(process.env.NEXT_PUBLIC_ADMIN_POLL_MS, 3000),
  maxUploadBytes: numberFromEnv(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES, 1_000_000),
  predictionRows: PREDICTION_ROWS,
};

export const endpoints = {
  auth: "/api/v1/auth/login",
  status: "/api/v1/event/status",
  download: "/api/v1/team/data",
  upload: (roundNumber: number) => `/api/v1/submit/round/${roundNumber}`,
  leaderboard: "/api/v1/leaderboard",
  cumulativeLeaderboard: "/api/v1/leaderboard/cumulative",
  finalResults: "/api/v1/leaderboard/final-results",
  teamMe: "/api/v1/team/me",
  teamName: "/api/v1/team/name",
  ackNotice: (id: string) => `/api/v1/team/notices/${encodeURIComponent(id)}/ack`,
};

export const adminEndpoints = {
  auth: "/api/v1/auth/admin/login",
  status: "/api/v1/admin/status",
  timer: "/api/v1/admin/timer",
  round: "/api/v1/admin/round",
  flashCrash: "/api/v1/admin/flash-crash",
  leaderboard: "/api/v1/admin/leaderboard",
  snapshot: "/api/v1/admin/leaderboard/snapshot",
  finalBacktest: "/api/v1/admin/final-backtest",
  reset: "/api/v1/admin/reset",
  integrityRun: "/api/v1/admin/integrity/run",
  integrityResults: "/api/v1/admin/integrity/results",
  integrityApply: "/api/v1/admin/integrity/apply",
  integrityAdjustments: "/api/v1/admin/integrity/adjustments",
  integrityRevoke: (id: string) => `/api/v1/admin/integrity/adjustments/${encodeURIComponent(id)}/revoke`,
  integrityNotices: "/api/v1/admin/integrity/notices",
};

export const uploadFieldName = "file";

// Must match WARNING_LOOKAHEAD and WARNING_CHECK in quant_haters-maahnal/app/services/lookahead.py.
export const integrityMessages = {
  WARNING_LOOKAHEAD:
    "Your predictions match a look-ahead pattern: your model appears to be using data from later rows instead of predicting. 20 points have been deducted for this round. Predictions for each row must only use that row and earlier rows.",
  WARNING_CHECK:
    "Please make sure your model is not using look-ahead bias. Predictions for each row must only use that row and earlier rows. 10 points have been deducted for this round.",
} as const;

// R1 prediction timestamps: 801–850
// R2 prediction timestamps: 851–900
// R3 signal timestamps:     851–900
const R1_START = 801;
const R2_START = 851;
const R3_START = 851;

export function getCsvFormat(type: SubmissionType, round?: string) {
  const isR2 = round === "R2" || round === "2";
  const start = type === "signal" ? R3_START : isR2 ? R2_START : R1_START;
  const end = start + PREDICTION_ROWS - 1;

  if (type === "signal") {
    return {
      header: "timestamp,signal",
      example: [
        `${start},0.85`,
        `${start + 1},-0.40`,
        `${start + 2},0.00`,
      ],
      notes: [
        "signal between -1.0 (full short) and +1.0 (full long)",
        "0.0 means flat, no position",
        `exactly ${PREDICTION_ROWS} rows, timestamps ${start} to ${end}`,
      ],
    };
  }

  return {
    header: "timestamp,prediction,confidence",
    example: [
      `${start},1,0.82`,
      `${start + 1},0,0.63`,
      `${start + 2},1,0.55`,
    ],
    notes: [
      "prediction must be 0 or 1",
      "confidence is optional, between 0.0 and 1.0",
      `exactly ${PREDICTION_ROWS} rows, timestamps ${start} to ${end}`,
    ],
  };
}

export const csvFormats = {
  prediction: getCsvFormat("prediction", "R1"),
  predictionR2: getCsvFormat("prediction", "R2"),
  signal: getCsvFormat("signal", "R3"),
} as const;
