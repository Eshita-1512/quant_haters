export type ChartTone = "warn" | "down" | "cool" | "alpha";

const TONE_COLOR: Record<ChartTone, string> = {
  warn: "var(--warn)",
  down: "var(--down)",
  cool: "#ff8f9b",
  alpha: "var(--alpha)",
};

interface MarketChartProps {
  points: number[];
  tone: ChartTone;
  className?: string;
}

const Y_MIN = 30;
const Y_MAX = 112;
const WIDTH = 1000;
const HEIGHT = 320;

export default function MarketChart({ points, tone, className = "" }: MarketChartProps) {
  const step = WIDTH / Math.max(1, points.length - 1);
  const coords = points.map((value, index) => {
    const clamped = Math.min(Y_MAX, Math.max(Y_MIN, value));
    const y = HEIGHT - ((clamped - Y_MIN) / (Y_MAX - Y_MIN)) * HEIGHT;
    return [index * step, y] as const;
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  const color = TONE_COLOR[tone];
  const last = coords[coords.length - 1];
  const gradientId = `market-fill-${tone}`;
  const baseline = HEIGHT - ((100 - Y_MIN) / (Y_MAX - Y_MIN)) * HEIGHT;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          x1="0"
          x2={WIDTH}
          y1={HEIGHT * fraction}
          y2={HEIGHT * fraction}
          stroke="currentColor"
          strokeOpacity="0.08"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1="0"
        x2={WIDTH}
        y1={baseline}
        y2={baseline}
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeDasharray="6 6"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="6" fill={color} />}
    </svg>
  );
}
