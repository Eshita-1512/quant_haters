import { useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import Switch from "@/components/admin/Switch";
import { adminApi } from "@/lib/api";
import type { AdminStatus } from "@/lib/types";

type Run = (label: string, action: () => Promise<AdminStatus>) => Promise<boolean>;

interface FlashCrashControlProps {
  status: AdminStatus;
  busy: string | null;
  run: Run;
}

export default function FlashCrashControl({ status, busy, run }: FlashCrashControlProps) {
  const roundTwo = status.rounds.find((round) => round.code === "R2");
  const [message, setMessage] = useState("");
  const [minutes, setMinutes] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const active = status.flash_crash_active;
  const locked = active && status.current_round === "R2";
  const available = !active && status.current_round === "R1";
  const durationMinutes = minutes ?? String(Math.round((roundTwo?.duration_seconds ?? 6300) / 60));

  const apply = async () => {
    await run("Flash crash ON", () =>
      adminApi.flashCrash({
        active: true,
        message: message.trim() || undefined,
        duration_seconds: Math.max(1, Number(durationMinutes) || 0) * 60,
      }),
    );
    setConfirm(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        className={`flex items-center justify-between gap-4 rounded-md border p-4 transition-colors duration-500 ${
          active ? "border-down/60 bg-down-soft" : "border-line-strong bg-panel-2"
        }`}
      >
        <div>
          <p className={`text-lg font-bold tracking-tight ${active ? "text-down" : ""}`}>
            {active ? "CRASH LIVE" : "Market calm"}
          </p>
          <p className="text-xs text-muted">
            {locked
              ? `Locked on for Round 2${
                  status.flash_crash_triggered_at
                    ? `, triggered ${new Date(status.flash_crash_triggered_at).toLocaleTimeString()}`
                    : ""
                }`
              : active
                ? "Crash live"
                : status.current_round === "R3"
                  ? "Round 3 runs on the recovered market"
                  : status.current_round === "R1"
                    ? "Participants see the normal market"
                    : "The crash can only be triggered during Round 1"}
          </p>
        </div>
        <Switch
          checked={active}
          label="Flash crash"
          disabled={busy !== null || !available}
          onChange={(next) => setConfirm(next)}
        />
      </div>

      {available && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Alert message (optional)</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={280}
              placeholder="The market has crashed. Download the crash data and adapt."
              className="resize-none rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">Round 2 duration</span>
            <span className="flex items-center gap-1 rounded-md border border-line-strong bg-bg px-2 focus-within:border-accent">
              <input
                value={durationMinutes}
                onChange={(event) => setMinutes(event.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                aria-label="Round 2 duration in minutes"
                className="h-8 w-12 bg-transparent text-right font-mono text-sm outline-none"
              />
              <span className="font-mono text-[10px] text-faint">min</span>
            </span>
          </label>
        </>
      )}

      {locked && (
        <p className="text-xs text-muted">The crash stays on for all of Round 2. To undo it, restart Round 1.</p>
      )}

      {active && status.flash_crash_message && (
        <p className="rounded-lg border border-line bg-bg p-3 text-sm text-muted">{status.flash_crash_message}</p>
      )}

      {confirm && (
        <ConfirmDialog
          title="Trigger the flash crash?"
          confirmLabel="Crash the market"
          tone="danger"
          busy={busy !== null}
          onCancel={() => setConfirm(false)}
          onConfirm={apply}
        >
          Every team sees the crash sequence on their next refresh. Round 1 closes and Round 2 starts with{" "}
          {durationMinutes} minutes on the clock.
        </ConfirmDialog>
      )}
    </div>
  );
}
