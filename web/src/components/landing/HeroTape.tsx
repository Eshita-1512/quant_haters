import { useEffect, useRef } from "react";

const POINTS = 240;
const STEP_MS = 50;
const AUTO_CRASH_MS = 20000;
const CRASH_MS = 600;
const CRASH_DROP = 0.3;
const BASE = 0.42;
const LINE_COLOR = "rgba(184, 184, 184, 0.35)";
const CRASH_COLOR = "rgba(237, 2, 48, 0.9)";

function clamp(value: number) {
  return Math.min(0.92, Math.max(0.08, value));
}

function seedSeries(withCrash: boolean) {
  const ys: number[] = [];
  const crash: boolean[] = [];
  let y = BASE;
  for (let i = 0; i < POINTS; i += 1) {
    const inCrash = withCrash && i >= 150 && i < 162;
    if (inCrash) {
      y += CRASH_DROP / 12;
    } else {
      y += (BASE - y) * 0.02 + (Math.random() - 0.5) * 0.03;
    }
    y = clamp(y);
    ys.push(y);
    crash.push(inCrash);
  }
  return { ys, crash };
}

export default function HeroTape() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = canvas ? canvas.parentElement : null;
    if (!canvas || !section) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { ys, crash } = seedSeries(reduced);
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    let visible = true;
    let lastStep = performance.now();
    let crashStart = -1;
    let nextAutoCrash = performance.now() + AUTO_CRASH_MS;
    let pointerY: number | null = null;

    const draw = (progress: number) => {
      ctx.clearRect(0, 0, width, height);
      const dx = width / (POINTS - 2);
      const shift = progress * dx;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "miter";
      let current = crash[1];
      ctx.beginPath();
      ctx.strokeStyle = current ? CRASH_COLOR : LINE_COLOR;
      ctx.moveTo(-shift, ys[0] * height);
      for (let i = 1; i < POINTS; i += 1) {
        if (crash[i] !== current) {
          ctx.stroke();
          current = crash[i];
          ctx.beginPath();
          ctx.strokeStyle = current ? CRASH_COLOR : LINE_COLOR;
          ctx.moveTo((i - 1) * dx - shift, ys[i - 1] * height);
        }
        ctx.lineTo(i * dx - shift, ys[i] * height);
      }
      ctx.stroke();
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = section.clientWidth;
      height = section.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(0);
    };

    const startCrash = (now: number) => {
      crashStart = now;
      nextAutoCrash = now + AUTO_CRASH_MS;
    };

    const step = (now: number) => {
      const last = ys[ys.length - 1];
      let next = last + (BASE - last) * 0.02 + (Math.random() - 0.5) * 0.03;
      if (pointerY !== null) next += pointerY < last ? 0.004 : -0.004;
      let inCrash = false;
      if (crashStart >= 0) {
        if (now - crashStart < CRASH_MS) {
          next = last + CRASH_DROP / (CRASH_MS / STEP_MS);
          inCrash = true;
        } else {
          crashStart = -1;
        }
      }
      ys.shift();
      crash.shift();
      ys.push(clamp(next));
      crash.push(inCrash);
    };

    const tick = (now: number) => {
      if (!running) return;
      if (crashStart < 0 && now >= nextAutoCrash) startCrash(now);
      let steps = 0;
      while (now - lastStep >= STEP_MS && steps < 5) {
        lastStep += STEP_MS;
        step(lastStep);
        steps += 1;
      }
      if (now - lastStep > STEP_MS * 5) lastStep = now;
      draw((now - lastStep) / STEP_MS);
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      lastStep = performance.now();
      nextAutoCrash = Math.max(nextAutoCrash, lastStep + 4000);
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const update = () => {
      if (visible && !document.hidden) start();
      else stop();
    };

    const onMove = (event: PointerEvent) => {
      const rect = section.getBoundingClientRect();
      pointerY = (event.clientY - rect.top) / rect.height;
    };

    const onLeave = () => {
      pointerY = null;
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest("a, button")) return;
      if (reduced || crashStart >= 0) return;
      startCrash(performance.now());
    };

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      update();
    });
    const ro = new ResizeObserver(resize);

    io.observe(section);
    ro.observe(section);
    document.addEventListener("visibilitychange", update);
    section.addEventListener("pointermove", onMove);
    section.addEventListener("pointerleave", onLeave);
    section.addEventListener("click", onClick);
    resize();
    update();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", update);
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      section.removeEventListener("click", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
