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
  maxUploadBytes: numberFromEnv(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES, 1024 * 1024),
  predictionRows: PREDICTION_ROWS,
};

export const endpoints = {
  auth: "/api/auth",
  status: "/api/status",
  download: "/api/data/download",
  upload: "/api/upload",
};

export const adminEndpoints = {
  auth: "/api/admin/auth",
  status: "/api/admin/status",
  timer: "/api/admin/timer",
  round: "/api/admin/round",
  flashCrash: "/api/admin/flash-crash",
  leaderboard: "/api/admin/leaderboard",
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
  position: {
    header: "timestamp,position",
    example: ["1,0.85", "2,-0.40", "3,0.00"],
    notes: [
      "position between -1.0 (short) and +1.0 (long)",
      `exactly ${PREDICTION_ROWS} rows, timestamps 1 to ${PREDICTION_ROWS}`,
    ],
  },
} as const;
