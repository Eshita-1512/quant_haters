import { useEffect, useState } from "react";
import { COST_PER_CHANGE, parsePositions, type PositionBook } from "@/lib/positions";

interface PositionPreviewProps {
  file: File | null;
}

type Parsed = PositionBook | { error: string };

const GHOST = Array.from({ length: 50 }, (_, i) => Math.sin(i / 4) * 0.7 + Math.sin(i / 1.7) * 0.2);

function Bars({ positions, ghost }: { positions: number[]; ghost?: boolean }) {
  const width = 1000;
  const height = 260;
  const mid = height / 2;
  const slot = width / positions.length;
  const bar = Math.max(2, slot * 0.66);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      {[-1, -0.5, 0.5, 1].map((level) => (
        <line
          key={level}
          x1="0"
          x2={width}
          y1={mid - level * (mid - 8)}
          y2={mid - level * (mid - 8)}
          stroke="currentColor"
          strokeOpacity="0.08"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line x1="0" x2={width} y1={mid} y2={mid} stroke="currentColor" strokeOpacity="0.3" vectorEffect="non-scaling-stroke" />
      {positions.map((value, index) => {
        const h = Math.abs(value) * (mid - 8);
        const long = value > 0;
        const fill = ghost ? "var(--line-strong)" : Math.abs(value) <= 0.05 ? "var(--faint)" : long ? "var(--alpha-2)" : "var(--down)";
        return (
          <rect
            key={index}
            x={index * slot + (slot - bar) / 2}
            y={long ? mid - h : mid}
            width={bar}
            height={Math.max(1.5, h)}
            rx="1.5"
            fill={fill}
            className={ghost ? "" : "bar-grow"}
            style={{ transformOrigin: `0 ${mid}px`, transformBox: "view-box", animationDelay: `${index * 12}ms` }}
          />
        );
      })}
    </svg>
  );
}

function Stat({ label, value, tone = "text-text" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/50 px-3 py-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className={`tabular mt-1 font-mono text-lg font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

const SAMPLE_CSV = [
  "timestamp,signal",
  ...Array.from({ length: 50 }, (_, i) => {
    const val = (Math.sin(i / 3.5) * 0.75 + Math.cos(i / 2) * 0.25).toFixed(2);
    return `${i + 1},${val}`;
  }),
].join("\n");

export default function PositionPreview({ file }: PositionPreviewProps) {
  const [result, setResult] = useState<{ file: File; parsed: Parsed } | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    if (!file) return;
    setShowDemo(false);
    let cancelled = false;
    file
      .text()
      .then((text) => {
        if (!cancelled) setResult({ file, parsed: parsePositions(text) });
      })
      .catch(() => {
        if (!cancelled) setResult({ file, parsed: { error: "Could not read this file." } });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const parsed = file && result?.file === file ? result.parsed : showDemo ? parsePositions(SAMPLE_CSV) : null;
  const book = parsed && "positions" in parsed ? parsed : null;
  const error = parsed && "error" in parsed ? parsed.error : null;
  const isDemo = !file && showDemo;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Book preview</p>
            {isDemo && (
              <span className="rounded bg-alpha-soft px-1.5 py-0.5 font-mono text-[10px] text-alpha">Demo sample</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {book ? (
              <>
                <span className="font-mono text-text">{isDemo ? "sample_signals.csv" : file?.name}</span> /{" "}
                {book.positions.length} periods
              </>
            ) : (
              "Choose a signals file in Upload dataset to preview your positions."
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!file && (
            <button
              type="button"
              onClick={() => setShowDemo(!showDemo)}
              className="font-mono text-xs text-alpha hover:underline"
            >
              {showDemo ? "Reset to empty" : "Try sample demo"}
            </button>
          )}
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-alpha-2" /> Long
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-down" /> Short
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-faint" /> Flat
            </span>
          </div>
        </div>
      </div>

      <div className="relative h-56 rounded-md border border-line bg-bg/60 p-3 text-alpha sm:h-64">
        <span className="absolute left-3 top-2 font-mono text-[10px] text-faint">+1 long</span>
        <span className="absolute bottom-2 left-3 font-mono text-[10px] text-faint">-1 short</span>
        {book ? <Bars key={isDemo ? "demo" : file?.name} positions={book.positions} /> : <Bars positions={GHOST} ghost />}
        {!book && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-center">
            <p className="rounded-full border border-line-strong bg-panel/90 px-4 py-1.5 text-xs font-mono text-muted">
              {error ?? "Awaiting Signal CSV"}
            </p>
            <p className="text-xs text-faint">
              Choose a signals file in Upload dataset to preview live metrics
            </p>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Net exposure"
          value={book ? `${book.net >= 0 ? "+" : ""}${book.net.toFixed(2)}` : "--"}
          tone={book ? (book.net >= 0 ? "text-alpha-2" : "text-down") : "text-text"}
        />
        <Stat label="Gross exposure" value={book ? book.gross.toFixed(2) : "--"} />
        <Stat label="L / S / Flat" value={book ? `${book.longs}/${book.shorts}/${book.flats}` : "--"} />
        <Stat
          label="Est. cost"
          value={book ? `-${book.estimatedCost.toFixed(3)}` : "--"}
          tone={book && book.changes > 20 ? "text-warn" : "text-text"}
        />
      </dl>
      {book ? (
        <p className="text-xs text-muted">
          {book.changes} position changes above 0.05, each costing {COST_PER_CHANGE} in the Round 3 score.
          {book.problems.length > 0 && <span className="text-warn"> {book.problems.join(" ")}</span>}
        </p>
      ) : (
        <p className="text-xs text-faint">
          Metrics calculate automatically when you choose a signal CSV in the upload area.
        </p>
      )}
    </div>
  );
}
