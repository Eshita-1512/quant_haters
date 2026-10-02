import { useCallback, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import type { EventStatus } from "@/lib/types";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePolling } from "@/hooks/usePolling";

export interface EventStatusState {
  status: EventStatus | null;
  error: string | null;
  clockOffsetMs: number;
  refresh: () => Promise<void>;
}

export function useEventStatus(enabled: boolean): EventStatusState {
  const [status, setStatus] = useState<EventStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const load = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const next = await api.getStatus();
      const receivedAt = Date.now();
      const serverTime = Date.parse(next.server_time);
      if (Number.isFinite(serverTime)) {
        setClockOffsetMs(serverTime - (sentAt + receivedAt) / 2);
      }
      setStatus(next);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(err instanceof Error ? err.message : "Could not load event status.");
    }
  }, []);

  const refresh = usePolling(load, config.statusPollMs, enabled);
  useLiveRefresh(refresh, enabled);

  return { status, error, clockOffsetMs, refresh };
}
