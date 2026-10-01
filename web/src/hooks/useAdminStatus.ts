import { useCallback, useState } from "react";
import { adminApi, ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import type { AdminStatus } from "@/lib/types";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePolling } from "@/hooks/usePolling";

export function useAdminStatus(enabled: boolean) {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const accept = useCallback((next: AdminStatus, sentAt: number) => {
    const receivedAt = Date.now();
    const serverTime = Date.parse(next.server_time);
    if (Number.isFinite(serverTime)) setClockOffsetMs(serverTime - (sentAt + receivedAt) / 2);
    setStatus(next);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    const sentAt = Date.now();
    try {
      accept(await adminApi.getStatus(), sentAt);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(err instanceof Error ? err.message : "Could not load event status.");
    }
  }, [accept]);

  const refresh = usePolling(load, config.adminPollMs, enabled);
  useLiveRefresh(refresh, enabled);

  const apply = useCallback(
    async (action: () => Promise<AdminStatus>) => {
      const sentAt = Date.now();
      const next = await action();
      accept(next, sentAt);
      return next;
    },
    [accept],
  );

  return { status, error, clockOffsetMs, refresh, apply };
}
