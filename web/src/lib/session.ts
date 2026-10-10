import { useSyncExternalStore } from "react";

const TOKEN_KEY = "qe.token";
const TEAM_KEY = "qe.team";
const ACK_KEY = "qe.introSeen";
const ADMIN_TOKEN_KEY = "qe.admin.token";
const ADMIN_USER_KEY = "qe.admin.user";
const SESSION_EVENT = "qe:session";

// Team sessions live in sessionStorage so they end with the tab; a returning visitor
// must log in again. Admin sessions keep using localStorage.
function store(key: string): Storage {
  return key.startsWith("qe.admin.") ? window.localStorage : window.sessionStorage;
}

function read(key: string): string | null {
  try {
    return store(key).getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) store(key).removeItem(key);
    else store(key).setItem(key, value);
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

function useStoredValue(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => undefined,
  );
}

export function useSession() {
  const token = useStoredValue(TOKEN_KEY);
  const team = useStoredValue(TEAM_KEY);
  return { hydrated: token !== undefined, token: token ?? null, team: team ?? null };
}

export function useAdminSession() {
  const token = useStoredValue(ADMIN_TOKEN_KEY);
  const user = useStoredValue(ADMIN_USER_KEY);
  return { hydrated: token !== undefined, token: token ?? null, user: user ?? null };
}

export function useIntroSeen(): string | null | undefined {
  return useStoredValue(ACK_KEY);
}

export const session = {
  getToken: () => read(TOKEN_KEY),
  getTeam: () => read(TEAM_KEY),
  save(token: string, team: string) {
    write(TOKEN_KEY, token);
    write(TEAM_KEY, team);
  },
  setTeam(team: string) {
    write(TEAM_KEY, team);
  },
  clear() {
    write(TOKEN_KEY, null);
    write(TEAM_KEY, null);
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
  getToken: () => read(ADMIN_TOKEN_KEY),
  save(token: string, user: string) {
    write(ADMIN_TOKEN_KEY, token);
    write(ADMIN_USER_KEY, user);
  },
  clear() {
    write(ADMIN_TOKEN_KEY, null);
    write(ADMIN_USER_KEY, null);
  },
};
