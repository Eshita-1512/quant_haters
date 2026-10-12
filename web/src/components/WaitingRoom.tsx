import type { EventStatus } from "@/lib/types";

interface WaitingRoomProps {
  status: EventStatus;
  team: string;
}

export default function WaitingRoom({ status, team }: WaitingRoomProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="rise-in mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center text-center"
    >
      <span className="relative flex h-3 w-3" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full bg-up opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-3 w-3 round bg-up" />
      </span>
      <p className="mt-6 font-mono text-xs uppercase tracking-[0.12em] text-muted">You&apos;re in</p>
      <h1 className="mt-3 text-3xl font-display font-black uppercase tracking-tight sm:text-5xl">Please wait for Round 1 to start</h1>
      <p className="mt-4 text-muted">
        Your organizers will start the round. This page updates on its own, so keep it open.
      </p>
      <dl className="mt-8 grid w-full grid-cols-2 gap-px overflow-hidden border border-line bg-line text-left">
        <div className="bg-panel px-4 py-3">
          <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Team</dt>
          <dd className="mt-1 font-mono font-medium">{team}</dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Your stock</dt>
          <dd className="mt-1 font-mono font-medium">{status.assigned_stock.code}</dd>
        </div>
      </dl>
    </section>
  );
}
