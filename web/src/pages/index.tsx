import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { session, useSession } from "@/lib/session";

const schedule = [
  { code: "R1", name: "Foundation", detail: "Predict UP or DOWN on calm data" },
  { code: "!!", name: "Flash Crash", detail: "New regime data drops mid event" },
  { code: "R2", name: "Signal Hunt", detail: "Adapt your model to the crash" },
  { code: "R3", name: "Alpha", detail: "Size positions from -1 to +1" },
];

export default function LoginPage() {
  const router = useRouter();
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Controls whether the splash screen or login form is visible
  const [entered, setEntered] = useState(false);

  const { token } = useSession();

  useEffect(() => {
    if (token) router.replace("/dashboard");
  }, [token, router]);

  const expired = router.query.expired === "1";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const team = teamId.trim();
    if (!team || !password) {
      setError("ENTER CREDENTIALS.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token: issued } = await api.login({ team_id: team, password });
      session.save(issued, team.toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "ACCESS DENIED.");
      setSubmitting(false);
    }
  };

  if (!entered && !expired) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] text-white selection:bg-red-900/50">
        <Head>
          <title>QUANT HATERS</title>
        </Head>
        
        {/* Intimidating Background Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />
        
        {/* Deep red glowing orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[40rem] w-[40rem] bg-red-700/10 blur-[150px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center animate-in fade-in duration-1000 slide-in-from-bottom-8">
          <p className="font-mono text-sm tracking-[0.5em] text-red-600 mb-6 uppercase animate-pulse">
            System Online
          </p>
          
          <h1 className="text-6xl sm:text-[8rem] font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-neutral-200 to-neutral-700 mb-6 drop-shadow-2xl leading-none">
            QUANT
            <br />
            HATERS
          </h1>
          
          <p className="max-w-3xl text-base sm:text-xl text-neutral-400 font-mono mb-16 px-6 leading-relaxed">
            <span className="block mb-2 text-white">THE MARKET DOES NOT CARE ABOUT YOUR FEELINGS.</span>
            <span className="block text-red-500/80">Five hours. One synthetic market.</span>
            <span className="block">Build the model. Survive the crash. Destroy the leaderboard.</span>
          </p>
          
          <button 
            onClick={() => setEntered(true)}
            className="group relative inline-flex items-center justify-center font-mono text-sm font-bold uppercase tracking-[0.2em] px-10 py-5 transition-all duration-300 hover:scale-105"
          >
            <div className="absolute inset-0 border border-red-500/40 bg-red-950/30 group-hover:border-red-500 group-hover:bg-red-900/40 transition-all duration-300" />
            <div className="absolute -inset-2 bg-red-600/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <span className="relative text-red-500 group-hover:text-red-400 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              ENTER THE ARENA
            </span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Auth | Quant Haters</title>
      </Head>
      <main className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] bg-bg animate-in fade-in duration-700">
        
        {/* Left Side Info */}
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-sm border border-red-500/30 bg-red-500/10 font-mono text-sm font-bold text-red-500">
              !
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Secure Login</span>
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl text-white">
            AUTHENTICATE
          </h1>
          <p className="mt-4 max-w-md text-muted font-mono text-sm">
            Only registered teams may access the market terminal. Establish connection to proceed.
          </p>
          <ol className="mt-10 grid max-w-md gap-px overflow-hidden rounded-xl border border-line bg-line">
            {schedule.map((step) => (
              <li key={step.code} className="flex items-center gap-4 bg-panel px-4 py-3">
                <span className={`w-7 font-mono text-xs font-bold ${step.code === "!!" ? "text-down" : "text-up"}`}>
                  {step.code}
                </span>
                <span className="text-sm font-semibold">{step.name}</span>
                <span className="ml-auto text-right text-xs text-muted font-mono">{step.detail}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Right Side Form */}
        <div className="relative z-10 rounded-2xl border border-red-500/20 bg-panel/50 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <h2 className="text-lg font-mono font-bold tracking-widest uppercase text-white">Connection Established</h2>
          <p className="mt-1 font-mono text-xs text-muted">Awaiting credentials...</p>

          {expired && !error && (
            <p className="mt-5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn font-mono">
              SESSION EXPIRED. RE-AUTHENTICATE.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Team Identifier</span>
              <input
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                className="h-12 rounded-lg border border-line-strong bg-bg px-4 font-mono text-sm text-white outline-none transition-colors placeholder:text-faint focus:border-red-500 focus:ring-1 focus:ring-red-500/50"
                placeholder="E.g., A01"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Access Key</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-12 rounded-lg border border-line-strong bg-bg px-4 font-mono text-sm text-white outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500/50"
              />
            </label>

            <div aria-live="polite" className="min-h-[24px]">
              {error && <p className="font-mono text-xs text-red-500 animate-pulse">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="group relative inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-950/40 text-sm font-mono font-bold tracking-widest text-red-500 transition-all hover:bg-red-900/60 hover:text-white disabled:cursor-wait disabled:border-line-strong disabled:bg-line disabled:text-muted"
            >
              {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {submitting ? "VERIFYING..." : "INITIALIZE"}
            </button>
          </form>

          {config.useMocks && (
            <p className="mt-6 border-t border-line/50 pt-4 font-mono text-xs text-faint">
              Mock mode active. Any team ID, password "demo".
            </p>
          )}
        </div>
      </main>
    </>
  );
}
