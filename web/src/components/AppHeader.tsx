import Link from "next/link";
import { useRouter } from "next/router";
import { session } from "@/lib/session";

export type HeaderMode = "default" | "crash" | "alpha";

interface AppHeaderProps {
  team?: string;
  mode?: HeaderMode;
}

export default function AppHeader({ team, mode = "default" }: AppHeaderProps) {
  const crash = mode === "crash";
  const alpha = mode === "alpha";
  const router = useRouter();

  const signOut = () => {
    session.clear();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[120rem] items-center gap-4 px-6 md:px-10 xl:px-16">
        <Link
          href="/dashboard"
          className="flex min-h-11 items-center gap-[0.22em] font-display text-xl font-extrabold uppercase leading-none"
          aria-label="BigShort dashboard"
        >
          <span>Big</span>
          <span className={alpha ? "text-alpha" : "text-down"}>Short</span>
        </Link>
        <nav className="ml-2 flex items-center gap-1 border-l border-line pl-2">
          <Link
            href="/dashboard"
            className={`inline-flex min-h-11 items-center px-2 font-mono text-xs transition-colors ${
              router.pathname === "/dashboard" ? "text-text font-semibold" : "text-muted hover:text-text"
            }`}
          >
            Desk
          </Link>
          <Link
            href="/leaderboard"
            className={`inline-flex min-h-11 items-center px-2 font-mono text-xs transition-colors ${
              router.pathname === "/leaderboard" ? "text-text font-semibold" : "text-muted hover:text-text"
            }`}
          >
            Standings
          </Link>
        </nav>
        {alpha && (
          <span className="flex items-center gap-1.5 rounded-full border border-alpha/40 bg-alpha-soft px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-alpha">
            <span className="h-1.5 w-1.5 rounded-full bg-alpha-2" />
            Alpha desk
          </span>
        )}
        {crash && (
          <span className="flex items-center gap-1.5 rounded-full border border-down/50 bg-down-soft px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-down">
            <span className="siren h-1.5 w-1.5 rounded-full bg-down" />
            Crash mode
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {team && (
            <span className="hidden font-mono text-xs text-muted sm:inline">
              TEAM <span className="text-text">{team}</span>
            </span>
          )}
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-down hover:text-down"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
