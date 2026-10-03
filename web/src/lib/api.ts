import { adminEndpoints, config, endpoints, uploadFieldName } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { mockAdminBackend, mockBackend } from "@/lib/mock";
import { adminSession, session } from "@/lib/session";
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
  LeaderboardEntry,
  RoundCode,
  SnapshotResult,
  StartRoundRequest,
  TimerRequest,
  TokenResponse,
  UploadSuccess,
} from "@/lib/types";

export { ApiError };

export const UNAUTHORIZED_EVENT = "qe:unauthorized";

type Scope = "team" | "admin" | "none";

interface RequestOptions {
  method?: "GET" | "POST";
  body?: BodyInit;
  json?: unknown;
  scope?: Scope;
  timeoutMs?: number;
}

function handleUnauthorized(scope: Scope) {
  if (scope === "admin") {
    adminSession.clear();
    return;
  }
  if (scope === "team") {
    session.clear();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

function tokenFor(scope: Scope): string | null {
  if (scope === "team") return session.getToken();
  if (scope === "admin") return adminSession.getToken();
  return null;
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.detail === "string" && record.detail) return record.detail;
  }
  return `Request failed with status ${status}.`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, json, scope = "team", timeoutMs = 15000 } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const token = tokenFor(scope);
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The server took too long to respond. Please try again.", 0);
    }
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (response.status === 401) handleUnauthorized(scope);

  const isErrorBody =
    parsed !== null && typeof parsed === "object" && (parsed as Record<string, unknown>).status === "error";

  if (!response.ok || isErrorBody) {
    throw new ApiError(extractMessage(parsed, response.status), response.status);
  }

  return parsed as T;
}

async function runMock<T>(scope: Scope, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) handleUnauthorized(scope);
    throw error;
  }
}

async function login(path: string, payload: AuthRequest | AdminAuthRequest): Promise<AuthResponse> {
  const { access_token } = await request<TokenResponse>(path, { method: "POST", json: payload, scope: "none" });
  if (!access_token) throw new ApiError("The server did not return a session token.", 0);
  return { token: access_token };
}

function roundNumber(round: RoundCode): number {
  return Number(round.slice(1));
}

// The backend returns download links relative to its own origin.
function backendUrl(url: string): string {
  return url.startsWith("/") ? `${config.apiBaseUrl}${url}` : url;
}

const httpApi = {
  login: (payload: AuthRequest) => login(endpoints.auth, payload),
  getStatus: () => request<EventStatus>(endpoints.status),
  getDownload: async () => {
    const download = await request<DownloadResponse>(endpoints.download);
    return { ...download, download_url: backendUrl(download.download_url) };
  },
  upload: (file: File, round: RoundCode) => {
    const form = new FormData();
    form.append(uploadFieldName, file);
    return request<UploadSuccess>(endpoints.upload(roundNumber(round)), {
      method: "POST",
      body: form,
      timeoutMs: 60000,
    });
  },
  getLeaderboard: async () => {
    const entries = await request<Array<Omit<LeaderboardEntry, "score"> & { score: number | string }>>(
      endpoints.leaderboard,
      { scope: "none" },
    );
    return entries.map((entry) => ({ ...entry, score: Number(entry.score) }));
  },
};

const mockApi: typeof httpApi = {
  login: (payload) => runMock("none", () => mockBackend.login(payload)),
  getStatus: () => runMock("team", () => mockBackend.getStatus(session.getToken())),
  getDownload: () => runMock("team", () => mockBackend.getDownload(session.getToken())),
  upload: (file, round) => runMock("team", () => mockBackend.upload(session.getToken(), file, round)),
  getLeaderboard: () => runMock("none", () => []),
};

type RawAdminStatus = Omit<AdminStatus, "current_round"> & { current_round: RoundCode | null };
type RawLeaderboardEntry = Omit<AdminLeaderboardEntry, "score"> & { score: number | string };

async function getAdminStatus(): Promise<AdminStatus> {
  return checkAdminStatus(await request<RawAdminStatus>(adminEndpoints.status, { scope: "admin" }));
}

function checkAdminStatus(status: RawAdminStatus): AdminStatus {
  if (status.current_round === null) {
    throw new ApiError("The server has no current round. Seed the database to configure the event.", 409);
  }
  return status as AdminStatus;
}

const httpAdminApi = {
  login: (payload: AdminAuthRequest) => login(adminEndpoints.auth, payload),
  getStatus: getAdminStatus,
  timer: async (payload: TimerRequest) =>
    checkAdminStatus(
      await request<RawAdminStatus>(adminEndpoints.timer, { method: "POST", json: payload, scope: "admin" }),
    ),
  startRound: async (payload: StartRoundRequest) =>
    checkAdminStatus(
      await request<RawAdminStatus>(adminEndpoints.round, { method: "POST", json: payload, scope: "admin" }),
    ),
  // The flash crash endpoint returns a short receipt, so read the full status afterwards.
  flashCrash: async (payload: FlashCrashRequest) => {
    await request<unknown>(adminEndpoints.flashCrash, { method: "POST", json: payload, scope: "admin" });
    return getAdminStatus();
  },
  // Scores arrive as decimal strings to keep their precision.
  getLeaderboard: async (round: RoundCode) => {
    const entries = await request<RawLeaderboardEntry[]>(
      `${adminEndpoints.leaderboard}?round=${encodeURIComponent(round)}`,
      { scope: "admin" },
    );
    return entries.map((entry): AdminLeaderboardEntry => ({ ...entry, score: Number(entry.score) }));
  },
  publishSnapshot: () => request<SnapshotResult>(adminEndpoints.snapshot, { method: "POST", scope: "admin" }),
  runFinalBacktest: () =>
    request<FinalBacktestResult>(adminEndpoints.finalBacktest, { method: "POST", scope: "admin", timeoutMs: 60000 }),
};

const mockAdminApi: typeof httpAdminApi = {
  login: (payload) => runMock("none", () => mockAdminBackend.login(payload)),
  getStatus: () => runMock("admin", () => mockAdminBackend.getStatus(adminSession.getToken())),
  timer: (payload) => runMock("admin", () => mockAdminBackend.timer(adminSession.getToken(), payload)),
  startRound: (payload) => runMock("admin", () => mockAdminBackend.startRound(adminSession.getToken(), payload)),
  flashCrash: (payload) => runMock("admin", () => mockAdminBackend.flashCrash(adminSession.getToken(), payload)),
  getLeaderboard: (round) => runMock("admin", () => mockAdminBackend.getLeaderboard(adminSession.getToken(), round)),
  publishSnapshot: () => runMock("admin", () => mockAdminBackend.publishSnapshot(adminSession.getToken())),
  runFinalBacktest: () => runMock("admin", () => mockAdminBackend.runFinalBacktest(adminSession.getToken())),
};

export const api = config.useMocks ? mockApi : httpApi;
export const adminApi = config.useMocks ? mockAdminApi : httpAdminApi;
