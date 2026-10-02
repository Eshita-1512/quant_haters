import type { RoundPhase } from "@/lib/types";

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const phaseLabels: Record<RoundPhase, string> = {
  scheduled: "Starting soon",
  live: "Live",
  flash_crash: "Flash crash",
  paused: "Paused",
  completed: "Closed",
};

export function isUploadPhase(phase: RoundPhase | undefined): boolean {
  return phase === "live" || phase === "flash_crash";
}
