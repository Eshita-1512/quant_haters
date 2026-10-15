import { useSyncExternalStore } from "react";

const TOKEN_KEY = "qe.token";
const TEAM_KEY = "qe.team";
const EXPIRES_KEY = "qe.expiresAt";
const ACK_KEY = "qe.introSeen";
const ADMIN_TOKEN_KEY = "qe.admin.token";
const ADMIN_USER_KEY = "qe.admin.user";
const ADMIN_EXPIRES_KEY = "qe.admin.expiresAt";
export const SESSION_EVENT = "qe:session";

// Team and admin sessions live in localStorage so they survive closing the tab, refreshing and
// opening new tabs. How long a session lasts is decided by the stored expiry (epoch ms), not by
// how long the storage lives.
function store(): Storage {
  return window.localStorage;
}

function read(key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {}
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(SESSION_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function expiryOf(expiresKey: string): number | null {
  const raw = read(expiresKey);
  if (raw === null) return null;
  const expiresAt = Number(raw);
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

// A missing or malformed expiry counts as expired.
function isLive(expiresKey: string): boolean {
  const expiresAt = expiryOf(expiresKey);
  return expiresAt !== null && Date.now() < expiresAt;
}

function useStoredValue(key: string, expiresKey?: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => {
      const value = read(key);
      if (value === null || (expiresKey !== undefined && !isLive(expiresKey))) return null;
      return value;
    },
    () => undefined,
  );
}

function useStoredPlain(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => undefined,
  );
}

export function useSession() {
  const token = useStoredValue(TOKEN_KEY, EXPIRES_KEY);
  const team = useStoredPlain(TEAM_KEY);
  return { hydrated: token !== undefined, token: token ?? null, team: team ?? null };
}

export function useAdminSession() {
  const token = useStoredValue(ADMIN_TOKEN_KEY, ADMIN_EXPIRES_KEY);
  const user = useStoredPlain(ADMIN_USER_KEY);
  return { hydrated: token !== undefined, token: token ?? null, user: user ?? null };
}

export function useIntroSeen(): string | null | undefined {
  return useStoredPlain(ACK_KEY);
}

export const session = {
  getToken: () => {
    const token = read(TOKEN_KEY);
    if (token !== null && !isLive(EXPIRES_KEY)) {
      session.clear();
      return null;
    }
    return token;
  },
  getTeam: () => read(TEAM_KEY),
  getExpiresAt: () => expiryOf(EXPIRES_KEY),
  save(token: string, team: string, expiresAt: number) {
    write(TOKEN_KEY, token);
    write(TEAM_KEY, team);
    write(EXPIRES_KEY, String(expiresAt));
  },
  setTeam(team: string) {
    write(TEAM_KEY, team);
  },
  clear() {
    write(TOKEN_KEY, null);
    write(TEAM_KEY, null);
    write(EXPIRES_KEY, null);
    write(ACK_KEY, null);
  },
  markIntroSeen(round: string) {
    write(ACK_KEY, round);
  },
  resetIntroSeen() {
    if (read(ACK_KEY) !== null) write(ACK_KEY, null);
  },
};

export const adminSession = {
  getToken: () => {
    const token = read(ADMIN_TOKEN_KEY);
    if (token !== null && !isLive(ADMIN_EXPIRES_KEY)) {
      adminSession.clear();
      return null;
    }
    return token;
  },
  getExpiresAt: () => expiryOf(ADMIN_EXPIRES_KEY),
  save(token: string, user: string, expiresAt: number) {
    write(ADMIN_TOKEN_KEY, token);
    write(ADMIN_USER_KEY, user);
    write(ADMIN_EXPIRES_KEY, String(expiresAt));
  },
  clear() {
    write(ADMIN_TOKEN_KEY, null);
    write(ADMIN_USER_KEY, null);
    write(ADMIN_EXPIRES_KEY, null);
  },
};
