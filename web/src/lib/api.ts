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
  FlashCrashRequest,
  RoundCode,
  StartRoundRequest,
  TimerRequest,
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

const httpApi = {
  login: (payload: AuthRequest) =>
    request<AuthResponse>(endpoints.auth, { method: "POST", json: payload, scope: "none" }),
  getStatus: () => request<EventStatus>(endpoints.status),
  getDownload: () => request<DownloadResponse>(endpoints.download),
  upload: (file: File) => {
    const form = new FormData();
    form.append(uploadFieldName, file);
    return request<UploadSuccess>(endpoints.upload, { method: "POST", body: form, timeoutMs: 60000 });
  },
};

const mockApi: typeof httpApi = {
  login: (payload) => runMock("none", () => mockBackend.login(payload)),
  getStatus: () => runMock("team", () => mockBackend.getStatus(session.getToken())),
  getDownload: () => runMock("team", () => mockBackend.getDownload(session.getToken())),
  upload: (file) => runMock("team", () => mockBackend.upload(session.getToken(), file)),
};

const httpAdminApi = {
  login: (payload: AdminAuthRequest) =>
    request<AuthResponse>(adminEndpoints.auth, { method: "POST", json: payload, scope: "none" }),
  getStatus: () => request<AdminStatus>(adminEndpoints.status, { scope: "admin" }),
  timer: (payload: TimerRequest) =>
    request<AdminStatus>(adminEndpoints.timer, { method: "POST", json: payload, scope: "admin" }),
  startRound: (payload: StartRoundRequest) =>
    request<AdminStatus>(adminEndpoints.round, { method: "POST", json: payload, scope: "admin" }),
  flashCrash: (payload: FlashCrashRequest) =>
    request<AdminStatus>(adminEndpoints.flashCrash, { method: "POST", json: payload, scope: "admin" }),
  getLeaderboard: (round: RoundCode) =>
    request<AdminLeaderboardEntry[]>(`${adminEndpoints.leaderboard}?round=${encodeURIComponent(round)}`, {
      scope: "admin",
    }),
};

const mockAdminApi: typeof httpAdminApi = {
  login: (payload) => runMock("none", () => mockAdminBackend.login(payload)),
  getStatus: () => runMock("admin", () => mockAdminBackend.getStatus(adminSession.getToken())),
  timer: (payload) => runMock("admin", () => mockAdminBackend.timer(adminSession.getToken(), payload)),
  startRound: (payload) => runMock("admin", () => mockAdminBackend.startRound(adminSession.getToken(), payload)),
  flashCrash: (payload) => runMock("admin", () => mockAdminBackend.flashCrash(adminSession.getToken(), payload)),
  getLeaderboard: (round) => runMock("admin", () => mockAdminBackend.getLeaderboard(adminSession.getToken(), round)),
};

export const api = config.useMocks ? mockApi : httpApi;
export const adminApi = config.useMocks ? mockAdminApi : httpAdminApi;
