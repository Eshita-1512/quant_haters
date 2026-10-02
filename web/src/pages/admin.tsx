import Head from "next/head";
import { useCallback, useState, type FormEvent } from "react";
import AdminLeaderboard from "@/components/admin/AdminLeaderboard";
import FlashCrashControl from "@/components/admin/FlashCrashControl";
import ResultsControls from "@/components/admin/ResultsControls";
import RoundControls from "@/components/admin/RoundControls";
import TimerControls from "@/components/admin/TimerControls";
import Panel from "@/components/Panel";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useCountdown } from "@/hooks/useCountdown";
import { STATUS_CHANGED_EVENT } from "@/hooks/useLiveRefresh";
import { adminApi } from "@/lib/api";
import { config } from "@/lib/config";
import { phaseLabels } from "@/lib/format";
import { mockAdminBackend } from "@/lib/mock";
import { adminSession, useAdminSession } from "@/lib/session";
import type { AdminStatus } from "@/lib/types";

interface LogEntry {
  id: number;
  label: string;
  ok: boolean;
  at: string;
}

function participantView(status: AdminStatus, seconds: number) {
  const ended = status.round_phase === "completed" || (status.round_phase !== "paused" && seconds === 0);
  const paused = status.round_phase === "paused";
  if (status.current_round === "R3") {
    if (paused) return { label: "Alpha desk, paused", tone: "text-warn border-warn/40 bg-warn-soft" };
    if (ended) return { label: "Alpha desk, closed", tone: "text-muted border-line-strong" };
    return { label: "Alpha desk live", tone: "text-alpha border-alpha/40 bg-alpha-soft" };
  }
  if (status.current_round === "R2" || status.flash_crash_active) {
    if (ended) return { label: "Market stabilizing screen", tone: "text-[#ff8f9b] border-[#ff8f9b]/40 bg-down-soft" };
    if (paused) return { label: "Crash mode, paused", tone: "text-warn border-warn/40 bg-warn-soft" };
    return { label: "Flash crash screen", tone: "text-down border-down/50 bg-down-soft" };
  }
  if (paused) return { label: "Round paused", tone: "text-warn border-warn/40 bg-warn-soft" };
  if (ended) return { label: "Market unstable alert", tone: "text-warn border-warn/40 bg-warn-soft" };
  return { label: "Round live, uploads open", tone: "text-up border-up/40 bg-up-soft" };
}

function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your admin username and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await adminApi.login({ username: username.trim(), password });
      adminSession.save(token, username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md border border-warn/50 bg-panel font-mono text-sm font-semibold text-warn">
          A
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Organizer access</span>
      </div>
      <div className="rounded-2xl border border-line bg-panel p-6 shadow-2xl sm:p-8">
        <h1 className="text-xl font-semibold">Control room</h1>
        <p className="mt-1 text-sm text-muted">Admins only. Every action here is visible to all teams.</p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              spellCheck={false}
              autoFocus
              className="h-11 rounded-lg border border-line-strong bg-bg px-3 font-mono text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-11 rounded-lg border border-line-strong bg-bg px-3 font-mono text-sm outline-none focus:border-accent"
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
            {submitting ? "Signing in..." : "Open control room"}
          </button>
        </form>
        {config.useMocks && (
          <p className="mt-6 border-t border-line pt-4 font-mono text-xs text-faint">
            Mock mode: username &quot;admin&quot;, password &quot;admin&quot;.
          </p>
        )}
      </div>
    </main>
  );
}

