import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { adminApi } from "@/lib/api";
import { integrityMessages } from "@/lib/config";
import { formatScore } from "@/lib/format";
import type {
  AdminLeaderboardEntry,
  IntegrityApplyItem,
  IntegrityResults,
  IntegrityStatus,
  IntegritySubmission,
  IntegrityTeam,
  RoundCode,
  ScoreAdjustment,
  TeamNoticeRecord,
} from "@/lib/types";

interface IntegrityPanelProps {
  currentRound: RoundCode;
}

type Dialog =
  | { kind: "apply"; team: IntegrityTeam; custom: boolean }
  | { kind: "all" }
  | { kind: "revoke"; adjustment: ScoreAdjustment }
  | null;

const ROUND_TABS: RoundCode[] = ["R1", "R2"];
const STATUS_ORDER: Record<IntegrityStatus, number> = { FLAGGED: 0, REVIEW: 1, OK: 2, NO_FILE: 3, NO_TARGETS: 3 };
const COLUMN_COUNT = 10;

const statusTone: Record<IntegrityStatus, string> = {
  FLAGGED: "border-down/50 bg-down-soft text-down",
  REVIEW: "border-warn/50 bg-warn-soft text-warn",
  OK: "border-line-strong text-muted",
  NO_FILE: "border-line-strong text-faint",
  NO_TARGETS: "border-line-strong text-faint",
};

const labelClass = "font-mono text-[11px] uppercase tracking-[0.08em] text-muted";
const inputClass =
  "h-9 w-20 rounded-lg border border-line-strong bg-bg px-2 text-right font-mono text-sm outline-none focus:border-accent";
const smallButton = "h-8 rounded-md border border-line-strong px-2.5 font-mono text-xs text-muted transition-colors hover:text-text disabled:opacity-40";
const alertClass = "rounded-lg border border-down/50 bg-down-soft px-3 py-2 text-sm text-down";

function pct(value: number | null | undefined): string {
  return value == null ? "-" : `${Math.round(value * 100)}%`;
}

