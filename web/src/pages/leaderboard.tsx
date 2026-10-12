import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import AppHeader from "@/components/AppHeader";
import Panel from "@/components/Panel";
import { api } from "@/lib/api";
import { formatScore } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { LeaderboardEntry } from "@/lib/types";

const rankTone: Record<number, string> = {
  1: "text-gold border-gold/40 bg-gold/10",
  2: "text-silver border-silver/40 bg-silver/10",
  3: "text-bronze border-bronze/40 bg-bronze/10",
};

export default function PublicLeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { hydrated, team } = useSession();
  const activeTeam = hydrated ? team : null;

  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await api.getLeaderboard();
      setEntries(Array.isArray(data) ? data : []);
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load leaderboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.trim().toLowerCase();
    return entries.filter((item) => item.team.toLowerCase().includes(q));
  }, [entries, query]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <>
      <Head>
        <title>Public Standings | BigShort</title>
      </Head>
      <AppHeader team={activeTeam || undefined} />

      <main className="mx-auto flex max-w-[120rem] flex-col gap-6 px-6 md:px-10 xl:px-16 py-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 round bg-up animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted">Official Standings</span>
            </div>
            <h1 className="mt-1 font-display text-6xl font-extrabold uppercase leading-none">Leaderboard</h1>
            <p className="text-sm text-muted">
              Official snapshots published by organizers. Auto-updates every 10 seconds.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {updatedAt && (
              <span className="font-mono text-xs text-faint">
                Updated {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="btn-ghost min-h-10 px-3 text-base"
            >
              {fullscreen ? "Exit Fullscreen" : "Projector Mode"}
            </button>
          </div>
        </div>

        <Panel>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search team..."
                aria-label="Search teams"
                className="h-10 w-full max-w-xs border border-line-strong bg-bg px-3 font-mono text-xs outline-none focus:border-accent"
              />
              <span className="font-mono text-xs text-muted">
                {filtered.length} {filtered.length === 1 ? "team" : "teams"} ranked
              </span>
            </div>

            {error && (
              <div className="border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex h-48 items-center justify-center font-mono text-sm text-muted">
                Loading standings...
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="font-display text-3xl font-extrabold uppercase">No standings published yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  Organizers publish official snapshots throughout the event. Once published, team rankings will appear here.
                </p>
                <Link
                  href={activeTeam ? "/dashboard" : "/"}
                  className="press mt-6 bg-text px-4 py-2 text-xs font-semibold text-bg hover:bg-text/90"
                >
                  {activeTeam ? "Return to Dashboard" : "Back to overview"}
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-muted">
                      <th className="py-3 px-3 w-16">Rank</th>
                      <th className="py-3 px-3">Team</th>
                      <th className="py-3 px-3 text-right">Submissions</th>
                      <th className="py-3 px-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {filtered.map((item, index) => {
                      const isPodium = item.rank <= 3;
                      const badge = rankTone[item.rank] || "text-muted border-line";
                      const isMyTeam = activeTeam && item.team.toLowerCase().includes(activeTeam.toLowerCase());

                      return (
                        <tr
                          key={item.team}
                          className={`row-in transition-colors hover:bg-panel-2/50 ${
                            isMyTeam ? "bg-accent-soft font-semibold" : ""
                          }`}
                          style={{ "--d": `${Math.min(index, 12) * 35}ms` } as CSSProperties}
                        >
                          <td className="py-3 px-3 font-mono">
                            {isPodium ? (
                              <span
                                className={`inline-grid h-6 w-6 place-items-center border text-xs font-bold ${badge}`}
                              >
                                {item.rank}
                              </span>
                            ) : (
                              <span className="text-muted tabular">
                                {String(item.rank).padStart(2, "0")}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-base font-semibold sm:text-xl">
                            <span className="flex items-center gap-2">
                              {item.team}
                              {isMyTeam && (
                                <span className="bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] text-accent font-normal">
                                  Your Team
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-muted tabular">
                            {item.submissions}
                          </td>
                          <td
                            className={`text-lg sm:text-2xl py-3 px-3 text-right font-mono font-semibold tabular ${
                              item.score < 0 ? "text-down" : isPodium ? "text-up" : "text-text"
                            }`}
                          >
                            {formatScore(item.score)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
      </main>
    </>
  );
}
