import Head from "next/head";
import Link from "next/link";
import { type CSSProperties, type ReactNode } from "react";
import FormatHint from "@/components/FormatHint";
import Reveal from "@/components/Reveal";
import FieldGuide from "@/components/landing/FieldGuide";
import Timeline from "@/components/landing/Timeline";
import BruteForceTelemetry from "@/components/BruteForceTelemetry";
import BruteForceToggle from "@/components/BruteForceToggle";
import DecipherText from "@/components/DecipherText";
import { useInView } from "@/hooks/useInView";

const RULES = [
  "10 submissions in total, shared across all three rounds. Plan how you spend them.",
  "One upload per 60 seconds per team.",
  "Rule violations, look-ahead bias, or data leakage will incur strict point deductions applied to your score.",
  "One login per team, given to you by the organizers. Everyone on the team uses it.",
];

const buttonBase =
  "press relative z-20 inline-flex h-12 items-center justify-center rounded-md px-7 font-display text-lg font-extrabold uppercase leading-none tracking-wide max-sm:w-full";

const primaryButton = `${buttonBase} bg-accent text-bg hover:bg-accent/85`;

function delay(ms: number): CSSProperties {
  return { "--d": `${ms}ms` } as CSSProperties;
}

function Section({
  title,
  intro,
  tag,
  children,
}: {
  title: string;
  intro?: string;
  tag?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[120rem] px-6 md:px-10 xl:px-16 py-20 sm:py-28">
        <Reveal>
          {tag && (
            <span className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-accent">
              {tag}
            </span>
          )}
          <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.9] sm:text-7xl">{title}</h2>
          {intro && <p className="mt-5 max-w-2xl text-lg text-muted">{intro}</p>}
        </Reveal>
        <div className="mt-14">{children}</div>
      </div>
    </section>
  );
}

