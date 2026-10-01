import Head from "next/head";
import { useEffect, useState } from "react";
import AlphaHero from "@/components/alpha/AlphaHero";
import PositionPreview from "@/components/alpha/PositionPreview";
import AppHeader, { type HeaderMode } from "@/components/AppHeader";
import CountdownTimer from "@/components/CountdownTimer";
import CrashHero from "@/components/CrashHero";
import DownloadButton from "@/components/DownloadButton";
import FileUpload from "@/components/FileUpload";
import FormatHint from "@/components/FormatHint";
import MarketEventOverlay, { type OverlayStage } from "@/components/MarketEventOverlay";
import Panel from "@/components/Panel";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventStatus } from "@/hooks/useEventStatus";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { formatScore, isUploadPhase, phaseLabels } from "@/lib/format";
import { session, useIntroSeen } from "@/lib/session";
import type { EventStatus, UploadSuccess } from "@/lib/types";

interface SubmissionRecord {
  id: number;
  filename: string;
  round: string;
  score: number;
  at: string;
}

function uploadBlockReason(status: EventStatus, seconds: number, remaining: number | null): string | null {
  if (!isUploadPhase(status.round_phase)) {
    return `Uploads are closed. ${status.round_name} is ${phaseLabels[status.round_phase].toLowerCase()}.`;
  }
  if (seconds <= 0) return `${status.round_name} has ended. Uploads are closed.`;
  if (remaining !== null && remaining <= 0) return "You have used every submission for this round.";
  return null;
}

function isCrashRound(status: EventStatus): boolean {
  return status.current_round === "R2" || (status.flash_crash_active && status.current_round !== "R3");
}

function overlayStageFor(status: EventStatus | null, seconds: number, introSeen: string | null | undefined): OverlayStage | null {
  if (!status || introSeen === undefined) return null;
  const roundOver = status.round_phase === "completed" || (isUploadPhase(status.round_phase) && seconds <= 0);
  if (status.current_round === "R3") return introSeen === "R3" ? null : "alpha";
  if (isCrashRound(status)) {
    if (introSeen !== "R2") return "crash";
    return status.current_round === "R2" && roundOver ? "recovery" : null;
  }
  return status.current_round === "R1" && roundOver ? "warning" : null;
}

