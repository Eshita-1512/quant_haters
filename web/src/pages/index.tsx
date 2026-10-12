import Head from "next/head";
import Link from "next/link";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import FormatHint from "@/components/FormatHint";
import Reveal from "@/components/Reveal";
import FieldGuide from "@/components/landing/FieldGuide";
import HeroTape from "@/components/landing/HeroTape";
import Timeline from "@/components/landing/Timeline";
import { useInView } from "@/hooks/useInView";
import { HERO_ENABLED } from "@/lib/flags";
import { session } from "@/lib/session";

const RULES = [
  "Up to 10 uploads per round.",
  "One upload per 60 seconds per team. A rejected file also starts the wait.",
  "Scores stay hidden until the organizers publish the leaderboard.",
  "One login per team, given to you by the organizers. Everyone on the team uses it.",
];

function delay(ms: number): CSSProperties {
  return { "--d": `${ms}ms` } as CSSProperties;
}

function Section({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-text">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.9] sm:text-7xl">{title}</h2>
          <p className="mt-5 max-w-2xl text-lg text-muted">{intro}</p>
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
          <span className="text-base sm:text-xl">{rule}</span>
        </li>
      ))}
    </ol>
  );
}

export default function LandingPage() {
  useEffect(() => {
    session.clear();
  }, []);

  return (
    <>
      <Head>
        <title>BigShort</title>
        <meta
          name="description"
          content="A five-hour machine learning trading sprint. Build a model, survive the crash, then trade your own signal."
        />
      </Head>

      <header className="border-b-2 border-text">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-baseline gap-[0.22em] font-display text-2xl font-extrabold uppercase leading-none">
            <span className="text-down">Big</span>
            <span className="text-muted">Short</span>
          </span>
          <Link href="/login" className="btn-ghost min-h-11 px-4 text-base">
            Log in
          </Link>
        </div>
      </header>

      <main>
        <section className="relative cursor-crosshair overflow-hidden">
          {HERO_ENABLED && <HeroTape />}
          <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6">
            <p className="hero-rise font-mono text-xs uppercase tracking-[0.12em] text-muted" style={delay(0)}>
              DataZen presents
            </p>
            <h1 className="mt-5 flex flex-wrap items-baseline gap-x-[0.22em] font-display text-[clamp(4.75rem,19vw,13rem)] font-extrabold uppercase leading-[0.82]">
              <span className="hero-rise text-down" style={delay(80)}>
                Big
              </span>
              <span className="hero-drop text-muted" style={delay(300)}>
                Short
              </span>
            </h1>
            <p className="hero-rise mt-8 max-w-xl text-lg sm:text-xl" style={delay(460)}>
              A five-hour machine learning trading sprint. Build a model, survive the crash, then trade your own
              signal.
            </p>
            <p
              className="hero-rise mt-6 inline-flex w-fit flex-wrap gap-x-3 gap-y-1 border-2 border-down px-3 py-2 font-mono text-sm font-semibold uppercase tracking-[0.08em] text-down"
              style={delay(520)}
            >
              <span>16 Oct 2026</span>
              <span aria-hidden="true">|</span>
              <span>B416 + B417</span>
              <span aria-hidden="true">|</span>
              <span>Somaiya Vidyavihar University</span>
            </p>
            <div className="hero-rise mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center" style={delay(600)}>
              <Link href="/login" className="btn-label max-sm:w-full">
                Log in
              </Link>
              <Link href="/leaderboard" className="btn-ghost max-sm:w-full">
                See the standings
              </Link>
            </div>
          </div>
        </section>

        <Section title="How the five hours play out" intro="Calm, then chaos, then a new game. Durations are approximate.">
          <Timeline />
        </Section>

        <Section
          title="What you upload"
          intro="One CSV per upload. Every file has exactly 50 rows, with timestamps 1 to 50, each once."
        >
          <div className="grid gap-12 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
            <Reveal className="min-w-0 md:pr-12">
              <h3 className="font-display text-3xl font-extrabold uppercase leading-none">Rounds 1 and 2: predictions</h3>
              <div className="mt-5">
                <FormatHint type="prediction" />
              </div>
            </Reveal>
            <Reveal delay={120} className="min-w-0 md:pl-12">
              <h3 className="font-display text-3xl font-extrabold uppercase leading-none">Round 3: signals</h3>
              <div className="mt-5">
                <FormatHint type="signal" />
              </div>
            </Reveal>
          </div>
        </Section>

        <Section title="How you're scored" intro="Every round is scored out of 100.">
          <div className="grid gap-12 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
            <Reveal className="md:pr-12">
              <h3 className="font-display text-5xl font-extrabold uppercase leading-none text-up sm:text-6xl">
                Rounds 1 and 2
              </h3>
              <p className="mt-5 text-base leading-relaxed text-muted">
                Scored on how well your predictions beat a coin flip, using balanced accuracy and the Matthews
                correlation coefficient. Guessing, or calling UP every time, scores about 0.
              </p>
            </Reveal>
            <Reveal delay={120} className="md:pl-12">
              <h3 className="font-display text-5xl font-extrabold uppercase leading-none text-muted sm:text-6xl">
                Round 3
              </h3>
              <p className="mt-5 text-base leading-relaxed text-muted">
                Your positions are backtested with trading costs. Risk-adjusted returns are rewarded; deep drawdowns
                and trading too often both cost you.
              </p>
            </Reveal>
          </div>
        </Section>

        <Section title="Rules that matter on the day" intro="Read these once, then forget them.">
          <RulesList />
        </Section>

        <Section title="Field guide" intro="Terms you will hear a lot.">
          <FieldGuide />
        </Section>

        <section className="border-t-2 border-text">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-10 px-4 py-24 sm:px-6 sm:py-32">
            <Reveal>
              <h2 className="font-display text-6xl font-extrabold uppercase leading-[0.85] sm:text-8xl">
                Ready for the open?
              </h2>
            </Reveal>
            <Reveal delay={120} className="w-full sm:w-auto">
              <Link href="/login" className="btn-label max-sm:w-full">
                Log in
              </Link>
            </Reveal>
          </div>
        </section>
      </main>
    </>
  );
}
