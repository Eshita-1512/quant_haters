import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import AppHeader from "@/components/AppHeader";
import Panel from "@/components/Panel";
import BruteForceTelemetry from "@/components/BruteForceTelemetry";
import DecipherText from "@/components/DecipherText";
import { api } from "@/lib/api";
import { formatScore } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { CumulativeLeaderboardEntry, LeaderboardEntry, PublicFinalResults } from "@/lib/types";

const rankTone: Record<number, string> = {
  1: "text-gold border-gold/40 bg-gold/10",
  2: "text-silver border-silver/40 bg-silver/10",
  3: "text-bronze border-bronze/40 bg-bronze/10",
};

export default function PublicLeaderboardPage() {
  const [snapshotEntries, setSnapshotEntries] = useState<LeaderboardEntry[]>([]);
  const [cumulativeEntries, setCumulativeEntries] = useState<CumulativeLeaderboardEntry[]>([]);
  const [finalResults, setFinalResults] = useState<PublicFinalResults>({ status: "pending", rankings: [] });
  const [mode, setMode] = useState<"cumulative" | "snapshot">("cumulative");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { hydrated, team } = useSession();
  const activeTeam = hydrated ? team : null;

  const fetchStandings = useCallback(async () => {
    try {
      const [snap, cum, fin] = await Promise.allSettled([
        api.getLeaderboard(),
        api.getCumulativeLeaderboard(),
        api.getFinalResults(),
      ]);

      if (snap.status === "fulfilled" && Array.isArray(snap.value)) {
        setSnapshotEntries(snap.value);
      }
      if (cum.status === "fulfilled" && Array.isArray(cum.value)) {
        setCumulativeEntries(cum.value);
      }
      if (fin.status === "fulfilled" && fin.value) {
        setFinalResults(fin.value);
      }

      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load leaderboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStandings();
    const interval = setInterval(fetchStandings, 10000);
    return () => clearInterval(interval);
  }, [fetchStandings]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const isFinal = finalResults.status === "success";

  const filteredCumulative = useMemo(() => {
    // Teams with no score in any round are not listed.
    const scored = cumulativeEntries.filter(
      (item) => item.r1_score != null || item.r2_score != null || item.r3_score != null,
    );
    if (!query.trim()) return scored;
    const q = query.trim().toLowerCase();
    return scored.filter((item) => item.team.toLowerCase().includes(q));
  }, [cumulativeEntries, query]);

  const filteredSnapshot = useMemo(() => {
    if (!query.trim()) return snapshotEntries;
    const q = query.trim().toLowerCase();
    return snapshotEntries.filter((item) => item.team.toLowerCase().includes(q));
  }, [snapshotEntries, query]);

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
              <span className={`h-2 w-2 rounded-full ${isFinal ? "bg-gold" : "bg-up animate-pulse"}`} />
              <span className="font-mono text-xs uppercase tracking-wider text-muted">
                {isFinal ? "Official Event Final Standings" : "Official Standings"}
              </span>
              <span className="font-mono text-xs uppercase tracking-wider text-accent">[0xBF // LEADERBOARD_MATRIX]</span>
            </div>
            <h1 className="mt-1 font-display text-5xl font-extrabold uppercase leading-none">
              <DecipherText text="Leaderboard" autoStart={true} delayMs={50} />
            </h1>
            <p className="text-sm text-muted">
              {isFinal
                ? "Final Backtest completed! Official cumulative standings with Round 1 (20%), Round 2 (35%), and Round 3 (45%) weights."
                : "Official event standings with weighted round scores. Auto-updates every 10 seconds."}
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
              className="rounded-lg border border-line-strong px-3 py-1.5 font-mono text-xs text-muted hover:border-line hover:text-text transition-colors"
            >
              {fullscreen ? "Exit Fullscreen" : "Projector Mode"}
            </button>
          </div>
        </div>

        <BruteForceTelemetry />

        {isFinal && (
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <div>
                <h2 className="font-display text-lg font-bold uppercase text-gold">Final Backtest Results Published</h2>
                <p className="text-xs text-muted">
                  The final Round 3 backtest has concluded. Below are the official final cumulative rankings (Round 1: 20%, Round 2: 35%, Round 3: 45%).
                </p>
              </div>
            </div>
          </div>
        )}

        <Panel>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("cumulative")}
                  className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                    mode === "cumulative"
                      ? "bg-text text-bg"
                      : "border border-line text-muted hover:border-line-strong hover:text-text"
                  }`}
                >
                  Cumulative Standings (20% R1 + 35% R2 + 45% R3)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("snapshot")}
                  className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                    mode === "snapshot"
                      ? "bg-text text-bg"
                      : "border border-line text-muted hover:border-line-strong hover:text-text"
                  }`}
                >
                  Round Snapshot
                </button>
              </div>

              <div className="flex items-center gap-3">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search team..."
                  aria-label="Search teams"
                  className="h-9 w-full max-w-xs rounded-lg border border-line-strong bg-bg px-3 font-mono text-xs outline-none focus:border-accent"
                />
                <span className="font-mono text-xs text-muted whitespace-nowrap">
                  {mode === "cumulative" ? filteredCumulative.length : filteredSnapshot.length} ranked
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex h-48 items-center justify-center font-mono text-sm text-muted">
                Loading standings...
              </div>
            ) : mode === "cumulative" ? (
              filteredCumulative.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="font-display text-3xl font-extrabold uppercase">No cumulative standings yet</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    Team rankings will update as scores are recorded across rounds.
                  </p>
                  <Link
                    href={activeTeam ? "/dashboard" : "/"}
                    className="press mt-6 rounded-md bg-text px-4 py-2 text-xs font-semibold text-bg hover:bg-text/90"
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
                        <th className="py-3 px-3 text-right">R1 (20%)</th>
                        <th className="py-3 px-3 text-right">R2 (35%)</th>
                        <th className="py-3 px-3 text-right">R3 (45%)</th>
                        <th className="py-3 px-3 text-right">Submissions</th>
                        <th className="py-3 px-3 text-right">Cumulative Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {filteredCumulative.map((item, index) => {
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
                                  className={`inline-grid h-6 w-6 place-items-center rounded-md border text-xs font-bold ${badge}`}
                                >
                                  {item.rank}
                                </span>
                              ) : (
                                <span className="text-muted tabular">
                                  {String(item.rank).padStart(2, "0")}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-medium">
                              <span className="flex items-center gap-2">
                                {item.team}
                                {isMyTeam && (
                                  <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] text-accent font-normal">
                                    Your Team
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-muted tabular">
                              {item.r1_score != null ? formatScore(Number(item.r1_score)) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-muted tabular">
                              {item.r2_score != null ? formatScore(Number(item.r2_score)) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-muted tabular">
                              {item.r3_score != null ? formatScore(Number(item.r3_score)) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-muted tabular">
                              {item.submissions}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono font-bold tabular ${
                                item.cumulative_score < 0 ? "text-down" : isPodium ? "text-up" : "text-text"
                              }`}
                            >
                              {formatScore(item.cumulative_score)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : filteredSnapshot.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="font-display text-3xl font-extrabold uppercase">No standings published yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  Organizers publish official snapshots throughout the event. Once published, team rankings will appear here.
                </p>
                <Link
                  href={activeTeam ? "/dashboard" : "/"}
                  className="press mt-6 rounded-md bg-text px-4 py-2 text-xs font-semibold text-bg hover:bg-text/90"
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
                    {filteredSnapshot.map((item, index) => {
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
                                className={`inline-grid h-6 w-6 place-items-center rounded-md border text-xs font-bold ${badge}`}
                              >
                                {item.rank}
                              </span>
                            ) : (
                              <span className="text-muted tabular">
                                {String(item.rank).padStart(2, "0")}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-medium">
                            <span className="flex items-center gap-2">
                              {item.team}
                              {isMyTeam && (
                                <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] text-accent font-normal">
                                  Your Team
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-muted tabular">
                            {item.submissions}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-semibold tabular ${
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
