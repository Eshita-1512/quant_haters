import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { session, useSession } from "@/lib/session";

const schedule = [
  { code: "R1", name: "Foundation", detail: "Predict UP or DOWN on calm data" },
  { code: "!!", name: "Flash Crash", detail: "New regime data drops mid event" },
  { code: "R2", name: "Signal Hunt", detail: "Adapt your model to the crash" },
  { code: "R3", name: "Alpha", detail: "Size positions from -1 to +1" },
];

export default function LoginPage() {
  const router = useRouter();
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { token } = useSession();

  useEffect(() => {
    if (token) router.replace("/dashboard");
  }, [token, router]);

  const expired = router.query.expired === "1";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const team = teamId.trim();
    if (!team || !password) {
      setError("Enter your team ID and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token: issued } = await api.login({ team_id: team, password });
      session.save(issued, team.toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign in | Quant ML Trading Challenge</title>
      </Head>
      <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md border border-line-strong bg-panel font-mono text-sm font-semibold text-up">
              Q
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Team portal</span>
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Quant ML
            <br />
            Trading Challenge
          </h1>
          <p className="mt-4 max-w-md text-muted">
            Five hours. One synthetic market. Build a model, survive the crash, then turn your signal into a
            strategy that holds up after costs.
          </p>
          <ol className="mt-10 grid max-w-md gap-px overflow-hidden rounded-xl border border-line bg-line">
            {schedule.map((step) => (
              <li key={step.code} className="flex items-center gap-4 bg-panel px-4 py-3">
                <span
                  className={`w-7 font-mono text-xs font-semibold ${step.code === "!!" ? "text-down" : "text-up"}`}
                >
                  {step.code}
                </span>
                <span className="text-sm font-medium">{step.name}</span>
                <span className="ml-auto text-right text-xs text-muted">{step.detail}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-6 shadow-2xl sm:p-8">
          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use the credentials your organizers gave your team.</p>

          {expired && !error && (
            <p className="mt-5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
              Your session ended. Sign in again to continue.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Team ID</span>
              <input
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                className="h-11 rounded-lg border border-line-strong bg-bg px-3 font-mono text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
                placeholder="A01"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-11 rounded-lg border border-line-strong bg-bg px-3 font-mono text-sm outline-none transition-colors focus:border-accent"
              />
            </label>

            <div aria-live="polite" className="min-h-5">
              {error && <p className="text-sm text-down">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-text text-sm font-semibold text-bg transition-colors hover:bg-text/90 disabled:cursor-wait disabled:bg-line-strong disabled:text-muted"
            >
              {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {submitting ? "Signing in..." : "Enter the market"}
            </button>
          </form>

          {config.useMocks && (
            <p className="mt-6 border-t border-line pt-4 font-mono text-xs text-faint">
              Mock mode: any team ID, password &quot;demo&quot;. Organizers use /admin.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
