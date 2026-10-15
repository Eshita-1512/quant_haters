import Link from "next/link";
import { useEffect, useState } from "react";
import Panel from "@/components/Panel";
import { api } from "@/lib/api";
import type { EventStatus } from "@/lib/types";

const FINAL_POLL_MS = 10000;

const primaryLink =
  "press inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent px-7 font-display text-lg font-extrabold uppercase leading-none tracking-wide text-bg hover:bg-accent/85 max-sm:w-full";
const secondaryLink =
  "press inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line-strong px-7 font-display text-lg font-extrabold uppercase leading-none tracking-wide text-text hover:border-muted max-sm:w-full";

export default function EventOver({ status }: { status: EventStatus }) {
  const [finalStatus, setFinalStatus] = useState<"pending" | "success">("pending");

  useEffect(() => {
    let active = true;
    const checkFinal = async () => {
      try {
        const results = await api.getFinalResults();
        if (active) setFinalStatus(results.status === "success" ? "success" : "pending");
      } catch {
        if (active) setFinalStatus("pending");
      }
    };
    checkFinal();
    const interval = setInterval(checkFinal, FINAL_POLL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const published = finalStatus === "success";

  return (
    <div className="rise-in flex flex-col gap-5">
      <section className="bf-hud-panel relative overflow-hidden rounded-lg border border-alpha/30 bg-panel">
        <svg
          aria-hidden="true"
          viewBox="0 0 1000 260"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 w-full text-alpha opacity-25"
        >
          <defs>
            <linearGradient id="event-over-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: "currentColor", stopOpacity: 0.35 }} />
              <stop offset="1" style={{ stopColor: "currentColor", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path
            d="M0,230 L60,236 L120,222 L180,228 L240,206 L300,212 L360,186 L420,192 L480,164 L540,170 L600,140 L660,146 L700,120 L1000,120 L1000,260 L0,260 Z"
            fill="url(#event-over-fill)"
          />
          <path
            d="M0,230 L60,236 L120,222 L180,228 L240,206 L300,212 L360,186 L420,192 L480,164 L540,170 L600,140 L660,146 L700,120 L1000,120"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="700"
            x2="700"
            y1="0"
            y2="260"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-alpha">Round 3 // Session closed</span>
            <span className="font-mono text-[10px] text-faint">[0xBF // CLOSING_BELL]</span>
          </div>
          <h1 className="mt-4 font-display text-6xl font-black uppercase leading-[0.85] tracking-tight text-text sm:text-8xl">
            Market
            <br />
            closed
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-text/85 sm:text-base">
            Round 3 is over and uploads are closed. Presentations and evaluation are under way.
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Session tape" telemetryTag="// SESSION_TAPE">
          <dl className="divide-y divide-line font-mono text-sm">
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Stock</dt>
              <dd className="tabular text-text">{status.assigned_stock.code}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Submissions</dt>
              <dd className="tabular text-text">{`${status.submissions_count ?? "--"} / 10`}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Round 1</dt>
              <dd className="tabular text-text">Closed</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Round 2</dt>
              <dd className="tabular text-text">Closed</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Round 3</dt>
              <dd className="tabular text-text">Closed</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Final standings" telemetryTag="// RESULTS_FEED" className="lg:col-span-2">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ${
                  published ? "border-gold/50 bg-gold/10 text-gold" : "border-line-strong text-muted"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {published ? "Published" : "Pending"}
              </span>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                {published
                  ? "Final standings are live."
                  : "Final standings are published after evaluation. This page checks every 10 seconds."}
              </p>
            </div>
            <Link href="/leaderboard" className={published ? primaryLink : secondaryLink}>
              {published ? "View final standings" : "View standings"}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
