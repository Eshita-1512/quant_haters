export type TapeTone = "warn" | "down" | "cool" | "alpha";

interface TickerTapeProps {
  tone: TapeTone;
}

const QUOTES: { code: string; values: Record<TapeTone, number> }[] = [
  { code: "STOCK_A", values: { warn: -3.1, down: -47.2, cool: 6.4, alpha: 12.8 } },
  { code: "STOCK_B", values: { warn: -4.4, down: -58.9, cool: 3.1, alpha: 9.4 } },
  { code: "STOCK_C", values: { warn: -1.9, down: -31.6, cool: 8.2, alpha: 15.1 } },
  { code: "STOCK_D", values: { warn: -5.2, down: -63.4, cool: -1.7, alpha: 7.9 } },
  { code: "STOCK_E", values: { warn: -0.8, down: -18.7, cool: 4.5, alpha: 11.2 } },
  { code: "VOL_IDX", values: { warn: 41.3, down: 312.5, cool: -38.2, alpha: -61.4 } },
];

export default function TickerTape({ tone }: TickerTapeProps) {
  const items = [...QUOTES, ...QUOTES];
  return (
    <div className="relative overflow-hidden border-y border-current/20 py-2 font-mono text-xs">
      <div className="marquee flex w-max gap-10 whitespace-nowrap">
        {items.map((quote, index) => {
          const value = quote.values[tone];
          const up = value > 0;
          const upClass = tone === "alpha" ? "text-alpha-2" : tone === "cool" ? "text-up" : "text-warn";
          return (
            <span key={`${quote.code}-${index}`} className="flex items-center gap-2">
              <span className="text-text/80">{quote.code}</span>
              <span className={up ? upClass : "text-down"}>
                {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
