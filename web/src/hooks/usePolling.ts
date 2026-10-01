import { useCallback, useEffect, useRef } from "react";

export function usePolling(task: () => Promise<void>, intervalMs: number, enabled = true) {
  const taskRef = useRef(task);
  const inFlight = useRef(false);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await taskRef.current();
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === "visible") await run();
        if (!cancelled) schedule();
      }, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };

    run();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, run]);

  return run;
}
