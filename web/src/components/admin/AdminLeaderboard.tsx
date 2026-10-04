import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePolling } from "@/hooks/usePolling";
import { adminApi, ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import { formatScore } from "@/lib/format";
import type { AdminLeaderboardEntry, RoundCode } from "@/lib/types";

interface AdminLeaderboardProps {
  currentRound: RoundCode;
}

interface RankedEntry extends AdminLeaderboardEntry {
  rank: number;
}

const ROUND_TABS: RoundCode[] = ["R1", "R2", "R3"];

const rankTone: Record<number, string> = {
  1: "text-[#f5c542]",
  2: "text-[#c9d1db]",
  3: "text-[#d99058]",
};

function rankEntries(entries: AdminLeaderboardEntry[]): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.team.localeCompare(b.team));
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((entry) => {
    if (previous === null || entry.score !== previous) rank += 1;
    previous = entry.score;
    return { ...entry, rank };
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "--";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function AdminLeaderboard({ currentRound }: AdminLeaderboardProps) {
  const [picked, setPicked] = useState<RoundCode | null>(null);
  const round = picked ?? currentRound;
  const [data, setData] = useState<{ round: RoundCode; entries: AdminLeaderboardEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const entries = await adminApi.getLeaderboard(round);
      setData({ round, entries: Array.isArray(entries) ? entries : [] });
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(err instanceof Error ? err.message : "Could not load the leaderboard.");
    }
  }, [round]);

  const refresh = usePolling(load, config.adminPollMs);
  useLiveRefresh(refresh, true);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {}
  };

  const entries = data && data.round === round ? data.entries : null;
  const ranked = useMemo(() => (entries ? rankEntries(entries) : []), [entries]);
  const [min, max] = useMemo(() => {
    if (ranked.length === 0) return [0, 1];
    const scores = ranked.map((entry) => entry.score);
    return [Math.min(...scores), Math.max(...scores)];
  }, [ranked]);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? ranked.filter((entry) => entry.team.toLowerCase().includes(needle) || entry.team_code.toLowerCase().includes(needle))
    : ranked;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-4 ${fullscreen ? "overflow-y-auto bg-bg p-8 sm:p-12" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {fullscreen && <h2 className="mr-4 text-3xl font-semibold tracking-tight">Leaderboard</h2>}
        <div role="tablist" aria-label="Round" className="flex rounded-lg border border-line-strong p-0.5">
          {ROUND_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tab === round}
              onClick={() => setPicked(tab === currentRound ? null : tab)}
              className={`h-8 rounded-md px-3 font-mono text-xs transition-colors ${
                tab === round ? "bg-panel-2 text-text" : "text-muted hover:text-text"
              }`}
            >
              {tab}
              {tab === currentRound && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-up align-middle" />}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find team or code"
          aria-label="Filter teams"
          className="h-9 w-44 rounded-lg border border-line-strong bg-bg px-3 text-sm outline-none placeholder:text-faint focus:border-accent"
        />
        <span className="ml-auto font-mono text-xs text-faint">
          {ranked.length} teams{updatedAt ? ` / ${updatedAt.toLocaleTimeString()}` : ""}
        </span>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="h-9 rounded-lg border border-line-strong px-3 text-xs text-muted transition-colors hover:text-text"
        >
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      {error && (
        <div role="status" className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className={`w-full border-collapse ${fullscreen ? "text-lg" : "text-sm"}`}>
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <th scope="col" className="w-16 px-4 py-3 text-left font-medium">Rank</th>
              <th scope="col" className="px-2 py-3 text-left font-medium">Team</th>
              <th scope="col" className="px-2 py-3 text-left font-medium">Code</th>
              <th scope="col" className="hidden w-1/4 px-2 py-3 md:table-cell">
                <span className="sr-only">Score bar</span>
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Subs</th>
              <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">Last</th>
              <th scope="col" className="w-24 px-2 py-3 text-right font-medium">Public</th>
              <th scope="col" className="w-24 px-4 py-3 text-right font-medium">Private</th>
            </tr>
          </thead>
          <tbody>
            {entries === null &&
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={index} className="border-b border-line last:border-0">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="h-5 animate-pulse rounded bg-panel-2" />
                  </td>
                </tr>
              ))}
            {entries !== null && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                  {ranked.length === 0 ? `No scored submissions for ${round} yet.` : "No teams match that search."}
                </td>
              </tr>
            )}
            {filtered.map((entry) => {
              const width = max === min ? 100 : 8 + ((entry.score - min) / (max - min)) * 92;
              return (
                <tr key={entry.team_code} className="border-b border-line transition-colors last:border-0 hover:bg-panel-2">
                  <td className={`tabular px-4 py-2.5 font-mono font-semibold ${rankTone[entry.rank] ?? "text-muted"}`}>
                    {String(entry.rank).padStart(2, "0")}
                  </td>
                  <td className="px-2 py-2.5 font-medium">{entry.team}</td>
                  <td className="px-2 py-2.5 font-mono text-xs text-muted">{entry.team_code}</td>
                  <td className="hidden px-2 py-2.5 md:table-cell">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full rounded-full ${entry.score < 0 ? "bg-down" : entry.rank <= 3 ? "bg-up" : "bg-up/50"}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </td>
                  <td className="tabular px-2 py-2.5 text-right font-mono text-muted">{entry.submissions}</td>
                  <td className="hidden px-2 py-2.5 text-right font-mono text-xs text-faint sm:table-cell">
                    {timeAgo(entry.last_submission_at)}
                  </td>
                  <td
                    className={`tabular px-2 py-2.5 text-right font-mono font-semibold ${
                      entry.score < 0 ? "text-down" : "text-text"
                    }`}
                  >
                    {formatScore(entry.score)}
                  </td>
                  <td
                    className={`tabular px-4 py-2.5 text-right font-mono font-semibold ${
                      entry.private_score !== null && entry.private_score < 0 ? "text-down" : "text-text"
                    }`}
                  >
                    {entry.private_score !== null ? formatScore(entry.private_score) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
