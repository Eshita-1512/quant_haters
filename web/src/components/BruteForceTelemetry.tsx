import { useEffect, useState } from "react";
import { useBruteForceTheme } from "@/lib/bruteforce";

interface TelemetryProps {
  className?: string;
  stockCode?: string;
  roundCode?: string;
}

export default function BruteForceTelemetry({
  className = "",
  stockCode = "STOCK_A",
  roundCode = "R1",
}: TelemetryProps) {
  const { enabled } = useBruteForceTheme();
  const [cycleHash, setCycleHash] = useState("0x7F2A9C");
  const [permRate, setPermRate] = useState("14.8M");
  const [entropy, setEntropy] = useState("0.984");

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      // Generate cycling cryptographic hex slice
      const hex = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .toUpperCase()
        .padStart(6, "0");
      setCycleHash(`0x${hex}`);

      // Slight natural fluctuations in permutation speed
      const baseRate = (14.2 + Math.random() * 1.4).toFixed(1);
      setPermRate(`${baseRate}M`);

      // Entropy readout
      setEntropy((0.98 + Math.random() * 0.015).toFixed(3));
    }, 1800);

    return () => clearInterval(interval);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className={`bf-hud-panel relative overflow-hidden rounded border border-line bg-panel/90 px-3.5 py-2 font-mono text-[11px] text-muted shadow-sm backdrop-blur ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-semibold tracking-wider text-text">
            BRUTE_FORCE <span className="text-accent">//</span> ENGINE
          </span>
          <span className="hidden text-faint sm:inline">[0xBF_ONLINE]</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="text-faint">TARGET:</span>
            <span className="font-medium text-text">{stockCode}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-faint">ROUND:</span>
            <span className="font-medium text-accent">{roundCode}</span>
          </span>
          <span className="hidden items-center gap-1 md:flex">
            <span className="text-faint">SPACE:</span>
            <span className="text-text">50-ROW MATRIX</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-faint">PERM/S:</span>
            <span className="tabular text-up">{permRate}</span>
          </span>
          <span className="hidden items-center gap-1 lg:flex">
            <span className="text-faint">ENTROPY:</span>
            <span className="tabular text-text">{entropy}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-faint">HASH:</span>
            <span className="tabular text-accent">{cycleHash}</span>
          </span>
        </div>

        <div className="hidden xl:flex items-center gap-1.5 text-faint">
          <span className="inline-block h-1.5 w-1.5 bg-accent/60" />
          <span>EXHAUSTIVE_EVAL_ACTIVE</span>
        </div>
      </div>

      {/* Subtle sweeping scanner line */}
      <div className="bf-scanline-bar pointer-events-none absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
    </div>
  );
}
