import { useEffect, useRef, useState } from "react";
import MarketChart, { type ChartTone } from "@/components/MarketChart";
import TickerTape from "@/components/TickerTape";
import { useMarketTicker, type TickerMode } from "@/hooks/useMarketTicker";

export type OverlayStage = "warning" | "crash" | "recovery" | "alpha";

interface MarketEventOverlayProps {
  stage: OverlayStage;
  stockCode: string;
  message: string | null;
  roundName: string;
  onEnter: () => void;
}

interface StageConfig {
  ticker: TickerMode;
  tone: ChartTone;
  header: string;
  accent: string;
  dot: string;
  backdrop: string;
  vignette: string;
  entrance: string;
  burst: string | null;
  reveals: boolean;
  cta: string;
  waiting: string | null;
  badge: string | null;
}

const STAGES: Record<OverlayStage, StageConfig> = {
  warning: {
    ticker: "unstable",
    tone: "warn",
    header: "Exchange alert / volatility warning",
    accent: "text-warn",
    dot: "bg-warn",
    backdrop: "bg-[#140b02]",
    vignette: "bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(245,184,65,0.16)_100%)]",
    entrance: "",
    burst: null,
    reveals: false,
    cta: "",
    waiting: "Waiting for the exchange. Uploads are closed.",
    badge: null,
  },
  crash: {
    ticker: "crash",
    tone: "down",
    header: "Exchange alert / circuit breaker tripped",
    accent: "text-down",
    dot: "bg-down",
    backdrop: "bleed-red",
    vignette: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(255,40,60,0.28)_100%)]",
    entrance: "screen-shake",
    burst: "bg-[#ffd9dd]",
    reveals: true,
    cta: "Enter the crash market",
    waiting: null,
    badge: "Trading halted",
  },
  recovery: {
    ticker: "recovery",
    tone: "cool",
    header: "Exchange notice / volatility cooling",
    accent: "text-[#ff8f9b]",
    dot: "bg-[#ff8f9b]",
    backdrop: "bg-[#12040a]",
    vignette: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(255,120,140,0.12)_100%)]",
    entrance: "",
    burst: null,
    reveals: false,
    cta: "",
    waiting: "Round 2 is closed. The trading desks reopen shortly.",
    badge: "Circuit breaker resetting",
  },
  alpha: {
    ticker: "rally",
    tone: "alpha",
    header: "Exchange notice / trading desks open",
    accent: "text-alpha",
    dot: "bg-alpha",
    backdrop: "bleed-violet",
    vignette: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(155,140,255,0.22)_100%)]",
    entrance: "zoom-burst",
    burst: "bg-[#ebe6ff]",
    reveals: true,
    cta: "Open the trading desk",
    waiting: null,
    badge: "Liquidity restored",
  },
};

const REVEAL_DELAY_MS = 2600;

function Title({ stage }: { stage: OverlayStage }) {
  if (stage === "warning") {
    return (
      <h1 id="market-event-title" className="rise-in text-5xl font-black leading-none tracking-tight text-warn sm:text-7xl">
        MARKET UNSTABLE
      </h1>
    );
  }
  if (stage === "crash") {
    return (
      <h1 id="market-event-title" className="slam-in glitch text-6xl font-black leading-none tracking-tight text-down sm:text-8xl">
        FLASH CRASH
      </h1>
    );
  }
  if (stage === "recovery") {
    return (
      <h1
        id="market-event-title"
        className="rise-in text-5xl font-black leading-none tracking-tight text-[#ff8f9b] sm:text-7xl"
      >
        MARKET STABILIZING
      </h1>
    );
  }
  return (
    <h1 id="market-event-title" className="slam-in leading-none">
      <span className="block font-mono text-sm font-semibold uppercase tracking-[0.4em] text-alpha sm:text-base">
        Round 3
      </span>
      <span className="text-alpha-gradient mt-2 block text-7xl font-black tracking-tight sm:text-9xl">ALPHA</span>
    </h1>
  );
}

function bodyText(stage: OverlayStage, message: string | null): string {
  if (stage === "warning") {
    return "Round 1 is closed. Abnormal volatility is building across every stock. Hold tight, the exchange is about to move.";
  }
  if (stage === "crash") {
    return message || "The market has collapsed. Volatility has spiked and your Round 1 model is likely broken.";
  }
  if (stage === "recovery") {
    return "The crash has found a floor. Volatility is cooling and liquidity is coming back. Get ready to trade.";
  }
  return "The market has recovered. Turn your signal into a strategy: size positions from -1 to +1. Sharpe wins. Drawdown and turnover cost you.";
}

