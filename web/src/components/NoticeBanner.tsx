import { useState } from "react";
import { api } from "@/lib/api";
import type { TeamNotice } from "@/lib/types";

interface NoticeBannerProps {
  notice: TeamNotice;
  onAcknowledged: () => Promise<void>;
}

export default function NoticeBanner({ notice, onAcknowledged }: NoticeBannerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.ackNotice(notice.id);
      await onAcknowledged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not acknowledge the message.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className="rounded-md border border-warn/50 bg-warn-soft px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-warn">Message from the organizers</p>
      <p className="mt-1 text-sm text-text">{notice.message}</p>
      <button
        type="button"
        onClick={acknowledge}
        disabled={busy}
        className="mt-3 rounded-md border border-warn/50 px-3 py-1.5 font-mono text-xs text-warn transition-colors hover:bg-warn/10 disabled:opacity-50"
      >
        {busy ? "Saving..." : "Acknowledge"}
      </button>
      {error && <p className="mt-2 text-xs text-down">{error}</p>}
    </div>
  );
}
