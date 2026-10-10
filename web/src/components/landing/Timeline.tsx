import type { CSSProperties } from "react";
import { useInView } from "@/hooks/useInView";

interface Stop {
  tag: string;
  title: string;
  duration?: string;
  body: string;
  tone: "kickoff" | "calm" | "crash" | "recover" | "alpha";
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
    duration: "about 1 h 15 min",
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
    duration: "about 1 h 45 min",
    body: "Same task, new regime. Retrain, add volatility filters, shorten your lookback. This round tests whether your model adapts.",
    tone: "recover",
  },
  {
    tag: "R3",
    title: "Alpha",
    duration: "about 1 h",
    body: "Stop predicting direction and start trading. For each row, choose a position from -1 (full short) to +1 (full long). Your book is backtested with trading costs.",
    tone: "alpha",
  },
];

const TONES: Record<Stop["tone"], { tag: string; dot: string }> = {
  kickoff: { tag: "text-muted", dot: "bg-muted" },
  calm: { tag: "text-up", dot: "bg-up" },
  crash: { tag: "text-down", dot: "bg-down" },
  recover: { tag: "text-recover", dot: "bg-recover" },
  alpha: { tag: "text-alpha", dot: "bg-alpha" },
};

const PRICE_PATH =
  "M0 34 L50 30 L100 36 L150 28 L200 33 L250 27 L300 32 L350 26 L400 30 L430 44 L450 70 L470 62 L490 96 L510 88 L530 108 L560 100 L600 92 L640 84 L680 88 L720 76 L760 72 L800 66 L840 56 L880 50 L920 38 L960 30 L1000 18";

export default function Timeline() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className={`timeline ${inView ? "is-visible" : ""}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 120"
        preserveAspectRatio="none"
        className="tl-chart mb-10 hidden h-28 w-full lg:block"
      >
        <defs>
          <linearGradient id="tl-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
            <stop offset="0" style={{ stopColor: "var(--muted)" }} />
            <stop offset="0.18" style={{ stopColor: "var(--up)" }} />
            <stop offset="0.4" style={{ stopColor: "var(--up)" }} />
            <stop offset="0.44" style={{ stopColor: "var(--down)" }} />
            <stop offset="0.56" style={{ stopColor: "var(--down)" }} />
            <stop offset="0.62" style={{ stopColor: "var(--recover)" }} />
            <stop offset="0.78" style={{ stopColor: "var(--recover)" }} />
            <stop offset="0.84" style={{ stopColor: "var(--alpha)" }} />
            <stop offset="1" style={{ stopColor: "var(--alpha)" }} />
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

      <ol className="relative grid gap-10 lg:grid-cols-5 lg:gap-6">
        <span aria-hidden="true" className="tl-rail-y absolute bottom-2 left-[5px] top-2 w-px bg-line-strong lg:hidden" />
        <span aria-hidden="true" className="tl-rail-x absolute left-0 right-0 top-[5px] hidden h-px bg-line-strong lg:block" />
        {STOPS.map((stop, index) => {
          const tone = TONES[stop.tone];
          const delay = { "--i-delay": `${300 + index * 120}ms` } as CSSProperties;
          return (
            <li key={stop.tag} className="relative pl-8 lg:pl-0 lg:pt-8" style={delay}>
              <span
                aria-hidden="true"
                className={`tl-dot absolute left-0 top-1 h-[11px] w-[11px] rounded-full ${tone.dot} lg:top-0`}
              >
                {stop.tone === "crash" && <span className="tl-ring absolute inset-0 rounded-full bg-down" />}
              </span>
              <div className="reveal-item">
                <p className={`font-mono text-[11px] uppercase tracking-[0.08em] ${tone.tag}`}>
                  {stop.tag}
                  {stop.duration && <span className="text-faint"> · {stop.duration}</span>}
                </p>
                <h3 className="mt-2 font-display text-3xl font-extrabold uppercase leading-none">{stop.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{stop.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
