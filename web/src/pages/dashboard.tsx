import Head from "next/head";
import { useEffect, useState } from "react";
import AlphaHero from "@/components/alpha/AlphaHero";
import PositionPreview from "@/components/alpha/PositionPreview";
import AppHeader, { type HeaderMode } from "@/components/AppHeader";
import CountdownTimer from "@/components/CountdownTimer";
import CrashHero from "@/components/CrashHero";
import DownloadButton from "@/components/DownloadButton";
import EventOver from "@/components/EventOver";
import FileUpload from "@/components/FileUpload";
import FormatHint from "@/components/FormatHint";
import MarketEventOverlay, { type OverlayStage } from "@/components/MarketEventOverlay";
import NoticeBanner from "@/components/NoticeBanner";
import Panel from "@/components/Panel";
import WaitingRoom from "@/components/WaitingRoom";
import BruteForceTelemetry from "@/components/BruteForceTelemetry";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventStatus } from "@/hooks/useEventStatus";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { isUploadPhase, phaseLabels } from "@/lib/format";
import { session, useIntroSeen } from "@/lib/session";
import type { EventStatus, UploadSuccess } from "@/lib/types";

interface SubmissionRecord {
  id: number;
  filename: string;
  round: string;
  submissionNumber: number;
  score?: number;
  at: string;
}

function uploadBlockReason(status: EventStatus, seconds: number, remaining: number | null): string | null {
  if (!isUploadPhase(status.round_phase)) {
    return `Uploads are closed. ${status.round_name} is ${phaseLabels[status.round_phase].toLowerCase()}.`;
  }
  if (seconds <= 0) return `${status.round_name} has ended. Uploads are closed.`;
  if (remaining !== null && remaining <= 0) return "You have used all 10 submissions across all rounds.";
  return null;
}

function isCrashRound(status: EventStatus): boolean {
  return status.current_round === "R2" || (status.flash_crash_active && status.current_round !== "R3");
}

function isEventOver(status: EventStatus | null, seconds: number): boolean {
  if (!status || status.current_round !== "R3" || status.round_phase === "paused") return false;
  return status.round_phase === "completed" || (isUploadPhase(status.round_phase) && seconds <= 0);
}

