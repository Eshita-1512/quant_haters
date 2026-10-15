import { useSyncExternalStore } from "react";

const BRUTE_FORCE_KEY = "qe.theme.bruteforce";
const BRUTE_FORCE_EVENT = "qe:bruteforce";

function readBruteForce(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = window.localStorage.getItem(BRUTE_FORCE_KEY);
    // Default to enabled (true) if not explicitly set to "false"
    return val !== "false";
  } catch {
    return true;
  }
}

function writeBruteForce(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRUTE_FORCE_KEY, enabled ? "true" : "false");
  } catch {}
  applyBruteForceDom(enabled);
  window.dispatchEvent(new Event(BRUTE_FORCE_EVENT));
}

export function applyBruteForceDom(enabled: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (enabled) {
    root.classList.add("theme-bruteforce");
    root.setAttribute("data-theme", "bruteforce");
  } else {
    root.classList.remove("theme-bruteforce");
    root.removeAttribute("data-theme");
  }
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(BRUTE_FORCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(BRUTE_FORCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useBruteForceTheme() {
  const enabled = useSyncExternalStore(
    subscribe,
    readBruteForce,
    () => true // SSR default
  );

  const toggle = () => {
    writeBruteForce(!enabled);
  };

  const setEnabled = (val: boolean) => {
    writeBruteForce(val);
  };

  return { enabled, toggle, setEnabled };
}
