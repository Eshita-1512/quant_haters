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

const QuantCrashAnimation = () => {
  useEffect(() => {
    const canvas = document.getElementById("quant-canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    let currentX = 0;
    const candleWidth = 14;
    const spacing = 6;
    let lastClose = canvas.height / 2;
    
    const draw = () => {
      // Fade out previous frames slowly for a motion blur/chaos effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Fast algorithm mode: Generate 3-5 candles per frame for extreme speed
      for (let i = 0; i < 3; i++) {
        // 5% chance of a massive flash crash red candle
        const isCrash = Math.random() > 0.95; 
        // 2% chance of a massive short squeeze green candle
        const isSqueeze = Math.random() > 0.98;
        
        const volatility = isCrash ? 300 : (isSqueeze ? -250 : (Math.random() * 40));
        
        let open = lastClose;
        let close = open + (Math.random() - 0.5) * 10 + (isCrash ? Math.random() * volatility : 0) + (isSqueeze ? Math.random() * volatility : 0);
        
        // Keep price mostly on screen, but allow it to wildly swing
        if (close > canvas.height * 0.9) {
          close = canvas.height * 0.9 - Math.random() * 100;
        }
        if (close < canvas.height * 0.1) {
          close = canvas.height * 0.1 + Math.random() * 100;
        }
        
        let high = Math.min(open, close) - Math.random() * 50;
        let low = Math.max(open, close) + Math.random() * 50;
        
        // y-axis goes down, so close > open = price dropped = red
        const isRed = close > open; 
        
        // Random glitch displacements
        const glitchX = Math.random() > 0.95 ? (Math.random() - 0.5) * 100 : 0;
        const glitchY = Math.random() > 0.95 ? (Math.random() - 0.5) * 100 : 0;
        
        const drawX = currentX + glitchX;
        
        // Draw wick
        ctx.strokeStyle = isRed ? "#dc2626" : "#22c55e"; // Red or Green
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(drawX + candleWidth/2, high + glitchY);
        ctx.lineTo(drawX + candleWidth/2, low + glitchY);
        ctx.stroke();
        
        // Draw body
        ctx.fillStyle = isRed ? "#dc2626" : "#22c55e";
        const bodyHeight = Math.abs(close - open) || 1;
        ctx.fillRect(drawX, Math.min(open, close) + glitchY, candleWidth, bodyHeight);
        
        // Add scary horizontal red/green laser bands
        if (Math.random() > 0.92) {
          ctx.fillStyle = isRed ? "rgba(220, 38, 38, 0.05)" : "rgba(34, 197, 94, 0.02)";
          ctx.fillRect(0, Math.min(open, close) + glitchY, canvas.width, bodyHeight);
        }
        
        lastClose = close;
        currentX += candleWidth + spacing;
        
        if (currentX > canvas.width) {
          currentX = 0;
          // Occasionally wipe the screen black when wrapping around
          if (Math.random() > 0.3) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Reset price to middle
            lastClose = canvas.height / 2;
          }
        }
      }
    };
    
    const interval = setInterval(draw, 30); // 33fps
    
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  return <canvas id="quant-canvas" className="absolute inset-0 z-0 opacity-90" />;
};

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
        className="relative flex min-h-screen cursor-crosshair flex-col items-center justify-center overflow-hidden bg-black"
      >
        <Head>
          <title>QUANT HATERS</title>
        </Head>

        {/* Terrifying high-speed candlestick chart animation */}
        <QuantCrashAnimation />

        <style>{`
          @keyframes flash {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
            25%, 75% { opacity: 0; }
          }
          .strobe {
            animation: flash 0.1s infinite;
          }
        `}</style>

        {/* Deep red glowing orb to enhance the center focus */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[40rem] w-[40rem] bg-red-900/10 blur-[80px] rounded-full pointer-events-none z-10 animate-pulse mix-blend-screen" />

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
