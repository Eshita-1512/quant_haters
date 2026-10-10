import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, type FormEvent } from "react";
import PasswordInput from "@/components/entry/PasswordInput";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { session } from "@/lib/session";

const schedule = [
  { code: "R1", name: "Foundation", detail: "Predict UP or DOWN on calm data" },
  { code: "!!", name: "Flash Crash", detail: "New regime data drops mid event" },
  { code: "R2", name: "Signal Hunt", detail: "Adapt your model to the crash" },
  { code: "R3", name: "Alpha", detail: "Size positions from -1 to +1" },
];

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    session.clear();
  }, []);

  const expired = router.query.expired === "1";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // The backend matches team codes exactly, and they are stored in upper case.
    const typed = identifier.trim().toUpperCase();
    if (!typed || !password) {
      setError("Enter your team code and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token: issued } = await api.login({ team_id: typed, password });
      session.save(issued, typed);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "That team code or password didn't match.",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Log in | BigShort</title>
      </Head>
      <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.3em] text-muted hover:text-text">
            BigShort
          </Link>
          <h1 className="mt-6 text-5xl font-black leading-[1] tracking-tighter sm:text-6xl">BIGSHORT</h1>
          <p className="mt-4 max-w-md text-muted">Log in with your team code and password.</p>
          <ol className="mt-10 hidden max-w-md gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid">
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
          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:text-text hover:underline"
          >
            What is BigShort?
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-6 shadow-2xl sm:p-8">
          <h2 className="text-lg font-semibold">Log in</h2>
          <p className="mt-1 text-sm text-muted">Your organizers gave your team a team code and password. Everyone on your team uses the same login.</p>

          {expired && !error && (
            <p className="mt-5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
              Your session ended. Log in again to continue.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-identifier" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Team code
              </label>
              <input
                id="login-identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                className="h-11 rounded-lg border border-line-strong bg-bg px-3 font-mono text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
                placeholder="C04"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Password
              </label>
              <PasswordInput
                id="login-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                warnCapsLock
              />
            </div>

            <div aria-live="polite" className="min-h-5">
              {error && <p className="text-sm text-down">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-text text-sm font-semibold text-bg transition-colors hover:bg-text/90 disabled:cursor-wait disabled:border disabled:border-line-strong disabled:bg-panel-2 disabled:text-muted"
            >
              {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {submitting ? "Logging in..." : "Enter the market"}
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-1 text-sm text-muted">
            <p>Forgot your password? Ask an organizer at the desk.</p>
          </div>

          {config.useMocks && (
            <p className="mt-6 border-t border-line pt-4 font-mono text-xs text-faint">
              Mock mode: any team code, password &quot;demo&quot;. Organizers use /admin.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
