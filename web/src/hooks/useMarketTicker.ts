import { useEffect, useRef, useState } from "react";

export type TickerMode = "unstable" | "crash" | "recovery" | "rally";

export const START_PRICE = 100;
const CAPACITY = 110;
const TICK_MS = 60;

function gaussian() {
  const u = Math.max(Math.random(), 1e-9);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function seedSeries(mode: TickerMode): number[] {
  const series: number[] = [];
  const crashed = mode === "recovery" || mode === "rally";
  let price = START_PRICE;
  for (let i = 0; i < CAPACITY; i++) {
    if (crashed && i > 30 && i < 52) price *= 1 - 0.028 + 0.012 * gaussian();
    else if (crashed && i >= 52) price *= 1 + (0.04 * (START_PRICE * 0.52 - price)) / price + 0.018 * gaussian();
    else price *= 1 + 0.0025 * gaussian();
    series.push(price);
  }
  if (!crashed) {
    const scale = START_PRICE / series[series.length - 1];
    return series.map((value) => value * scale);
  }
  return series;
}

function step(mode: TickerMode, tick: number, last: number): number {
  let drift: number;
  let sigma: number;
  if (mode === "unstable") {
    sigma = Math.min(0.009, 0.003 + tick * 0.00006);
    drift = (0.12 * (START_PRICE * 0.97 - last)) / last;
    if (Math.random() < 0.03) drift -= 0.012 * Math.random();
  } else if (mode === "crash") {
    if (tick < 30) {
      sigma = 0.016;
      drift = -0.021;
    } else {
      sigma = 0.022;
      drift = (0.05 * (START_PRICE * 0.52 - last)) / last;
    }
  } else if (mode === "recovery") {
    sigma = Math.max(0.004, 0.018 - tick * 0.00012);
    drift = (0.03 * (START_PRICE * 0.64 - last)) / last;
  } else if (tick < 36) {
    sigma = 0.008;
    drift = 0.011;
  } else {
    sigma = 0.006;
    drift = (0.05 * (START_PRICE * 0.92 - last)) / last + 0.0008;
  }
  return Math.max(START_PRICE * 0.36, last * (1 + drift + sigma * gaussian()));
}

export function useMarketTicker(mode: TickerMode) {
  const [points, setPoints] = useState<number[]>(() => seedSeries(mode));
  const modeRef = useRef(mode);
  const ticksInMode = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
    ticksInMode.current = 0;
  }, [mode]);

  useEffect(() => {
    const id = setInterval(() => {
      ticksInMode.current += 1;
      const tick = ticksInMode.current;
      setPoints((previous) => {
        const next = step(modeRef.current, tick, previous[previous.length - 1]);
        const series = previous.length >= CAPACITY ? previous.slice(1) : previous.slice();
        series.push(next);
        return series;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const price = points[points.length - 1];
  const changePct = ((price - START_PRICE) / START_PRICE) * 100;
  return { points, price, changePct };
}
