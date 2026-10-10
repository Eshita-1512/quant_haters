import { useState, type FormEvent } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { formatDuration } from "@/hooks/useCountdown";
import { adminApi } from "@/lib/api";
import type { AdminStatus } from "@/lib/types";

type Run = (label: string, action: () => Promise<AdminStatus>) => Promise<boolean>;

interface TimerControlsProps {
  status: AdminStatus;
  seconds: number;
  busy: string | null;
  run: Run;
}

const ADJUSTMENTS = [
  { label: "-5m", seconds: -300 },
  { label: "-1m", seconds: -60 },
  { label: "+1m", seconds: 60 },
  { label: "+5m", seconds: 300 },
  { label: "+15m", seconds: 900 },
];

export default function TimerControls({ status, seconds, busy, run }: TimerControlsProps) {
  const [minutes, setMinutes] = useState("");
  const [secs, setSecs] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const paused = status.round_phase === "paused";
  const ended = status.round_phase === "completed" || (!paused && seconds === 0);
  const state = paused ? "Paused" : ended ? "Time up" : "Running";
  const stateTone = paused ? "text-warn" : ended ? "text-down" : "text-up";
  const disabled = busy !== null;

  const setExact = async (event: FormEvent) => {
    event.preventDefault();
    const total = (Number(minutes) || 0) * 60 + (Number(secs) || 0);
    if (total <= 0) return;
    const ok = await run(`Set timer to ${formatDuration(total)}`, () => adminApi.timer({ action: "set", seconds: total }));
    if (ok) {
      setMinutes("");
      setSecs("");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div>
          <p className={`font-mono text-[11px] uppercase tracking-[0.08em] ${stateTone}`}>{state}</p>
          <p className="tabular font-mono text-5xl font-semibold leading-none tracking-tight">{formatDuration(seconds)}</p>
        </div>
        <button
          type="button"
          disabled={disabled || (ended && !paused)}
          onClick={() =>
            run(paused ? "Resumed timer" : "Paused timer", () => adminApi.timer({ action: paused ? "resume" : "pause" }))
          }
          className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            paused ? "bg-up text-bg hover:bg-up/90" : "bg-warn text-bg hover:bg-warn/90"
          }`}
        >
          {paused ? (
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M6 4.5v11l9-5.5-9-5.5Z" />
            </svg>
          ) : (
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" />
            </svg>
          )}
          {paused ? "Resume timer" : ended ? "Time is up" : "Pause timer"}
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted">Adjust time</p>
        <div className="grid grid-cols-5 gap-2">
          {ADJUSTMENTS.map((adjustment) => (
            <button
              key={adjustment.label}
              type="button"
              disabled={disabled}
              onClick={() =>
                run(`Timer ${adjustment.label}`, () => adminApi.timer({ action: "extend", seconds: adjustment.seconds }))
              }
              className={`h-10 rounded-lg border font-mono text-sm transition-colors disabled:opacity-40 ${
                adjustment.seconds < 0
                  ? "border-line-strong text-muted hover:border-down hover:text-down"
                  : "border-line-strong text-text hover:border-up hover:text-up"
              }`}
            >
              {adjustment.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={setExact}>
        <p className="mb-2 text-xs text-muted">Set exact time remaining</p>
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-line-strong bg-bg px-3 focus-within:border-accent">
            <input
              value={minutes}
              onChange={(event) => setMinutes(event.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder="00"
              aria-label="Minutes"
              className="h-10 w-full bg-transparent text-right font-mono text-sm outline-none placeholder:text-faint"
            />
            <span className="font-mono text-xs text-faint">min</span>
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-line-strong bg-bg px-3 focus-within:border-accent">
            <input
              value={secs}
              onChange={(event) => setSecs(event.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              placeholder="00"
              aria-label="Seconds"
              className="h-10 w-full bg-transparent text-right font-mono text-sm outline-none placeholder:text-faint"
            />
            <span className="font-mono text-xs text-faint">sec</span>
          </label>
          <button
            type="submit"
            disabled={disabled || (!minutes && !secs)}
            className="h-10 rounded-lg bg-text px-4 text-sm font-semibold text-bg transition-colors hover:bg-text/90 disabled:opacity-40"
          >
            Set
          </button>
        </div>
      </form>

      <button
        type="button"
        disabled={disabled || ended}
        onClick={() => setConfirmEnd(true)}
        className="h-10 rounded-lg border border-down/40 text-sm text-down transition-colors hover:bg-down-soft disabled:opacity-40"
      >
        End {status.current_round} now
      </button>

      {confirmEnd && (
        <ConfirmDialog
          title={`End ${status.round_name} now?`}
          confirmLabel="End round"
          tone="danger"
          busy={busy !== null}
          onCancel={() => setConfirmEnd(false)}
          onConfirm={async () => {
            await run(`Ended ${status.current_round}`, () => adminApi.timer({ action: "end" }));
            setConfirmEnd(false);
          }}
        >
          Uploads close immediately for every team.
          {status.current_round === "R1" && " Participants will see the market unstable alert."}
        </ConfirmDialog>
      )}
    </div>
  );
}
