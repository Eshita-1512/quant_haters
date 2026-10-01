import { useEffect, useState } from "react";

export function useCountdown(endsAt: string | undefined, clockOffsetMs: number, frozenSeconds: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (frozenSeconds !== null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [frozenSeconds]);

  if (frozenSeconds !== null) return Math.max(0, frozenSeconds);
  const target = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.floor((target - (now + clockOffsetMs)) / 1000));
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
