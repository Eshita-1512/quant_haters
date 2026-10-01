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
  const [confirm, setConfirm] = useState<"on" | "off" | null>(null);
  const active = status.flash_crash_active;
  const locked = active && status.current_round === "R2";
  const durationMinutes = minutes ?? String(Math.round((roundTwo?.duration_seconds ?? 6300) / 60));

  const apply = async () => {
    if (confirm === "on") {
      await run("Flash crash ON", () =>
        adminApi.flashCrash({
          active: true,
          message: message.trim() || undefined,
          duration_seconds: Math.max(1, Number(durationMinutes) || 0) * 60,
        }),
      );
    } else if (confirm === "off") {
      await run("Flash crash OFF", () => adminApi.flashCrash({ active: false }));
    }
    setConfirm(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors duration-500 ${
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
                  : "Participants see the normal market"}
          </p>
        </div>
        <Switch
          checked={active}
          label="Flash crash"
          disabled={busy !== null || locked}
          onChange={(next) => setConfirm(next ? "on" : "off")}
        />
      </div>

      {!active && (
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
          title={confirm === "on" ? "Trigger the flash crash?" : "Turn the flash crash off?"}
          confirmLabel={confirm === "on" ? "Crash the market" : "Turn off"}
          tone={confirm === "on" ? "danger" : "default"}
          busy={busy !== null}
          onCancel={() => setConfirm(null)}
          onConfirm={apply}
        >
          {confirm === "on"
            ? `Every team sees the crash sequence on their next refresh. ${
                status.current_round === "R3" ? "Round 3 closes and everyone moves back to Round 2" : "Round 1 closes and Round 2 starts"
              } with ${durationMinutes} minutes on the clock.`
            : "Participants leave crash mode and return to the normal theme. The Round 2 timer keeps running."}
        </ConfirmDialog>
      )}
    </div>
  );
}
