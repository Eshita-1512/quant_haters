import { useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { adminApi } from "@/lib/api";
import { phaseLabels } from "@/lib/format";
import type { AdminRound, AdminStatus, RoundCode } from "@/lib/types";

type Run = (label: string, action: () => Promise<AdminStatus>) => Promise<boolean>;

interface RoundControlsProps {
  status: AdminStatus;
  busy: string | null;
  run: Run;
}

const phaseTone: Record<AdminRound["phase"], string> = {
  scheduled: "text-faint border-line-strong",
  live: "text-up border-up/40 bg-up-soft",
  flash_crash: "text-down border-down/50 bg-down-soft",
  paused: "text-warn border-warn/40 bg-warn-soft",
  completed: "text-muted border-line-strong",
};

export default function RoundControls({ status, busy, run }: RoundControlsProps) {
  const [drafts, setDrafts] = useState<Partial<Record<RoundCode, string>>>({});
  const [pending, setPending] = useState<AdminRound | null>(null);

  const minutesFor = (round: AdminRound) => drafts[round.code] ?? String(Math.round(round.duration_seconds / 60));

  const start = async (round: AdminRound) => {
    const minutes = Number(minutesFor(round));
    if (!(minutes > 0)) return;
    await run(`Started ${round.code} (${minutes} min)`, () =>
      adminApi.startRound({ round: round.code, duration_seconds: Math.round(minutes * 60) }),
    );
    setPending(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {status.rounds.map((round) => {
        const current = round.code === status.current_round;
        return (
          <div
            key={round.code}
            className={`flex flex-col gap-3 rounded-lg border px-3 py-3 ${current ? "border-line-strong bg-panel-2" : "border-line"}`}
          >
            <div className="flex items-center gap-3">
              <span className="w-7 font-mono text-sm font-semibold">{round.code}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{round.name.replace(/^Round \d+: /, "")}</p>
                <p className="text-xs text-muted">{round.submission_type === "position" ? "Positions" : "Predictions"}</p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${phaseTone[round.phase]}`}
              >
                {phaseLabels[round.phase]}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <label className="flex items-center gap-1 rounded-md border border-line-strong bg-bg px-2 focus-within:border-accent">
                <input
                  value={minutesFor(round)}
                  onChange={(event) =>
                    setDrafts((previous) => ({ ...previous, [round.code]: event.target.value.replace(/\D/g, "").slice(0, 3) }))
                  }
                  inputMode="numeric"
                  aria-label={`${round.code} duration in minutes`}
                  className="h-8 w-10 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="font-mono text-[10px] text-faint">min</span>
              </label>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setPending(round)}
                className="h-8 rounded-md border border-line-strong px-3 text-xs font-medium transition-colors hover:border-text disabled:opacity-40"
              >
                {current ? "Restart" : round.code === "R2" ? "Start + crash" : "Start"}
              </button>
            </div>
          </div>
        );
      })}
      <p className="mt-1 text-xs text-faint">Starting Round 2 always triggers the flash crash.</p>

      {pending && (
        <ConfirmDialog
          title={`${pending.code === status.current_round ? "Restart" : "Start"} ${pending.name}?`}
          confirmLabel={pending.code === "R2" && !status.flash_crash_active ? "Start R2 and crash" : `Start ${pending.code}`}
          tone={pending.code === "R2" && !status.flash_crash_active ? "danger" : "default"}
          busy={busy !== null}
          onCancel={() => setPending(null)}
          onConfirm={() => start(pending)}
        >
          The timer resets to {minutesFor(pending)} minutes and every team moves to {pending.code} on their next refresh.
          {pending.code === "R2" && !status.flash_crash_active && " This triggers the flash crash sequence for every team."}
          {pending.code === "R3" && " Teams see the market stabilize, then the Alpha reveal."}
          {pending.code === "R1" && status.flash_crash_active && " This also turns the flash crash off."}
        </ConfirmDialog>
      )}
    </div>
  );
}
