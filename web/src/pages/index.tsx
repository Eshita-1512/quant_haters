import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";
import FormatHint from "@/components/FormatHint";
import FieldGuide from "@/components/landing/FieldGuide";
import Timeline from "@/components/landing/Timeline";

const RULES = [
  "Up to 10 uploads per round.",
  "One upload per 60 seconds per team. A rejected file also starts the wait.",
  "Scores stay hidden until the organizers publish the leaderboard.",
  "One login per team, given to you by the organizers. Everyone on the team uses it.",
];

const buttonBase =
  "inline-flex h-12 items-center justify-center rounded-lg px-6 text-sm font-semibold transition-colors max-sm:w-full";

function Section({ eyebrow, intro, children }: { eyebrow: string; intro: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">{eyebrow}</p>
      <p className="mt-3 max-w-2xl text-lg">{intro}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function EntryButtons() {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <Link href="/login" className={`${buttonBase} bg-text text-bg hover:bg-text/90`}>
        Log in
      </Link>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>BigShort</title>
        <meta
          name="description"
          content="A five-hour machine learning trading sprint. Build a model, survive the crash, then trade your own signal."
        />
      </Head>

      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <span className="text-sm font-semibold tracking-tight">BIGSHORT</span>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center px-2 text-sm text-muted transition-colors hover:text-text"
        >
          Log in
        </Link>
      </header>

      <main>
        <section className="relative mx-auto max-w-6xl overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
          <svg
            aria-hidden="true"
            viewBox="0 0 600 240"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full opacity-25"
          >
            <path
              d="M0 70 L60 62 L120 74 L180 58 L240 66 L290 60 L330 190 L370 205 L420 198 L470 170 L520 150 L600 120"
              fill="none"
              stroke="var(--down)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="relative">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Machine learning trading sprint</p>
            <h1 className="mt-4 text-6xl font-black leading-none tracking-tighter sm:text-8xl lg:text-9xl">BIGSHORT</h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              A five-hour machine learning trading sprint. Build a model, survive the crash, then trade your own
              signal.
            </p>
            <div className="mt-8">
              <EntryButtons />
            </div>
          </div>
        </section>

        <div data-todo="event-details" />

        <Section eyebrow="How the five hours play out" intro="Calm, then chaos, then a new game. Durations are approximate.">
          <Timeline />
        </Section>

        <Section eyebrow="What you upload" intro="One CSV per upload. Every file has exactly 50 rows, with timestamps 1 to 50, each once.">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Rounds 1 and 2: predictions</h3>
              <div className="mt-3">
                <FormatHint type="prediction" />
              </div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Round 3: signals</h3>
              <div className="mt-3">
                <FormatHint type="signal" />
              </div>
            </div>
          </div>
        </Section>

        <Section eyebrow="How you're scored" intro="Every round is scored out of 100.">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-semibold tracking-tight">Rounds 1 and 2</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Scored on how well your predictions beat a coin flip, using balanced accuracy and the Matthews
                correlation coefficient. Guessing, or calling UP every time, scores about 0.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-semibold tracking-tight">Round 3</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Your positions are backtested with trading costs. Risk-adjusted returns are rewarded; deep drawdowns
                and trading too often both cost you.
              </p>
            </div>
          </div>
        </Section>

        <Section eyebrow="Rules that matter on the day" intro="Read these once, then forget them.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {RULES.map((rule) => (
              <li key={rule} className="rounded-xl border border-line bg-panel px-5 py-4 text-sm text-muted">
                {rule}
              </li>
            ))}
          </ul>
        </Section>

        <Section eyebrow="Field guide" intro="Terms you will hear a lot.">
          <FieldGuide />
        </Section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6">
            <h2 className="text-3xl font-black tracking-tighter sm:text-5xl">Ready for the open?</h2>
            <EntryButtons />
          </div>
        </section>
      </main>
    </>
  );
}