function overlayStageFor(status: EventStatus | null, seconds: number, introSeen: string | null | undefined): OverlayStage | null {
  if (!status || introSeen === undefined || isEventOver(status, seconds)) return null;
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
  const { status, error, clockOffsetMs, refresh } = useEventStatus(ready);
  const introSeen = useIntroSeen();
  const [history, setHistory] = useState<SubmissionRecord[]>([]);
  const [progress, setProgress] = useState<{ round: string; submitted: number; remaining: number } | null>(null);
  const [draft, setDraft] = useState<File | null>(null);

  const frozen =
    status && (status.round_phase === "paused" || status.round_phase === "completed")
      ? status.time_remaining_seconds
      : null;
  const seconds = useCountdown(status?.round_ends_at, clockOffsetMs, frozen);

  const eventOver = isEventOver(status, seconds);
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

  useEffect(() => {
    if (!team) return;
    try {
      const stored = localStorage.getItem(`quant_submissions_${team}`);
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      // ignore localStorage errors
    }
  }, [team]);

  const onSubmitted = (result: UploadSuccess, filename: string) => {
    if (!status) return;
    const newEntry: SubmissionRecord = {
      id: Date.now(),
      filename,
      round: status.current_round,
      submissionNumber: result.submission_number,
      score: result.public_score,
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    setHistory((previous) => {
      const updated = [newEntry, ...previous].slice(0, 10);
      if (team) {
        try {
          localStorage.setItem(`quant_submissions_${team}`, JSON.stringify(updated));
        } catch {
          // ignore
        }
      }
      return updated;
    });
    setProgress({
      round: status.current_round,
      submitted: result.submission_number,
      remaining: result.submissions_remaining,
    });
  };

  const remainingTotal = progress?.remaining ?? status?.submissions_remaining ?? null;
  const submittedTotal = progress?.submitted ?? status?.submissions_count ?? null;
  const roundHistory = status ? history.filter((item) => item.round === status.current_round) : [];

  const title =
    mode === "crash" ? "FLASH CRASH" : mode === "alpha" ? "Alpha desk" : "Dashboard";

  const [waitingExit, setWaitingExit] = useState(false);
  const wasScheduled = status?.current_round === "R1" && status?.round_phase === "scheduled";
  
  useEffect(() => {
    if (status?.current_round === "R1" && status?.round_phase !== "scheduled" && !waitingExit) {
      setWaitingExit(true);
      const timer = setTimeout(() => {
        setWaitingExit(false);
      }, 3500); // 3.5 seconds burn time
      return () => clearTimeout(timer);
    }
  }, [status?.current_round, status?.round_phase]);

  const showWaitingRoom = wasScheduled || waitingExit;

  return (
    <>
      <Head>
        <title>{`${title} | BigShort`}</title>
      </Head>
      <AppHeader team={team} mode={mode} />

      <main className="mx-auto flex max-w-[120rem] flex-col gap-5 px-6 md:px-10 xl:px-16 py-6 sm:py-8">
        {status?.notices?.[0] && (
          <NoticeBanner key={status.notices[0].id} notice={status.notices[0]} onAcknowledged={refresh} />
        )}
        {error && (
          <div role="status" className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">
            Connection problem: {error} {status ? "Showing the last known state." : "Retrying..."}
          </div>
        )}

        {!status ? (
          <div className="grid gap-5">
            <div className="h-36 animate-pulse rounded-md border border-line bg-panel" />
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="h-64 animate-pulse rounded-md border border-line bg-panel" />
              <div className="h-64 animate-pulse rounded-md border border-line bg-panel lg:col-span-2" />
            </div>
          </div>
        ) : showWaitingRoom ? (
          <WaitingRoom status={status} team={team} isStarting={waitingExit} />
        ) : eventOver ? (
          <EventOver status={status} />
        ) : (
          <>
            {mode === "crash" && <CrashHero message={status.flash_crash_message} />}
            {mode === "alpha" && <AlphaHero status={status} />}

            <BruteForceTelemetry
              stockCode={status.assigned_stock.code}
              roundCode={status.current_round}
            />

            <Panel
              className={mode === "crash" ? "border-down/30" : mode === "alpha" ? "border-alpha/25" : ""}
              telemetryTag="// SYNC_TIMER"
            >
              <CountdownTimer status={status} seconds={seconds} />
            </Panel>

            <div className="rise-in grid gap-5 lg:grid-cols-3">
              <div className="flex flex-col gap-5">
                <Panel title="Assigned stock" telemetryTag="// TARGET_MATRIX">
                  <p className={`font-mono text-3xl font-semibold tracking-tight ${mode === "crash" ? "text-down" : ""}`}>
                    {status.assigned_stock.code}
                  </p>
                  <p className="mt-1 text-sm text-muted">{status.assigned_stock.name}</p>
                </Panel>

                <Panel title="Dataset download" telemetryTag="// DATA_FEED">
                  <p className="mb-4 text-sm text-muted">Your team&apos;s training and prediction rows for this round.</p>
                  <DownloadButton label="Download dataset" disabled={!status.download_available} />
                  {!status.download_available && <p className="text-xs text-muted">The dataset is not available yet.</p>}
                </Panel>

                <Panel title="Round standing" telemetryTag="// METRICS">
                  <dl className="grid grid-cols-3 gap-2">
                    <div>
                      <dt className="text-xs text-muted">Total Submitted</dt>
                      <dd className="tabular mt-1 font-mono text-xl font-semibold">
                        {submittedTotal ?? "--"}{" "}
                        <span className="text-xs font-normal text-muted">/ 10</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Total Remaining</dt>
                      <dd className="tabular mt-1 font-mono text-xl font-semibold">{remainingTotal ?? "--"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Public score</dt>
                      <dd className="tabular mt-1 font-mono text-xl font-bold text-up">
                        {typeof status.latest_score === "number" ? `${status.latest_score.toFixed(1)}` : "--"}
                      </dd>
                    </div>
                  </dl>
                </Panel>
              </div>

              <Panel
                title="Upload submission"
                telemetryTag="// 50_ROW_EVAL_GATE"
                aside={<span className="font-mono text-[11px] text-faint">{status.current_round}</span>}
                className="lg:col-span-2"
              >
                <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
                  <FileUpload
                    key={status.current_round}
                    round={status.current_round}
                    disabledReason={uploadBlockReason(status, seconds, remainingTotal)}
                    onSubmitted={onSubmitted}
                    onFileChange={setDraft}
                  />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Required format</h3>
                    <FormatHint type={status.submission_type} round={status.current_round} />
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
                          {typeof item.score === "number" && (
                            <span className="tabular rounded bg-up/10 px-1.5 py-0.5 font-bold text-up">
                              {item.score.toFixed(1)} pts
                            </span>
                          )}
                          <span className="tabular ml-auto text-up">#{item.submissionNumber}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>

            {status.submission_type === "signal" && (
              <section className="rise-in rounded-lg border border-line bg-panel p-5 sm:p-6">
                <PositionPreview file={draft} />
              </section>
            )}
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
