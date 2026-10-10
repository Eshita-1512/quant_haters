interface Stop {
  tag: string;
  title: string;
  duration?: string;
  body: string;
  tone: "kickoff" | "calm" | "crash" | "recover" | "alpha";
}

const STOPS: Stop[] = [
  {
    tag: "Kickoff",
    title: "Get your market",
    body: "Log in. Your team gets its own stock and its own slice of time to predict. No two teams have the same data, so copying another team's code gets you nowhere.",
    tone: "kickoff",
  },
  {
    tag: "R1",
    title: "Foundation",
    duration: "about 1 h 15 min",
    body: "Calm market. Clean the data, engineer features, train a model that says UP (1) or DOWN (0) for each of your 50 prediction rows.",
    tone: "calm",
  },
  {
    tag: "Flash crash",
    title: "The shock",
    body: "Mid-event, the market you were studying collapses. Volatility spikes, prices fall, and your Round 1 model is probably broken. New crash data unlocks.",
    tone: "crash",
  },
  {
    tag: "R2",
    title: "Signal Hunt",
    duration: "about 1 h 45 min",
    body: "Same task, new regime. Retrain, add volatility filters, shorten your lookback. This round tests whether your model adapts.",
    tone: "recover",
  },
  {
    tag: "R3",
    title: "Alpha",
    duration: "about 1 h",
    body: "Stop predicting direction and start trading. For each row, choose a position from -1 (full short) to +1 (full long). Your book is backtested with trading costs.",
    tone: "alpha",
  },
];

const TONES: Record<Stop["tone"], { tag: string; dot: string }> = {
  kickoff: { tag: "text-muted", dot: "bg-muted" },
  calm: { tag: "text-up", dot: "bg-up" },
  crash: { tag: "text-down", dot: "bg-down" },
  recover: { tag: "text-[#ff8f9b]", dot: "bg-[#ff8f9b]" },
  alpha: { tag: "text-alpha", dot: "bg-alpha" },
};

export default function Timeline() {
  return (
    <ol className="relative grid gap-6 lg:grid-cols-5 lg:gap-4">
      <span aria-hidden="true" className="absolute bottom-2 left-[5px] top-2 w-px bg-line-strong lg:hidden" />
      <span aria-hidden="true" className="absolute left-0 right-0 top-[5px] hidden h-px bg-line-strong lg:block" />
      {STOPS.map((stop) => {
        const tone = TONES[stop.tone];
        return (
          <li key={stop.tag} className="relative pl-7 lg:pl-0 lg:pt-7">
            <span aria-hidden="true" className={`absolute left-0 top-1 h-[11px] w-[11px] rounded-full ${tone.dot} lg:top-0`} />
            <p className={`font-mono text-[11px] uppercase tracking-[0.14em] ${tone.tag}`}>
              {stop.tag}
              {stop.duration && <span className="text-faint"> · {stop.duration}</span>}
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">{stop.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{stop.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