function AdminConsole({ user }: { user: string }) {
  const { status, error, clockOffsetMs, apply } = useAdminStatus(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const frozen =
    status && (status.round_phase === "paused" || status.round_phase === "completed")
      ? status.time_remaining_seconds
      : null;
  const seconds = useCountdown(status?.round_ends_at, clockOffsetMs, frozen);

  const run = useCallback(
    async (label: string, action: () => Promise<AdminStatus>) => {
      setBusy(label);
      setActionError(null);
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      try {
        await apply(action);
        setLog((previous) => [{ id: Date.now(), label, ok: true, at }, ...previous].slice(0, 12));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed.";
        setActionError(`${label}: ${message}`);
        setLog((previous) => [{ id: Date.now(), label: `${label} (failed)`, ok: false, at }, ...previous].slice(0, 12));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [apply],
  );

  const view = status ? participantView(status, seconds) : null;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-warn/50 bg-panel font-mono text-xs font-semibold text-warn">
            A
          </span>
          <span className="text-sm font-semibold tracking-tight">Control room</span>
          {config.useMocks && (
            <span className="rounded-full border border-warn/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">
              Mock backend
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted sm:inline">{user}</span>
            {config.useMocks && (
              <button
                type="button"
                onClick={() => {
                  mockAdminBackend.reset();
                  setLog([]);
                  window.dispatchEvent(new Event(STATUS_CHANGED_EVENT));
                }}
                className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-muted transition-colors hover:text-warn"
              >
                Reset mock
              </button>
            )}
            <button
              type="button"
              onClick={() => adminSession.clear()}
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-down hover:text-down"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
        {(error || actionError) && (
          <div role="alert" className="rounded-lg border border-down/50 bg-down-soft px-4 py-2.5 text-sm text-down">
            {actionError ?? `Connection problem: ${error}`}
          </div>
        )}

        {!status ? (
          <div className="grid gap-5">
            <div className="h-28 animate-pulse rounded-xl border border-line bg-panel" />
            <div className="grid gap-5 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-80 animate-pulse rounded-xl border border-line bg-panel" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <section className="grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">{status.current_round}</span>
                  <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                    {phaseLabels[status.round_phase]}
                  </span>
                  <span className="font-mono text-[10px] text-faint">state v{status.state_version}</span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">{status.round_name}</h1>
              </div>
              <dl className="grid grid-cols-3 gap-6 md:text-right">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Participants see</dt>
                  <dd className="mt-1">
                    {view && (
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${view.tone}`}>
                        {view.label}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Submissions</dt>
                  <dd className="tabular mt-1 font-mono text-xl font-semibold">{status.submissions_count}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Teams</dt>
                  <dd className="tabular mt-1 font-mono text-xl font-semibold">{status.teams_total}</dd>
                </div>
              </dl>
            </section>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <Panel title="Timer">
                <TimerControls status={status} seconds={seconds} busy={busy} run={run} />
              </Panel>
              <Panel title="Flash crash" className={status.flash_crash_active ? "border-down/50" : ""}>
                <FlashCrashControl status={status} busy={busy} run={run} />
              </Panel>
              <div className="flex flex-col gap-5 md:col-span-2 xl:col-span-1">
                <Panel title="Rounds">
                  <RoundControls status={status} busy={busy} run={run} />
                </Panel>
                <Panel title="Your actions">
                  {log.length === 0 ? (
                    <p className="text-sm text-faint">No actions yet this session.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5 font-mono text-xs">
                      {log.map((entry) => (
                        <li key={entry.id} className="flex gap-3">
                          <span className="text-faint">{entry.at}</span>
                          <span className={entry.ok ? "text-text" : "text-down"}>{entry.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>

            <Panel title="Results">
              <ResultsControls currentRound={status.current_round} />
            </Panel>

            <Panel title="Leaderboard">
              <AdminLeaderboard currentRound={status.current_round} />
            </Panel>
          </>
        )}
      </main>
    </>
  );
}

export default function AdminPage() {
  const { hydrated, token, user } = useAdminSession();

  return (
    <>
      <Head>
        <title>Control room | Quant ML Trading Challenge</title>
        <meta name="robots" content="noindex" />
      </Head>
      {!hydrated ? null : token ? <AdminConsole user={user ?? "admin"} /> : <AdminLogin />}
    </>
  );
}
