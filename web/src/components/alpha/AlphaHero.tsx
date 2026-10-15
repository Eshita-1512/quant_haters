import { phaseLabels } from "@/lib/format";
import type { EventStatus } from "@/lib/types";

interface AlphaHeroProps {
  status: EventStatus;
}

const RALLY =
  "M0,230 L50,236 L100,222 L150,228 L200,210 L250,214 L300,190 L350,196 L400,170 L450,176 L500,150 L550,158 L600,128 L650,134 L700,108 L750,116 L800,90 L850,96 L900,70 L950,74 L1000,52";

const RULES = [
  { label: "Sharpe ratio", effect: "rewarded", tone: "text-alpha-2" },
  { label: "Max drawdown", effect: "-2 x", tone: "text-down" },
  { label: "Trading cost", effect: "0.001 per unit moved", tone: "text-down" },
];

export default function AlphaHero({ status }: AlphaHeroProps) {
  const live = status.round_phase === "live" || status.round_phase === "flash_crash";

  return (
    <section className="rise-in relative overflow-hidden rounded-lg border border-alpha/30 bg-panel">
      <div className="pointer-events-none absolute -left-1/4 -top-1/2 h-[140%] w-[70%] rounded-full bg-alpha/20 blur-3xl drift-glow" />
      <div
        className="pointer-events-none absolute -bottom-1/2 -right-1/4 h-[140%] w-[60%] rounded-full bg-alpha-2/10 blur-3xl drift-glow"
        style={{ animationDelay: "-7s" }}
      />
      <svg
        viewBox="0 0 1000 260"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 w-full text-alpha opacity-40"
        aria-hidden
      >
        <defs>
          <linearGradient id="alpha-hero-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${RALLY} L1000,260 L0,260 Z`} fill="url(#alpha-hero-fill)" />
        <path d={RALLY} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="relative grid gap-8 p-6 sm:p-8 ">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-alpha">Round 3</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${
                live ? "border-alpha-2/40 bg-alpha-2/10 text-alpha-2" : "border-line-strong text-muted"
              }`}
            >
              {live && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              {live ? "Desk open" : phaseLabels[status.round_phase]}
            </span>
          </div>
          <h1 className="text-alpha mt-3 text-6xl font-display font-black uppercase leading-none tracking-tight sm:text-7xl">ALPHA</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-text/85 sm:text-base">
            Convert your signal into positions between -1 (full short) and +1 (full long) for{" "}
            <span className="font-mono text-text">{status.assigned_stock.code}</span>. Your book is backtested with
            transaction costs.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {RULES.map((rule) => (
              <li
                key={rule.label}
                className="flex items-center gap-2 rounded-lg border border-line-strong bg-bg/60 px-3 py-1.5 text-xs backdrop-blur"
              >
                <span className="text-muted">{rule.label}</span>
                <span className={`font-mono font-semibold ${rule.tone}`}>{rule.effect}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
}
