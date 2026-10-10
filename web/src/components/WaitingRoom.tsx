import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { session } from "@/lib/session";
import type { EventStatus } from "@/lib/types";

interface WaitingRoomProps {
  status: EventStatus;
  team: string | null;
  isStarting?: boolean;
}

export default function WaitingRoom({ status, team, isStarting = false }: WaitingRoomProps) {
  const [teamNameInput, setTeamNameInput] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [teamCode, setTeamCode] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timeStr, setTimeStr] = useState("");

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch current team profile on mount
  useEffect(() => {
    let mounted = true;
    api
      .getMe()
      .then((profile) => {
        if (!mounted) return;
        setTeamCode(profile.team_id);
        const currentName = profile.team_name || team || "";
        setTeamNameInput(currentName);
        setSavedName(currentName);
      })
      .catch(() => {
        if (!mounted) return;
        setTeamNameInput(team || "");
        setSavedName(team || "");
      });
    return () => {
      mounted = false;
    };
  }, [team]);

  const handleSaveTeamName = async (e: FormEvent) => {
    e.preventDefault();
    const clean = teamNameInput.trim();
    if (!clean) {
      setSaveError("Team name cannot be empty.");
      return;
    }
    if (clean.length > 50) {
      setSaveError("Team name cannot exceed 50 characters.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateTeamName(clean);
      setSavedName(updated.team_name);
      session.setTeam(updated.team_name);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update team name.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[#08080a] text-text transition-all duration-[3000ms] ease-in-out ${
        isStarting ? "scale-125 opacity-0 blur-lg filter" : "scale-100 opacity-100"
      }`}
    >
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(217,119,6,0.15),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Top Telemetry Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between border-b border-line/60 bg-panel/40 px-6 py-4 backdrop-blur-md sm:px-10">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-up" />
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            Trading Terminal Awaiting Open
          </span>
        </div>

        <div className="flex items-center gap-6 font-mono text-xs text-muted">
          <div className="hidden sm:block">
            <span>PING: </span>
            <span className="text-up font-bold">14ms (Optimal)</span>
          </div>
          <div>
            <span>SYSTEM TIME: </span>
            <span className="text-text tabular font-bold">{timeStr || "--:--:--"}</span>
          </div>
        </div>
      </header>

      {/* Center Main Stage */}
      <main className="relative z-10 mx-auto my-auto flex w-full max-w-4xl flex-col items-center px-6 py-10 text-center sm:py-16">
        {/* Market Status Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Round 1 Scheduled — Market Opens Shortly
        </div>

        <h1 className="mt-6 font-display text-4xl font-extrabold uppercase tracking-tight text-text sm:text-6xl md:text-7xl">
          Stand By For Market Open
        </h1>

        <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
          The synthetic market engine is calibrating asset flows. Once organizers initiate Round 1, this
          terminal will automatically unlock.
        </p>

        {/* Team Identity Registration Card */}
        <div className="mt-10 w-full max-w-xl rounded-xl border border-line-strong bg-panel/80 p-6 text-left shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Assigned Stock</span>
              <p className="font-mono text-xl font-black text-accent">{status.assigned_stock.code}</p>
            </div>
            <div className="text-right">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Team Code</span>
              <p className="font-mono text-xl font-bold text-text">{teamCode || team || "—"}</p>
            </div>
          </div>

          <form onSubmit={handleSaveTeamName} className="mt-6 flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <label htmlFor="team-name-input" className="font-mono text-xs uppercase tracking-wider text-muted">
                Leaderboard Team Name
              </label>
              <span className="font-mono text-[11px] text-faint">
                {teamNameInput.length} / 50
              </span>
            </div>

            <p className="text-xs text-muted">
              Choose the team name that will be displayed on the official leaderboard and broadcasted to competitors.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="team-name-input"
                type="text"
                value={teamNameInput}
                onChange={(e) => setTeamNameInput(e.target.value)}
                maxLength={50}
                placeholder="Enter custom team name..."
                className="h-11 flex-1 rounded-lg border border-line-strong bg-bg px-4 font-mono text-sm text-text outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={saving || !teamNameInput.trim() || teamNameInput.trim() === savedName}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-text px-5 text-xs font-bold uppercase tracking-wider text-bg transition-all hover:bg-text/90 disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-muted"
              >
                {saving && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {saving ? "Saving..." : "Save Name"}
              </button>
            </div>

            {saveSuccess && (
              <p className="font-mono text-xs font-medium text-up">
                ✓ Team name updated to &quot;{savedName}&quot;. This name will appear on the leaderboard!
              </p>
            )}

            {saveError && (
              <p className="font-mono text-xs text-down">
                ✗ {saveError}
              </p>
            )}
          </form>
        </div>

        {/* Tactical Pre-Flight Telemetry Grid */}
        <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-panel/40 p-4 text-left">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Dataset</span>
            <p className="mt-1 font-mono text-sm font-semibold text-text">50-Row CSV</p>
            <p className="mt-1 text-[11px] text-muted">Clean baseline prices</p>
          </div>

          <div className="rounded-lg border border-line bg-panel/40 p-4 text-left">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Submissions</span>
            <p className="mt-1 font-mono text-sm font-semibold text-text">10 Max</p>
            <p className="mt-1 text-[11px] text-muted">60s cooldown per upload</p>
          </div>

          <div className="rounded-lg border border-line bg-panel/40 p-4 text-left">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Scoring Split</span>
            <p className="mt-1 font-mono text-sm font-semibold text-text">50% Public</p>
            <p className="mt-1 text-[11px] text-muted">Immediate feedback</p>
          </div>
        </div>
      </main>

      {/* Bottom Live Market Ticker */}
      <footer className="relative z-10 border-t border-line/60 bg-panel/30 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[120rem] items-center justify-between px-6 font-mono text-xs text-muted sm:px-10">
          <div className="flex items-center gap-4">
            <span className="inline-block h-2 w-2 rounded-full bg-accent animate-ping" />
            <span className="text-text font-bold">{status.assigned_stock.code}</span>
            <span className="text-muted hidden sm:inline">{status.assigned_stock.name}</span>
            <span className="text-up font-medium tabular">PRE-OPEN BID: $248.50 ▲ +0.42%</span>
          </div>
          <span className="text-faint text-[11px]">Keep this tab open. Auto-refreshes when round opens.</span>
        </div>
      </footer>
    </div>
  );
}