export default function DashboardPage() {
  const { ready, team } = useRequireAuth();
  const { status, error, clockOffsetMs } = useEventStatus(ready);
  const introSeen = useIntroSeen();
  const [history, setHistory] = useState<SubmissionRecord[]>([]);
  const [remaining, setRemaining] = useState<{ round: string; count: number } | null>(null);
  const [draft, setDraft] = useState<File | null>(null);

  const frozen =
    status && (status.round_phase === "paused" || status.round_phase === "completed")
      ? status.time_remaining_seconds
      : null;
  const seconds = useCountdown(status?.round_ends_at, clockOffsetMs, frozen);

  const overlayStage = overlayStageFor(status, seconds, introSeen);
  const mode: HeaderMode =
    !status || overlayStage !== null
      ? "default"
      : status.current_round === "R3"
        ? "alpha"
        : isCrashRound(status)
          ? "crash"
          : "default";

  useEffect(() => {
    if (status?.current_round === "R1" && !status.flash_crash_active) session.resetIntroSeen();
  }, [status]);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "default") delete root.dataset.mode;
    else root.dataset.mode = mode;
    return () => {
      delete root.dataset.mode;
    };
  }, [mode]);

  const enterRound = () => {
    if (!status) return;
    session.markIntroSeen(status.current_round === "R3" ? "R3" : "R2");
  };

  const onScored = (result: UploadSuccess, filename: string) => {
    if (!status) return;
    setHistory((previous) =>
      [
        {
          id: Date.now(),
          filename,
          round: status.current_round,
          score: result.score,
          at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
        ...previous,
      ].slice(0, 10),
    );
    if (result.submissions_remaining !== undefined) {
      setRemaining({ round: status.current_round, count: result.submissions_remaining });
    }
  };

  const remainingThisRound = status && remaining?.round === status.current_round ? remaining.count : null;
  const roundHistory = status ? history.filter((item) => item.round === status.current_round) : [];
  const bestThisRound = roundHistory.reduce<number | null>(
    (best, item) => (best === null || item.score > best ? item.score : best),
    null,
  );

  const title =
    mode === "crash" ? "FLASH CRASH" : mode === "alpha" ? "Alpha desk" : "Dashboard";

  return (
    <>
      <Head>
        <title>{`${title} | Quant ML Trading Challenge`}</title>
      </Head>
      <AppHeader team={team} mode={mode} />

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <div role="status" className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">
            Connection problem: {error} {status ? "Showing the last known state." : "Retrying..."}
          </div>
        )}

        {!status ? (
          <div className="grid gap-5">
            <div className="h-36 animate-pulse rounded-xl border border-line bg-panel" />
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="h-64 animate-pulse rounded-xl border border-line bg-panel" />
              <div className="h-64 animate-pulse rounded-xl border border-line bg-panel lg:col-span-2" />
            </div>
          </div>
        ) : mode === "alpha" ? (
          <>
            <AlphaHero status={status} seconds={seconds} />

            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <section className="rise-in rounded-2xl border border-line bg-panel p-5 sm:p-6">
                <PositionPreview file={draft} />
              </section>

              <div className="flex flex-col gap-5">
                <Panel title="Submit your book" className="border-alpha/25">
                  <FileUpload
                    key={status.current_round}
                    disabledReason={uploadBlockReason(status, seconds, remainingThisRound)}
                    onScored={onScored}
                    onFileChange={setDraft}
                    submitLabel="Submit positions"
                    variant="alpha"
                  />
                </Panel>
                <Panel title="Desk stats">
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs text-muted">Best R3 score</dt>
                      <dd
                        className={`tabular mt-1 font-mono text-2xl font-semibold ${
                          bestThisRound !== null && bestThisRound < 0 ? "text-down" : "text-alpha-2"
                        }`}
                      >
                        {formatScore(bestThisRound)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Submissions left</dt>
                      <dd className="tabular mt-1 font-mono text-2xl font-semibold">{remainingThisRound ?? "--"}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t border-line pt-4">
                    <DownloadButton label="Download market data" disabled={!status.download_available} />
                  </div>
                </Panel>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
              <Panel title="Required format">
                <FormatHint type={status.submission_type} />
              </Panel>
              <Panel title="Trade log">
                {roundHistory.length === 0 ? (
                  <p className="text-sm text-faint">No books submitted from this browser yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {roundHistory.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-3 py-2 font-mono text-xs">
                        <span className="text-faint">#{roundHistory.length - index}</span>
                        <span className="text-faint">{item.at}</span>
                        <span className="truncate text-text">{item.filename}</span>
                        <span
                          className={`tabular ml-auto font-semibold ${item.score < 0 ? "text-down" : "text-alpha-2"}`}
                        >
                          {item.score >= 0 ? "+" : ""}
                          {formatScore(item.score)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        ) : (
          <>
            {mode === "crash" && (
              <CrashHero message={status.flash_crash_message} downloadAvailable={status.download_available} />
            )}

            <Panel className={mode === "crash" ? "border-down/30" : ""}>
              <CountdownTimer status={status} seconds={seconds} />
            </Panel>

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="flex flex-col gap-5">
                <Panel title="Assigned stock">
                  <p className={`font-mono text-3xl font-semibold tracking-tight ${mode === "crash" ? "text-down" : ""}`}>
                    {status.assigned_stock.code}
                  </p>
                  <p className="mt-1 text-sm text-muted">{status.assigned_stock.name}</p>
                </Panel>

                {mode !== "crash" && (
                  <Panel title="Dataset">
                    <p className="mb-4 text-sm text-muted">Your team&apos;s training and prediction rows for this round.</p>
                    <DownloadButton label="Download data" disabled={!status.download_available} />
                    {!status.download_available && (
                      <p className="text-xs text-muted">The dataset is not available yet.</p>
                    )}
                  </Panel>
                )}

                <Panel title="This round">
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs text-muted">Best score</dt>
                      <dd className="tabular mt-1 font-mono text-xl font-semibold">{formatScore(bestThisRound)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Submissions left</dt>
                      <dd className="tabular mt-1 font-mono text-xl font-semibold">{remainingThisRound ?? "--"}</dd>
                    </div>
                  </dl>
                </Panel>
              </div>

              <Panel
                title={status.submission_type === "position" ? "Upload positions" : "Upload predictions"}
                aside={<span className="font-mono text-[11px] text-faint">{status.current_round}</span>}
                className="lg:col-span-2"
              >
                <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
                  <FileUpload
                    key={status.current_round}
                    disabledReason={uploadBlockReason(status, seconds, remainingThisRound)}
                    onScored={onScored}
                  />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Required format</h3>
                    <FormatHint type={status.submission_type} />
                  </div>
                </div>

                <div className="mt-6 border-t border-line pt-4">
                  <h3 className="mb-2 text-sm font-medium">Recent submissions</h3>
                  {roundHistory.length === 0 ? (
                    <p className="text-sm text-faint">Nothing submitted this round from this browser yet.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {roundHistory.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 py-2 font-mono text-xs">
                          <span className="text-faint">{item.at}</span>
                          <span className="text-muted">{item.round}</span>
                          <span className="truncate text-text">{item.filename}</span>
                          <span className="tabular ml-auto text-up">{formatScore(item.score)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
      </main>

      {overlayStage && status && (
        <MarketEventOverlay
          stage={overlayStage}
          stockCode={status.assigned_stock.code}
          message={status.flash_crash_message}
          roundName={status.round_name}
          onEnter={enterRound}
        />
      )}
    </>
  );
}
