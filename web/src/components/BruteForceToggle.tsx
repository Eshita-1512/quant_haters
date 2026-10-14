import { useBruteForceTheme } from "@/lib/bruteforce";

interface BruteForceToggleProps {
  className?: string;
  compact?: boolean;
}

export default function BruteForceToggle({
  className = "",
  compact = false,
}: BruteForceToggleProps) {
  const { enabled, toggle } = useBruteForceTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled ? "Disable Brute Force Theme" : "Enable Brute Force Theme"}
      aria-label="Toggle Brute Force Theme"
      className={`group relative inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
        enabled
          ? "border-accent/60 bg-accent-soft text-accent hover:border-accent hover:bg-accent/20"
          : "border-line text-muted hover:border-line-strong hover:text-text"
      } ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full transition-colors ${
          enabled ? "animate-pulse bg-accent" : "bg-faint group-hover:bg-muted"
        }`}
      />
      <span className="font-semibold">
        {compact ? "BF" : "BRUTE FORCE"}
      </span>
      <span className="text-[10px] opacity-75">
        [{enabled ? "ON" : "OFF"}]
      </span>
    </button>
  );
}
