import TickerTape from "@/components/TickerTape";

interface CrashHeroProps {
  message: string | null;
}

const PLUNGE =
  "M0,60 L60,56 L120,64 L180,52 L240,58 L300,50 L360,62 L400,70 L430,150 L455,120 L480,210 L510,190 L540,250 L580,236 L620,262 L680,248 L740,270 L800,258 L860,276 L920,266 L1000,280";

export default function CrashHero({ message }: CrashHeroProps) {
  return (
    <section className="rise-in relative overflow-hidden border border-down/50 bg-panel">
      <svg
        viewBox="0 0 1000 300"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full text-down opacity-30"
        aria-hidden
      >
        <defs>
          <linearGradient id="crash-hero-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${PLUNGE} L1000,300 L0,300 Z`} fill="url(#crash-hero-fill)" />
        <path d={PLUNGE} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative grid gap-6 p-6 sm:p-8">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-down">
            <span className="siren h-2 w-2 round bg-down" />
            Flash crash in effect
          </div>
          <h2 className="glitch mt-3 text-4xl font-display font-black uppercase tracking-tight text-down sm:text-5xl">FLASH CRASH</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-text/85 sm:text-base">
            {message || "The regime has shifted. Retrain on the crash data before you submit."}
          </p>
        </div>
      </div>
      <div className="relative text-down">
        <TickerTape tone="down" />
      </div>
    </section>
  );
}