export default function MarketEventOverlay({ stage, stockCode, message, roundName, onEnter }: MarketEventOverlayProps) {
  const config = STAGES[stage];
  const { points, price, changePct } = useMarketTicker(config.ticker);
  const fromLow = stage === "recovery" || stage === "alpha";
  const shownChange = fromLow ? (price / Math.min(...points) - 1) * 100 : changePct;
  const [revealedStage, setRevealedStage] = useState<OverlayStage | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const revealed = config.reveals && revealedStage === stage;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!config.reveals) return;
    const id = setTimeout(() => setRevealedStage(stage), REVEAL_DELAY_MS);
    return () => clearTimeout(id);
  }, [config.reveals, stage]);

  return (
    <div
      ref={rootRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="market-event-title"
      aria-describedby="market-event-body"
      tabIndex={-1}
      className={`fixed inset-0 z-50 overflow-y-auto outline-none ${config.backdrop}`}
    >
      <div className="pointer-events-none fixed inset-0 scanlines opacity-60" />
      <div className={`pointer-events-none fixed inset-0 transition-opacity duration-700 ${config.vignette}`} />
      {config.burst && <div key={`burst-${stage}`} className={`flash-burst pointer-events-none fixed inset-0 z-10 ${config.burst}`} />}

      <div key={stage} className={`relative flex min-h-full flex-col ${config.entrance}`}>
        <div className={`flex items-center justify-between gap-4 px-5 py-4 font-mono text-xs uppercase tracking-[0.2em] ${config.accent}`}>
          <span className="flex items-center gap-2">
            <span className={`siren h-2.5 w-2.5 rounded-full ${config.dot}`} />
            {config.header}
          </span>
          <span className="hidden sm:inline">{stockCode}</span>
        </div>
        <div className={config.accent}>
          <TickerTape tone={config.tone} />
        </div>

        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-5 py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Title stage={stage} />
              <p id="market-event-body" className="rise-in mt-4 max-w-xl text-base leading-relaxed text-text/90 sm:text-lg">
                {bodyText(stage, message)}
              </p>
            </div>
            <div className="shrink-0 sm:text-right">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-text/60">{stockCode} last</div>
              <div className={`tabular font-mono text-4xl font-bold sm:text-5xl ${config.accent}`}>{price.toFixed(2)}</div>
              <div className={`tabular font-mono text-xl font-semibold ${stage === "alpha" ? "text-alpha-2" : config.accent}`}>
                {shownChange >= 0 ? "+" : ""}
                {shownChange.toFixed(2)}%{fromLow && <span className="ml-2 text-xs font-normal text-text/60">off the low</span>}
              </div>
            </div>
          </div>

          <div className={`relative h-56 overflow-hidden rounded-xl border border-current/30 bg-black/30 sm:h-72 ${config.accent}`}>
            <MarketChart points={points} tone={config.tone} className="absolute inset-0 h-full w-full" />
            {config.badge && (
              <div className="absolute left-4 top-4 rounded border border-current/50 bg-black/60 px-2 py-1 font-mono text-[11px] uppercase tracking-wider">
                {config.badge}
              </div>
            )}
          </div>

          <div className="min-h-24">
            {config.waiting && (
              <p className={`flex items-center gap-3 font-mono text-sm ${config.accent}`}>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {config.waiting}
              </p>
            )}
            {revealed && (
              <div className="rise-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-text/60">Now live</p>
                  <p className="text-2xl font-semibold">{roundName}</p>
                </div>
                <button
                  type="button"
                  onClick={onEnter}
                  className={`inline-flex h-14 items-center justify-center gap-3 rounded-xl px-8 text-base font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] active:scale-[0.98] ${
                    stage === "alpha"
                      ? "bg-gradient-to-r from-alpha to-alpha-2 text-[#07061a] shadow-[0_0_40px_rgba(155,140,255,0.45)]"
                      : "crash-pulse bg-down text-white"
                  }`}
                >
                  {config.cta}
                  <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10h12m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
