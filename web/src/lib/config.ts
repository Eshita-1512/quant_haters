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
};

export const uploadFieldName = "file";

export const csvFormats = {
  prediction: {
    header: "timestamp,prediction,confidence",
    example: ["1,1,0.82", "2,0,0.63", "3,1,0.55"],
    notes: [
      "prediction must be 0 or 1",
      "confidence is optional, between 0.0 and 1.0",
      `exactly ${PREDICTION_ROWS} rows, timestamps 1 to ${PREDICTION_ROWS}`,
    ],
  },
  signal: {
    header: "timestamp,signal",
    example: ["1,0.85", "2,-0.40", "3,0.00"],
    notes: [
      "signal between -1.0 (full short) and +1.0 (full long)",
      "0.0 means flat, no position",
      `exactly ${PREDICTION_ROWS} rows, timestamps 1 to ${PREDICTION_ROWS}`,
    ],
  },
} as const;
