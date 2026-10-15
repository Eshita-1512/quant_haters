import { useEffect } from "react";
import { useRouter } from "next/router";
import { SESSION_EVENT, adminSession, session } from "@/lib/session";

// Logs a team or admin out when its 7-hour expiry passes, without waiting for an API call to fail.
export function useSessionExpiry() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Clears any session whose expiry has passed, then re-arms the timer for what is still live.
    const sweep = () => {
      const teamExpiresAt = session.getExpiresAt();
      if (teamExpiresAt !== null && Date.now() >= teamExpiresAt) {
        session.clear();
        // Deferred so it lands after useRequireAuth's own redirect to /login, keeping the expired banner.
        if (router.pathname === "/dashboard") setTimeout(() => router.replace("/login?expired=1"), 0);
      }
      const adminExpiresAt = adminSession.getExpiresAt();
      if (adminExpiresAt !== null && Date.now() >= adminExpiresAt) adminSession.clear();
      arm();
    };

    // Timers can fire late in background tabs and after sleep, so sweep also runs on visibility and focus.
    const arm = () => {
      clearTimeout(timer);
      const now = Date.now();
      const expiries = [session.getExpiresAt(), adminSession.getExpiresAt()].filter(
        (value): value is number => value !== null && value > now,
      );
      if (expiries.length === 0) return;
      const next = Math.min(...expiries);
      timer = setTimeout(sweep, next - now);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") sweep();
    };

    arm();
    window.addEventListener(SESSION_EVENT, arm);
    window.addEventListener("storage", arm);
    window.addEventListener("focus", sweep);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(SESSION_EVENT, arm);
      window.removeEventListener("storage", arm);
      window.removeEventListener("focus", sweep);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
}