function RulesList() {
  const { ref, inView } = useInView<HTMLOListElement>();
  return (
    <ol ref={ref} className={`border-t border-line ${inView ? "is-visible" : ""}`}>
      {RULES.map((rule, index) => (
        <li
          key={rule}
          className="reveal-item grid grid-cols-[3.25rem_1fr] items-baseline gap-4 border-b border-line py-6 sm:grid-cols-[6rem_1fr]"
          style={{ "--i-delay": `${index * 80}ms` } as CSSProperties}
        >
          <span className="font-display text-4xl font-extrabold leading-none text-accent sm:text-6xl">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-base sm:text-xl">{rule}</span>
            <span className="font-mono text-[10px] text-faint">
              // RULE_CONSTRAINT_0{index + 1}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function HeroSection() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section
      ref={ref}
      className={`relative mx-auto max-w-[120rem] overflow-hidden px-6 md:px-10 xl:px-16 pb-20 pt-14 sm:pb-28 sm:pt-24 ${
        inView ? "is-visible" : ""
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        className="hero-line pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 w-full opacity-50"
      >
        <defs>
          <linearGradient id="crash-line" x1="0" y1="0" x2="1000" y2="0">
            <stop offset="0%" style={{ stopColor: "#008000", stopOpacity: 1 }} />
            <stop offset="35%" style={{ stopColor: "#008000", stopOpacity: 1 }} />
            <stop offset="45%" style={{ stopColor: "var(--down)", stopOpacity: 1 }} />
            <stop offset="55%" style={{ stopColor: "var(--down)", stopOpacity: 1 }} />
            <stop offset="65%" style={{ stopColor: "var(--recover)", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "var(--recover)", stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="crash-fill" x1="0" y1="0" x2="1000" y2="0">
            <stop offset="0%" style={{ stopColor: "#008000", stopOpacity: 0.08 }} />
            <stop offset="35%" style={{ stopColor: "#008000", stopOpacity: 0.08 }} />
            <stop offset="45%" style={{ stopColor: "var(--down)", stopOpacity: 0.08 }} />
            <stop offset="55%" style={{ stopColor: "var(--down)", stopOpacity: 0.08 }} />
            <stop offset="65%" style={{ stopColor: "var(--recover)", stopOpacity: 0.08 }} />
            <stop offset="100%" style={{ stopColor: "var(--recover)", stopOpacity: 0.08 }} />
          </linearGradient>
        </defs>

        {/* Faint grid lines */}
        <g className="hero-grid" opacity="0.04">
          <line x1="0" y1="40" x2="1000" y2="40" stroke="var(--text)" strokeWidth="1" />
          <line x1="0" y1="80" x2="1000" y2="80" stroke="var(--text)" strokeWidth="1" />
          <line x1="0" y1="120" x2="1000" y2="120" stroke="var(--text)" strokeWidth="1" />
          <line x1="0" y1="160" x2="1000" y2="160" stroke="var(--text)" strokeWidth="1" />
        </g>

        {/* Y-axis price labels */}
        <g className="hero-labels" opacity="0" fontSize="10" fill="var(--faint)" fontFamily="monospace">
          <text x="8" y="48" textAnchor="start">
            160
          </text>
          <text x="8" y="88" textAnchor="start">
            140
          </text>
          <text x="8" y="128" textAnchor="start">
            120
          </text>
          <text x="8" y="168" textAnchor="start">
            100
          </text>
        </g>

        {/* Area fill under the line */}
        <path
          d="M0 80 L60 75 L120 70 L180 65 L240 72 L280 75 L300 140 L320 165 L340 160 L360 148 L400 130 L440 115 L480 100 L520 88 L560 80 L600 75 L640 78 L680 82 L720 88 L760 95 L800 90 L840 85 L880 82 L920 80 L960 78 L1000 75 L1000 200 L0 200 Z"
          fill="url(#crash-fill)"
        />

        {/* Line */}
        <path
          d="M0 80 L60 75 L120 70 L180 65 L240 72 L280 75 L300 140 L320 165 L340 160 L360 148 L400 130 L440 115 L480 100 L520 88 L560 80 L600 75 L640 78 L680 82 L720 88 L760 95 L800 90 L840 85 L880 82 L920 80 L960 78 L1000 75"
          fill="none"
          stroke="url(#crash-line)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative z-10">
        <div className="hero-rise flex flex-wrap items-center gap-2" style={delay(0)}>
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
            [0xBF // QUANT_CORE]
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
            Machine learning trading sprint
          </span>
        </div>
        <h1 className="mt-5 flex flex-wrap items-baseline gap-x-[0.22em] font-display text-[clamp(4.75rem,19vw,13rem)] font-extrabold uppercase leading-[0.82]">
          <span className="hero-rise" style={delay(80)}>
            <DecipherText text="Big" autoStart={true} delayMs={100} />
          </span>
          <span className="hero-drop text-down" style={delay(300)}>
            <DecipherText text="Short" autoStart={true} delayMs={400} />
          </span>
        </h1>
        <p className="hero-rise mt-8 max-w-xl text-lg text-muted sm:text-xl" style={delay(460)}>
          A five-hour machine learning trading sprint. Build a model, survive the crash, then trade your own
          signal.
        </p>
        <div className="hero-rise mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center" style={delay(580)}>
          <Link href="/login" className={primaryButton}>
            Log in
          </Link>
          <span className="font-mono text-xs text-faint">
            // LIVE PORTAL OPEN
          </span>
        </div>

        <div className="hero-rise mt-12" style={delay(650)}>
          <BruteForceTelemetry stockCode="AERION_X" roundCode="R1" />
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>BigShort | Machine Learning Trading Sprint</title>
        <meta
          name="description"
          content="A five-hour machine learning trading sprint. Build a model, survive the crash, then trade your own signal."
        />
      </Head>

      <header className="mx-auto flex h-16 max-w-[120rem] items-center justify-between px-6 md:px-10 xl:px-16">
        <span className="flex items-baseline gap-[0.22em] font-display text-2xl font-extrabold uppercase leading-none">
          <DecipherText text="Big" autoStart={false} />
          <span className="text-down">
            <DecipherText text="Short" autoStart={false} />
          </span>
        </span>
        <div className="flex items-center gap-3">
          <BruteForceToggle compact={true} />
          <Link href="/login" className="press inline-flex min-h-11 items-center px-2 font-mono text-xs text-muted hover:text-text">
            Log in
          </Link>
        </div>
      </header>

      <main>
        <HeroSection />

        <Section
          tag="// TIMELINE_MATRIX"
          title="How the five hours play out"
          intro="Calm, then chaos, a breather, then a new game. Each block is one hour; organizers may shift timings slightly on the day."
        >
          <Timeline />
        </Section>

        <Section
          tag="// DATA_SPECIFICATION"
          title="What you upload"
          intro="One CSV per upload. Exactly 50 rows matching the round prediction window (R1: 801–850, R2/R3: 851–900)."
        >
          <div className="grid gap-12 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
            <Reveal className="min-w-0 md:pr-12">
              <h3 className="font-display text-3xl font-extrabold uppercase leading-none">Rounds 1 & 2: predictions</h3>
              <p className="mt-2 text-xs text-muted">Round 1 timestamps: 801–850 | Round 2 timestamps: 851–900</p>
              <div className="mt-5">
                <FormatHint type="prediction" round="R1" />
              </div>
            </Reveal>
            <Reveal delay={120} className="min-w-0 md:pl-12">
              <h3 className="font-display text-3xl font-extrabold uppercase leading-none">Round 3: signals</h3>
              <p className="mt-2 text-xs text-muted">Round 3 timestamps: 851–900</p>
              <div className="mt-5">
                <FormatHint type="signal" round="R3" />
              </div>
            </Reveal>
          </div>
        </Section>

        <Section
          tag="// SCORING_ALGORITHM"
          title="How you're scored"
          intro="Every round is scored out of 100."
        >
          <div className="grid gap-12 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
            <Reveal className="md:pr-12">
              <h3 className="font-display text-5xl font-extrabold uppercase leading-none text-up sm:text-6xl">
                Rounds 1 and 2
              </h3>
              <p className="mt-5 text-base leading-relaxed text-muted">
                Scored on how well your predictions beat a coin flip, using balanced accuracy and the Matthews
                correlation coefficient. Guessing, or calling UP every time, lands at roughly 17, so that is the baseline to beat.
              </p>
            </Reveal>
            <Reveal delay={120} className="md:pl-12">
              <h3 className="font-display text-5xl font-extrabold uppercase leading-none text-alpha sm:text-6xl">
                Round 3
              </h3>
              <p className="mt-5 text-base leading-relaxed text-muted">
                Your positions are backtested with trading costs. Risk-adjusted returns are rewarded; deep drawdowns
                and trading too often both cost you.
              </p>
            </Reveal>
          </div>
        </Section>

        <Section
          tag="// PROTOCOL_RULES"
          title="Rules that matter on the day"
        >
          <RulesList />
        </Section>

        <Section
          tag="// KNOWLEDGE_BASE"
          title="Field guide"
          intro="Terms you will hear a lot."
        >
          <FieldGuide />
        </Section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-[120rem] flex-col items-start gap-10 px-6 md:px-10 xl:px-16 py-24 sm:py-32">
            <Reveal>
              <span className="font-mono text-xs uppercase tracking-wider text-accent">
                // SYSTEM_READY
              </span>
              <h2 className="mt-2 font-display text-6xl font-extrabold uppercase leading-[0.85] sm:text-8xl">
                Ready for the open?
              </h2>
            </Reveal>
            <Reveal delay={120} className="w-full sm:w-auto">
              <Link href="/login" className={primaryButton}>
                Log in
              </Link>
            </Reveal>
          </div>
        </section>
      </main>
    </>
  );
}
