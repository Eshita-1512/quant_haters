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
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TERMS.map((item) => (
        <li key={item.term} className="flex flex-col rounded-xl border border-line bg-panel p-5">
          <h3 className="font-semibold tracking-tight">{item.term}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{item.body}</p>
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center self-start text-sm text-accent underline-offset-4 hover:underline"
          >
            Read more
          </a>
        </li>
      ))}
    </ul>
  );
}
