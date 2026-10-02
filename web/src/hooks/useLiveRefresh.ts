import { useEffect } from "react";
import { config } from "@/lib/config";
import { MOCK_STATE_KEY } from "@/lib/mock";

export const STATUS_CHANGED_EVENT = "qe:status-changed";

export function useLiveRefresh(refresh: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onChanged = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (config.useMocks && event.key === MOCK_STATE_KEY) refresh();
    };
    window.addEventListener(STATUS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(STATUS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, refresh]);
}
