import type { CSSProperties } from "react";
import { useInView } from "@/hooks/useInView";

const TERMS = [
  {
    term: "Long and short",
    body: "Long means buying because you expect the price to rise. Short means selling borrowed shares and buying them back later, profiting if the price falls.",
    href: "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/short-selling/",
  },
  {
    term: "Alpha",
    body: "The excess return that comes from skill, after accounting for general market movement.",
    href: "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/alpha/",
  },
  {
    term: "Backtesting",
    body: "Testing a strategy on historical data to see how it would have performed. The event scorer works as an automated backtest.",
    href: "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/backtesting/",
  },
  {
    term: "Overfitting",
    body: "A model that memorises its training data instead of learning rules that generalise. Near-perfect accuracy in your own tests is a warning sign.",
    href: "https://corporatefinanceinstitute.com/resources/data-science/overfitting/",
  },
  {
    term: "Transaction costs and turnover",
    body: "Every trade has a cost. A strategy that changes position too often can look profitable until those costs are subtracted.",
    href: "https://corporatefinanceinstitute.com/resources/accounting/transaction-costs/",
  },
  {
    term: "Lookahead bias",
    body: "Accidentally using information that would not have been available at decision time. It makes results look better than they will be.",
    href: "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/look-ahead-bias/",
  },
];

export default function FieldGuide() {
  const { ref, inView } = useInView<HTMLDListElement>();
  return (
    <dl ref={ref} className={`grid gap-x-14 sm:grid-cols-2 ${inView ? "is-visible" : ""}`}>
      {TERMS.map((item, index) => (
        <div
          key={item.term}
          className="reveal-item border-t border-line py-7"
          style={{ "--i-delay": `${index * 70}ms` } as CSSProperties}
        >
          <dt className="font-display text-3xl font-extrabold uppercase leading-none">{item.term}</dt>
          <dd className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{item.body}</dd>
          <dd className="mt-2">
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-sm text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent"
            >
              Read more on CFI
              <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </dd>
        </div>
      ))}
    </dl>
  );
}
