import { useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { adminApi } from "@/lib/api";
import { formatScore } from "@/lib/format";
import type { FinalBacktestResult, RoundCode } from "@/lib/types";

type Action = "snapshot" | "backtest";

interface ResultsControlsProps {
  currentRound: RoundCode;
}

const LABELS: Record<Action, string> = {
  snapshot: "Publish leaderboard",
  backtest: "Run final backtest",
};

function clock(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ResultsControls({ currentRound }: ResultsControlsProps) {
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<FinalBacktestResult | null>(null);

  const confirm = async () => {
    if (!pending) return;
    const action = pending;
    setBusy(true);
    setError(null);
    try {
      if (action === "snapshot") {
        const result = await adminApi.publishSnapshot();
        setPublished(`${currentRound} snapshot published at ${clock()} with ${result.entries} ranked teams.`);
      } else {
        setBacktest(await adminApi.runFinalBacktest());
      }
    } catch (err) {
      setError(`${LABELS[action]}: ${err instanceof Error ? err.message : "Action failed."}`);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 border border-line p-4">
          <p className="text-sm font-medium">Public leaderboard</p>
          <p className="text-xs text-muted">
            Freezes the current {currentRound} best scores into the public leaderboard. Participants never see live
            scores.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPending("snapshot")}
            className="mt-auto h-10 bg-text px-4 text-sm font-semibold text-bg transition-colors hover:bg-text/90 disabled:opacity-40"
          >
            {LABELS.snapshot}
          </button>
        </div>
        <div className="flex flex-col gap-2 border border-line p-4">
          <p className="text-sm font-medium">Final R3 backtest</p>
          <p className="text-xs text-muted">
            Scores each team&apos;s best Round 3 book against the hidden market slice to rank the winners.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPending("backtest")}
            className="mt-auto h-10 border border-alpha/50 px-4 text-sm font-semibold text-alpha transition-colors hover:bg-alpha-soft disabled:opacity-40"
          >
            {LABELS.backtest}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="border border-down/50 bg-down-soft px-3 py-2 text-sm text-down">
          {error}
        </p>
      )}
      {published && <p className="font-mono text-xs text-up">{published}</p>}

      {backtest && (
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Final rankings</p>
          {backtest.rankings.length === 0 ? (
            <p className="text-sm text-faint">No teams were ranked.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Team</th>
                  <th className="px-2 py-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {backtest.rankings.map((entry) => (
                  <tr key={entry.rank} className="border-b border-line last:border-0">
                    <td className="tabular px-2 py-2 font-mono text-xs">{String(entry.rank).padStart(2, "0")}</td>
                    <td className="px-2 py-2">{entry.team}</td>
                    <td
                      className={`tabular px-2 py-2 text-right font-mono ${entry.score < 0 ? "text-down" : "text-text"}`}
                    >
                      {formatScore(entry.score)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === "snapshot" ? `Publish the ${currentRound} leaderboard?` : "Run the final backtest?"}
          confirmLabel={LABELS[pending]}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
        >
          {pending === "snapshot"
            ? "Every visitor to the public leaderboard sees these rankings until you publish again."
            : "Every active team needs a valid Round 3 submission, or the backtest stops without a partial result."}
        </ConfirmDialog>
      )}
    </div>
  );
}
