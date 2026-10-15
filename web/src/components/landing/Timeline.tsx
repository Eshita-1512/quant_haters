import type { CSSProperties } from "react";
import { useInView } from "@/hooks/useInView";

interface Stop {
  tag: string;
  title: string;
  duration?: string;
  body: string;
  tone: "kickoff" | "calm" | "crash" | "recover" | "break" | "alpha" | "finale";
}

const STOPS: Stop[] = [
  {
    tag: "Kickoff",
    title: "Get your market",
    body: "Log in. Your team gets its own stock and its own slice of time to predict. No two teams have the same data, so copying another team's code gets you nowhere.",
    tone: "kickoff",
  },
  {
    tag: "R1",
    title: "Foundation",
    duration: "1 h",
    body: "Calm market. Clean the data, engineer features, train a model that says UP (1) or DOWN (0) for each of your 50 prediction rows.",
    tone: "calm",
  },
  {
    tag: "Flash crash",
    title: "The shock",
    body: "Mid-event, the market you were studying collapses. Volatility spikes, prices fall, and your Round 1 model is probably broken. New crash data unlocks.",
    tone: "crash",
  },
  {
    tag: "R2",
    title: "Signal Hunt",
    duration: "1 h",
    body: "Same task, new regime. Retrain, add volatility filters, shorten your lookback. This round tests whether your model adapts.",
    tone: "recover",
  },
  {
    tag: "Break",
    title: "Cooldown",
    duration: "1 h",
    body: "No uploads during the break. The Round 3 trading desk opens when it ends.",
    tone: "break",
  },
  {
    tag: "R3",
    title: "Alpha",
    duration: "1 h",
    body: "Stop predicting direction and start trading. For each row, choose a position from -1 (full short) to +1 (full long). Your book is backtested with trading costs.",
    tone: "alpha",
  },
  {
    tag: "Finale",
    title: "Presentation",
    duration: "1 h",
    body: "Presentations and evaluation. Final standings are published on the leaderboard once evaluation is done.",
    tone: "finale",
  },
];

const TONES: Record<Stop["tone"], { tag: string; dot: string }> = {
  kickoff: { tag: "text-muted", dot: "bg-muted" },
  calm: { tag: "text-up", dot: "bg-up" },
  crash: { tag: "text-down", dot: "bg-down" },
  recover: { tag: "text-recover", dot: "bg-recover" },
  break: { tag: "text-faint", dot: "bg-faint" },
  alpha: { tag: "text-alpha", dot: "bg-alpha" },
  finale: { tag: "text-gold", dot: "bg-gold" },
};

// Calm through R1, a sharp drop at the crash, recovery in R2, a flat break, a climb in R3, a level finish.
const PRICE_PATH =
  "M0 60 L50 56 L100 62 L150 54 L200 58 L250 52 L280 56 L300 70 L320 96 L340 108 L360 102 L400 90 L440 78 L480 66 L520 52 L550 44 L580 42 L620 41 L660 42 L700 40 L730 36 L760 32 L790 28 L820 24 L840 22 L880 21 L920 21 L960 20 L1000 20";

export default function Timeline() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className={`timeline ${inView ? "is-visible" : ""}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 120"
        preserveAspectRatio="none"
        className="tl-chart mb-10 hidden h-28 w-full xl:block"
      >
        <defs>
          <linearGradient id="tl-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
            <stop offset="0" style={{ stopColor: "var(--muted)" }} />
            <stop offset="0.1" style={{ stopColor: "var(--muted)" }} />
            <stop offset="0.14" style={{ stopColor: "var(--up)" }} />
            <stop offset="0.27" style={{ stopColor: "var(--up)" }} />
            <stop offset="0.3" style={{ stopColor: "var(--down)" }} />
            <stop offset="0.41" style={{ stopColor: "var(--down)" }} />
            <stop offset="0.44" style={{ stopColor: "var(--recover)" }} />
            <stop offset="0.55" style={{ stopColor: "var(--recover)" }} />
            <stop offset="0.58" style={{ stopColor: "var(--faint)" }} />
            <stop offset="0.7" style={{ stopColor: "var(--faint)" }} />
            <stop offset="0.73" style={{ stopColor: "var(--alpha)" }} />
            <stop offset="0.84" style={{ stopColor: "var(--alpha)" }} />
            <stop offset="0.87" style={{ stopColor: "var(--gold)" }} />
            <stop offset="1" style={{ stopColor: "var(--gold)" }} />
          </linearGradient>
          <linearGradient id="tl-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--text)", stopOpacity: 0.07 }} />
            <stop offset="1" style={{ stopColor: "var(--text)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={`${PRICE_PATH} L1000 120 L0 120 Z`} fill="url(#tl-fill)" />
        <path
          d={PRICE_PATH}
          fill="none"
          stroke="url(#tl-stroke)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <ol className="relative grid gap-10 xl:grid-cols-7 xl:gap-5">
        <span aria-hidden="true" className="tl-rail-y absolute bottom-2 left-[5px] top-2 w-px bg-line-strong xl:hidden" />
        <span aria-hidden="true" className="tl-rail-x absolute left-0 right-0 top-[5px] hidden h-px bg-line-strong xl:block" />
        {STOPS.map((stop, index) => {
          const tone = TONES[stop.tone];
          const delay = { "--i-delay": `${300 + index * 120}ms` } as CSSProperties;
          return (
            <li key={stop.tag} className="relative pl-8 xl:pl-0 xl:pt-8" style={delay}>
              <span
                aria-hidden="true"
                className={`tl-dot absolute left-0 top-1 h-[11px] w-[11px] rounded-full ${tone.dot} xl:top-0`}
              >
                {stop.tone === "crash" && <span className="tl-ring absolute inset-0 rounded-full bg-down" />}
              </span>
              <div className="reveal-item">
                <p className={`font-mono text-[11px] uppercase tracking-[0.08em] ${tone.tag}`}>
                  {stop.tag}
                  {stop.duration && <span className="text-faint"> · {stop.duration}</span>}
                </p>
                <h3 className="mt-2 font-display text-3xl font-extrabold uppercase leading-none xl:text-2xl">
                  {stop.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{stop.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
