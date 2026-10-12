import { formatDuration } from "@/hooks/useCountdown";
import { phaseLabels } from "@/lib/format";
import type { EventStatus } from "@/lib/types";

interface CountdownTimerProps {
  status: EventStatus;
  seconds: number;
}

const phaseStyles: Record<EventStatus["round_phase"], string> = {
  scheduled: "border-line-strong text-muted",
  live: "border-up/40 bg-up-soft text-up",
  flash_crash: "border-down/50 bg-down-soft text-down",
  paused: "border-warn/40 bg-warn-soft text-warn",
  completed: "border-line-strong text-muted",
};

export default function CountdownTimer({ status, seconds }: CountdownTimerProps) {
  const tone = seconds === 0 ? "text-faint" : seconds <= 60 ? "text-down" : seconds <= 300 ? "text-warn" : "text-text";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">{status.current_round}</span>
          <span
            className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${phaseStyles[status.round_phase]}`}
          >
            {(status.round_phase === "live" || status.round_phase === "flash_crash") && (
              <span className="h-1.5 w-1.5 round bg-current" />
            )}
            {phaseLabels[status.round_phase]}
          </span>
        </div>
        <h1 className="mt-2 font-display text-4xl font-extrabold uppercase leading-none sm:text-5xl">{status.round_name}</h1>
      </div>
      <div className="sm:text-right">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          {status.round_phase === "paused" ? "Paused with" : "Time remaining"}
        </div>
        <div
          role="timer"
          aria-live="off"
          className={`tabular font-mono text-5xl font-semibold leading-none tracking-tight sm:text-6xl ${tone}`}
        >
          {formatDuration(seconds)}
        </div>
      </div>
    </div>
  );
}