function clock(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function clockShort(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Mirrors adjusted() in app/services/leaderboard.py.
function applyPenalty(score: number, penalty: number): number {
  if (penalty <= 0) return score;
  return Math.max(score - penalty, Math.min(score, 0));
}

function messageFor(key: IntegrityTeam["suggested_message_key"]): string {
  return key ? integrityMessages[key] : "";
}

function suggestedLabel(team: IntegrityTeam): string {
  if (team.suggested_points <= 0) return "None";
  const warning = team.suggested_message_key === "WARNING_LOOKAHEAD" ? "look-ahead warning" : "check warning";
  return `-${team.suggested_points} + ${warning}`;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface ApplyDialogProps {
  round: RoundCode;
  team: IntegrityTeam;
  entry: AdminLeaderboardEntry | undefined;
  custom: boolean;
  onCancel: () => void;
  onDone: (message: string) => void;
}

function ApplyDialog({ round, team, entry, custom, onCancel, onDone }: ApplyDialogProps) {
  const [points, setPoints] = useState(custom ? "" : String(team.suggested_points));
  const [message, setMessage] = useState(custom ? "" : messageFor(team.suggested_message_key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = team.current_adjustment?.points ?? null;
  const pointsNumber = Number(points);
  const pointsValid = points.trim() !== "" && Number.isFinite(pointsNumber) && pointsNumber >= 0.5 && pointsNumber <= 100;
  const messageText = message.trim();
  const messageValid = messageText.length > 0 && messageText.length <= 1000;

  // The current lookahead deduction is replaced, so it is taken out of the penalty before adding the new one.
  const basePenalty = entry ? entry.penalty - (current ?? 0) : 0;
  const before = entry ? entry.adjusted_score : null;
  const after = entry && pointsValid ? applyPenalty(entry.score, basePenalty + pointsNumber) : null;

  const confirm = async () => {
    if (!pointsValid) {
      setError("Points must be between 0.5 and 100.");
      return;
    }
    if (!messageValid) {
      setError("Enter the message the team will see (1000 characters or less).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.integrityApply({
        round,
        items: [{ team_code: team.team_code, points: pointsNumber, message: messageText }],
      });
      onDone(`Sent -${pointsNumber.toFixed(2)} and the message to ${team.team_code}.`);
    } catch (err) {
      setError(errorText(err, "Could not apply the deduction."));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={`Apply deduction to ${team.team_code}?`}
      confirmLabel="Apply deduction and send"
      busy={busy}
      onCancel={onCancel}
      onConfirm={confirm}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className={labelClass}>Team</dt>
            <dd className="mt-1 text-sm font-medium text-text">
              {team.team_name} <span className="font-mono text-xs text-muted">{team.team_code}</span>
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Round</dt>
            <dd className="mt-1 font-mono text-sm text-text">{round}</dd>
          </div>
        </dl>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Points</span>
          <input
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            className="h-10 rounded-lg border border-line-strong bg-bg px-3 font-mono text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Message to the team</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
            rows={5}
            className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent"
          />
        </label>

        <p className="font-mono text-xs text-text">
          Round score: {before == null ? "no scored submission" : `${formatScore(before)} -> ${after == null ? "-" : formatScore(after)}`}{" "}
          {before != null && <span className="text-muted">after deduction</span>}
        </p>
        {current != null && (
          <p className="text-xs text-warn">This replaces the current -{current.toFixed(2)} deduction.</p>
        )}
        <p className="text-xs text-muted">The team sees only this message.</p>
        {error && (
          <p role="alert" className={alertClass}>
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}

interface ApplyAllDialogProps {
  round: RoundCode;
  items: IntegrityApplyItem[];
  teams: IntegrityTeam[];
  onCancel: () => void;
  onDone: (message: string) => void;
}

function ApplyAllDialog({ round, items, teams, onCancel, onDone }: ApplyAllDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.integrityApply({ round, items });
      onDone(`Applied deductions and sent messages to ${items.length} teams.`);
    } catch (err) {
      setError(errorText(err, "Could not apply the deductions."));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={`Apply all suggested ${round} actions?`}
      confirmLabel={`Apply to ${items.length} teams`}
      busy={busy}
      onCancel={onCancel}
      onConfirm={confirm}
    >
      <div className="flex flex-col gap-3">
        <p>Each listed team gets its deduction and message. Any current look-ahead deduction for these teams is replaced.</p>
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {items.map((item) => {
            const team = teams.find((entry) => entry.team_code === item.team_code);
            return (
              <li key={item.team_code} className="flex flex-col gap-1 px-3 py-2.5">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-muted">{item.team_code}</span>
                  <span className="font-medium text-text">{team?.team_name ?? ""}</span>
                  <span className="ml-auto font-mono text-xs font-semibold text-down">-{item.points.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted">{item.message}</p>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">The teams see only their messages.</p>
        {error && (
          <p role="alert" className={alertClass}>
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}

export default function IntegrityPanel({ currentRound }: IntegrityPanelProps) {
  const [round, setRound] = useState<RoundCode>(currentRound === "R2" ? "R2" : "R1");
  const [flagPct, setFlagPct] = useState("70");
  const [reviewPct, setReviewPct] = useState("60");
  const [rulePct, setRulePct] = useState("70");
  const [results, setResults] = useState<IntegrityResults | null>(null);
  const [entries, setEntries] = useState<Record<string, AdminLeaderboardEntry>>({});
  const [adjustments, setAdjustments] = useState<ScoreAdjustment[]>([]);
  const [notices, setNotices] = useState<TeamNoticeRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [revoking, setRevoking] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRound = useCallback(async (target: RoundCode) => {
    try {
      const [next, board] = await Promise.all([adminApi.integrityResults(target), adminApi.getLeaderboard(target)]);
      setResults(next);
      setEntries(Object.fromEntries(board.map((entry) => [entry.team_code, entry])));
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err, "Could not load the integrity results."));
    }
  }, []);

  const loadLists = useCallback(async () => {
    try {
      const [rows, messages] = await Promise.all([adminApi.listAdjustments(), adminApi.listNotices()]);
      setAdjustments(rows);
      setNotices(messages);
    } catch (err) {
      setLoadError(errorText(err, "Could not load deductions and messages."));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadRound(round), loadLists()]);
  }, [round, loadRound, loadLists]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const changeRound = (next: RoundCode) => {
    setRound(next);
    setResults(null);
    setExpanded(new Set());
    setSuccess(null);
  };

  const runCheck = async () => {
    const flag = Number(flagPct) / 100;
    const review = Number(reviewPct) / 100;
    const ruleMin = Number(rulePct) / 100;
    const valid = [flag, review, ruleMin].every((value) => Number.isFinite(value) && value > 0 && value <= 1);
    if (!valid || review > flag) {
      setRunError("Percentages must be between 1 and 100, and Review must be at or below Flag.");
      return;
    }
    setRunning(true);
    setRunError(null);
    setSuccess(null);
    try {
      setResults(await adminApi.integrityRun({ round, flag, review, rule_min: ruleMin }));
      setExpanded(new Set());
    } catch (err) {
      setRunError(`Run check: ${errorText(err, "The check failed.")}`);
    } finally {
      setRunning(false);
    }
  };

  const afterAction = async (message: string) => {
    setDialog(null);
    setSuccess(message);
    await refreshAll();
  };

  const revoke = async (adjustment: ScoreAdjustment) => {
    setRevoking(true);
    try {
      await adminApi.revokeAdjustment(adjustment.id);
      setDialog(null);
      setSuccess(`Revoked the ${adjustment.team_code} deduction in ${adjustment.round}.`);
      await refreshAll();
    } catch (err) {
      setDialog(null);
      setLoadError(errorText(err, "Could not revoke the deduction."));
    } finally {
      setRevoking(false);
    }
  };

  const teams = results?.teams ?? [];
  const visibleTeams = useMemo(() => {
    const rows = onlyFlagged ? teams.filter((team) => team.status === "FLAGGED" || team.status === "REVIEW") : teams;
    return [...rows].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (b.worst_agreement ?? -1) - (a.worst_agreement ?? -1) ||
        a.team_code.localeCompare(b.team_code),
    );
  }, [teams, onlyFlagged]);

  const actionable = teams.filter((team) => team.suggested_points > 0);
  const applyAllItems: IntegrityApplyItem[] = actionable.map((team) => ({
    team_code: team.team_code,
    points: team.suggested_points,
    message: messageFor(team.suggested_message_key),
  }));

  const submissionsFor = (teamCode: string) =>
    (results?.submissions ?? []).filter((sub) => sub.team_code === teamCode);

  const toggleExpanded = (teamCode: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(teamCode)) next.delete(teamCode);
      else next.add(teamCode);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div role="tablist" aria-label="Round" className="flex rounded-lg border border-line-strong p-0.5">
          {ROUND_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tab === round}
              onClick={() => changeRound(tab)}
              className={`h-8 rounded-md px-3 font-mono text-xs transition-colors ${
                tab === round ? "bg-panel-2 text-text" : "text-muted hover:text-text"
              }`}
            >
              {tab}
              {tab === currentRound && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-up align-middle" />}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Flag %</span>
          <input type="number" min={1} max={100} value={flagPct} onChange={(event) => setFlagPct(event.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Review %</span>
          <input type="number" min={1} max={100} value={reviewPct} onChange={(event) => setReviewPct(event.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Rule min %</span>
          <input type="number" min={1} max={100} value={rulePct} onChange={(event) => setRulePct(event.target.value)} className={inputClass} />
        </label>

        <button
          type="button"
          onClick={runCheck}
          disabled={running}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-text px-4 text-sm font-semibold text-bg transition-colors hover:bg-text/90 disabled:cursor-wait disabled:bg-line-strong disabled:text-muted"
        >
          {running && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          {running ? "Checking..." : "Run check"}
        </button>

        <span className="ml-auto font-mono text-xs text-faint">
          {results?.checked_at ? `Last checked ${clock(results.checked_at)}` : "Not checked yet"}
        </span>
      </div>

      {runError && (
        <p role="alert" className={alertClass}>
          {runError}
        </p>
      )}
      {loadError && (
        <p role="alert" className={alertClass}>
          {loadError}
        </p>
      )}
      {success && <p className="font-mono text-xs text-up">{success}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(event) => setOnlyFlagged(event.target.checked)}
            className="h-4 w-4 accent-down"
          />
          Show flagged and review only
        </label>
        <button
          type="button"
          onClick={() => setDialog({ kind: "all" })}
          disabled={running || actionable.length === 0}
          className="ml-auto h-9 rounded-lg border border-down/50 px-3 text-sm font-semibold text-down transition-colors hover:bg-down-soft disabled:opacity-40"
        >
          Apply to all suggested
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              <th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
              <th scope="col" className="px-2 py-3 text-left font-medium">Team</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Worst sub</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Match</th>
              <th scope="col" className="px-2 py-3 text-left font-medium">Rule</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Public</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Private</th>
              <th scope="col" className="px-2 py-3 text-left font-medium">Suggested action</th>
              <th scope="col" className="px-2 py-3 text-left font-medium">Current deduction</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results === null && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-4 py-3">
                  <div className="h-5 animate-pulse rounded bg-panel-2" />
                </td>
              </tr>
            )}
            {results !== null && teams.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-4 py-10 text-center text-sm text-muted">
                  No check has been run for {round} yet. Press Run check after submissions arrive.
                </td>
              </tr>
            )}
            {results !== null && teams.length > 0 && visibleTeams.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-4 py-10 text-center text-sm text-muted">
                  No teams are flagged or in review for {round}.
                </td>
              </tr>
            )}
            {visibleTeams.map((team) => {
              const entry = entries[team.team_code];
              const canApply = team.suggested_points > 0;
              return (
                <TeamRows
                  key={team.team_code}
                  team={team}
                  entry={entry}
                  canApply={canApply}
                  open={expanded.has(team.team_code)}
                  submissions={submissionsFor(team.team_code)}
                  onToggle={() => toggleExpanded(team.team_code)}
                  onApply={() => setDialog({ kind: "apply", team, custom: false })}
                  onCustom={() => setDialog({ kind: "apply", team, custom: true })}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className={labelClass}>Deductions</h3>
          {adjustments.length === 0 ? (
            <p className="text-sm text-faint">No deductions yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-muted">
                    <th className="px-3 py-2 text-left font-medium">Team</th>
                    <th className="px-2 py-2 text-left font-medium">Round</th>
                    <th className="px-2 py-2 text-left font-medium">Kind</th>
                    <th className="px-2 py-2 text-right font-medium">Points</th>
                    <th className="px-2 py-2 text-left font-medium">Reason</th>
                    <th className="px-2 py-2 text-left font-medium">By</th>
                    <th className="px-2 py-2 text-left font-medium">Time</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((row) => {
                    const revoked = row.revoked_at !== null;
                    return (
                      <tr key={row.id} className={`border-b border-line last:border-0 ${revoked ? "text-faint line-through" : ""}`}>
                        <td className="px-3 py-2 font-mono text-xs">{row.team_code}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.round}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.kind}</td>
                        <td className={`tabular px-2 py-2 text-right font-mono text-xs font-semibold ${revoked ? "" : "text-down"}`}>
                          -{row.points.toFixed(2)}
                        </td>
                        <td className="max-w-[16rem] truncate px-2 py-2 text-xs" title={row.reason}>{row.reason}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.created_by}</td>
                        <td className="px-2 py-2 font-mono text-xs">{clockShort(row.created_at)}</td>
                        <td className="px-3 py-2 text-right">
                          {revoked ? (
                            <span className="font-mono text-[10px] uppercase">Revoked</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDialog({ kind: "revoke", adjustment: row })}
                              className={smallButton}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={labelClass}>Messages sent</h3>
          {notices.length === 0 ? (
            <p className="text-sm text-faint">No messages sent yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-muted">
                    <th className="px-3 py-2 text-left font-medium">Team</th>
                    <th className="px-2 py-2 text-left font-medium">Message</th>
                    <th className="px-2 py-2 text-left font-medium">Time</th>
                    <th className="px-3 py-2 text-left font-medium">Team status</th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{row.team_code}</td>
                      <td className="max-w-[18rem] truncate px-2 py-2 text-xs" title={row.message}>
                        {row.message}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{clockShort(row.created_at)}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.acknowledged_at ? <span className="text-up">Acknowledged</span> : <span className="text-muted">Not yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {dialog?.kind === "apply" && (
        <ApplyDialog
          key={`${dialog.team.team_code}-${dialog.custom ? "custom" : "suggested"}`}
          round={round}
          team={dialog.team}
          entry={entries[dialog.team.team_code]}
          custom={dialog.custom}
          onCancel={() => setDialog(null)}
          onDone={afterAction}
        />
      )}
      {dialog?.kind === "all" && (
        <ApplyAllDialog
          round={round}
          items={applyAllItems}
          teams={teams}
          onCancel={() => setDialog(null)}
          onDone={afterAction}
        />
      )}
      {dialog?.kind === "revoke" && (
        <ConfirmDialog
          title="Revoke this deduction?"
          confirmLabel="Revoke deduction"
          tone="danger"
          busy={revoking}
          onCancel={() => setDialog(null)}
          onConfirm={() => revoke(dialog.adjustment)}
        >
          <p>
            {dialog.adjustment.team_code} gets back {dialog.adjustment.points.toFixed(2)} points in {dialog.adjustment.round}. The
            message already sent to the team is not changed.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

interface TeamRowsProps {
  team: IntegrityTeam;
  entry: AdminLeaderboardEntry | undefined;
  canApply: boolean;
  open: boolean;
  submissions: IntegritySubmission[];
  onToggle: () => void;
  onApply: () => void;
  onCustom: () => void;
}

function TeamRows({ team, entry, canApply, open, submissions, onToggle, onApply, onCustom }: TeamRowsProps) {
  const adjustment = team.current_adjustment;
  return (
    <>
      <tr className="border-b border-line transition-colors hover:bg-panel-2">
        <td className="px-3 py-2.5">
          <span className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusTone[team.status]}`}>
            {team.status}
          </span>
        </td>
        <td className="px-2 py-2.5">
          <span className="font-medium">{team.team_name}</span>{" "}
          <span className="font-mono text-xs text-muted">{team.team_code}</span>
        </td>
        <td className="tabular px-2 py-2.5 text-right font-mono text-xs text-muted">
          {String(team.submission_no).padStart(2, "0")}
        </td>
        <td className="tabular px-2 py-2.5 text-right font-mono font-semibold">{pct(team.worst_agreement)}</td>
        <td className="px-2 py-2.5 font-mono text-xs text-muted">{team.worst_rule ?? "-"}</td>
        <td className="tabular px-2 py-2.5 text-right font-mono text-xs text-muted">{formatScore(team.public_score)}</td>
        <td className="tabular px-2 py-2.5 text-right font-mono text-xs text-muted">
          {team.private_score != null ? formatScore(team.private_score) : "-"}
        </td>
        <td className="px-2 py-2.5 text-xs">{suggestedLabel(team)}</td>
        <td className="px-2 py-2.5 font-mono text-xs">
          {adjustment ? (
            <span className="text-down">
              -{adjustment.points.toFixed(2)} <span className="text-faint">(applied {clockShort(adjustment.created_at)})</span>
            </span>
          ) : (
            "-"
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex justify-end gap-1.5">
            {canApply && (
              <button type="button" onClick={onApply} className="h-8 rounded-md border border-down/50 px-2.5 font-mono text-xs text-down transition-colors hover:bg-down-soft">
                Apply
              </button>
            )}
            <button type="button" onClick={onToggle} className={smallButton} aria-expanded={open}>
              Details
            </button>
            <button type="button" onClick={onCustom} className={smallButton}>
              Custom...
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-panel-2/40">
          <td colSpan={COLUMN_COUNT} className="px-4 py-3">
            {submissions.length === 0 ? (
              <p className="text-xs text-faint">No scored submissions.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    <th className="py-1.5 text-left font-medium">Sub</th>
                    <th className="py-1.5 text-left font-medium">Submitted</th>
                    <th className="py-1.5 text-right font-medium">Match</th>
                    <th className="py-1.5 pl-4 text-left font-medium">Per-rule match</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr key={sub.submission_id} className="border-t border-line">
                      <td className="py-1.5 font-mono">#{sub.submission_no}</td>
                      <td className="py-1.5 font-mono text-muted">{clock(sub.submitted_at)}</td>
                      <td className="py-1.5 text-right font-mono font-semibold">{pct(sub.worst_agreement)}</td>
                      <td className="py-1.5 pl-4 font-mono text-muted">
                        {Object.entries(sub.rules)
                          .map(([name, rule]) => `${name} ${pct(rule.agreement)} (rule ${pct(rule.rule_acc)})`)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {entry && (
              <p className="mt-2 font-mono text-[11px] text-faint">
                Round score {formatScore(entry.score)}, penalty {entry.penalty > 0 ? `-${entry.penalty.toFixed(2)}` : "-"}, adjusted{" "}
                {formatScore(entry.adjusted_score)}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
