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
      <main 
        onClick={() => setEntered(true)}
        className="relative flex min-h-screen cursor-crosshair flex-col items-center justify-center overflow-hidden bg-black animate-[shake_0.15s_infinite]"
      >
        <Head>
          <title>QUANT HATERS</title>
        </Head>

        <style>{`
          @keyframes glitch-eye {
            0% { clip-path: inset(20% 0 80% 0); transform: translate(-2px, 2px); filter: hue-rotate(0deg) contrast(1.5); }
            5% { clip-path: inset(10% 0 40% 0); transform: translate(2px, -2px); filter: hue-rotate(45deg) contrast(2); }
            10% { clip-path: inset(80% 0 5% 0); transform: translate(-2px, 2px); filter: hue-rotate(-45deg) contrast(1.5); }
            15% { clip-path: inset(0% 0 100% 0); transform: translate(0); filter: hue-rotate(0deg) contrast(1); }
            100% { clip-path: inset(0% 0 100% 0); transform: translate(0); filter: hue-rotate(0deg) contrast(1); }
          }
          @keyframes breathe {
            0%, 100% { transform: scale(1); filter: brightness(0.8) contrast(1.2); }
            50% { transform: scale(1.05); filter: brightness(1.2) contrast(1.5); }
          }
          @keyframes shake {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            25% { transform: translate(3px, 3px) rotate(0.5deg); }
            50% { transform: translate(-3px, -3px) rotate(-0.5deg); }
            75% { transform: translate(-3px, 3px) rotate(0.5deg); }
          }
          @keyframes flash {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
            25%, 75% { opacity: 0; }
          }
          .strobe {
            animation: flash 0.05s infinite;
          }
        `}</style>

        {/* The Burning Dollar */}
        <div className="relative w-full max-w-2xl aspect-square animate-[breathe_3s_ease-in-out_infinite]">
          {/* Base Dollar */}
          <img 
            src="/burning_money.jpg" 
            alt="Burning Wealth" 
            className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-90 rounded-full [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"
          />
          
          {/* Glitching Overlay */}
          <img 
            src="/burning_money.jpg" 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-60 rounded-full [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] animate-[glitch-eye_2s_infinite_linear_alternate-reverse]"
          />
        </div>

        {/* Deep red glowing orb to enhance the heat/fire feeling */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[40rem] w-[40rem] bg-orange-700/20 blur-[80px] rounded-full pointer-events-none z-10 animate-pulse mix-blend-screen" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[20rem] w-[20rem] bg-red-600/30 blur-[40px] rounded-full pointer-events-none z-10 animate-[ping_3s_infinite] mix-blend-screen" />

        {/* Insane strobe overlay that is subtle but unsettling */}
        <div className="strobe absolute inset-0 bg-red-900/5 mix-blend-overlay pointer-events-none z-50" />
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
