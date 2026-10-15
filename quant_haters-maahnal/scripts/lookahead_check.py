"""
lookahead_check.py

Command-line wrapper around app.services.lookahead. Flags Round 1 / Round 2
submissions that look like they were built from future rows of the team dataset.

  next_open    open[t+2] > open[t+1]
  next_candle  (high+low)/2 at t+1 > open at t+1
  next_flow    order_flow[t+1] < 0
  next_rsi     rsi_14[t+1] > rsi_14[t]

Defaults: FLAGGED at 70% match or more, REVIEW at 60% or more.

Run inside the backend (same .env / database as the API):
  python -m scripts.lookahead_check --round 1
  python -m scripts.lookahead_check --round 2 --csv round2_lookahead.csv
  docker compose exec api python -m scripts.lookahead_check --round 1

Read-only: it never writes to the database.
"""

import argparse
import csv
import sys
from datetime import UTC, datetime

from app.database import SessionLocal
from app.services.lookahead import (
    FLAG_SHARE,
    MIN_ROWS,
    REVIEW_SHARE,
    RULE_MIN,
    RULE_NAMES,
    LookaheadError,
    run_lookahead_check,
)


def main():
    parser = argparse.ArgumentParser(description="Flag look-ahead submissions for Round 1 or Round 2.")
    parser.add_argument("--round", type=int, choices=[1, 2], required=True)
    parser.add_argument("--flag", type=float, default=FLAG_SHARE, help="Match share that flags a submission.")
    parser.add_argument("--review", type=float, default=REVIEW_SHARE, help="Match share that marks a submission for review.")
    parser.add_argument("--rule-min", type=float, default=RULE_MIN, help="Minimum rule accuracy on a file for it to count.")
    parser.add_argument("--min-rows", type=int, default=MIN_ROWS, help="Minimum comparable rows for a rule to count.")
    parser.add_argument("--csv", default=None, help="Write the full report to this CSV path.")
    args = parser.parse_args()

    round_code = f"R{args.round}"
    with SessionLocal() as db:
        try:
            report = run_lookahead_check(
                db,
                args.round,
                flag=args.flag,
                review=args.review,
                rule_min=args.rule_min,
                min_rows=args.min_rows,
            )
        except LookaheadError as exc:
            print(str(exc))
            return 1

    if not report:
        print(f"No scored {round_code} submissions yet.")
        return 0

    flagged = [r for r in report if r["status"] == "FLAGGED"]
    review = [r for r in report if r["status"] == "REVIEW"]
    problems = [r for r in report if r["status"] in {"NO_FILE", "NO_TARGETS"}]

    print(f"\nLook-ahead check {round_code} | {len(report)} submissions | "
          f"{len(flagged)} flagged | {len(review)} review | {len(problems)} could not be checked")
    print(f"Thresholds: flag >= {args.flag:.0%}, review >= {args.review:.0%}, rule must be >= {args.rule_min:.0%} accurate\n")
    header = f"{'STATUS':9s} {'TEAM':8s} {'#':>2s} {'SUBMITTED (UTC)':19s} {'PUBLIC':>7s} {'PRIVATE':>8s}  {'MATCH':>6s}  RULE"
    print(header)
    print("-" * len(header))
    order = {"FLAGGED": 0, "REVIEW": 1}
    for r in sorted(report, key=lambda x: (order.get(x["status"], 2), x["team_code"], x["submission_no"])):
        submitted = datetime.fromisoformat(r["submitted_at"]).astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S")
        private = "" if r["private_score"] is None else f"{float(r['private_score']):.2f}"
        match = "" if r["worst_agreement"] is None else f"{r['worst_agreement']:.0%}"
        print(f"{r['status']:9s} {r['team_code']:8s} {r['submission_no']:>2d} {submitted:19s} "
              f"{r['public_score']:>7.2f} {private:>8s}  {match:>6s}  {r['worst_rule'] or r['note']}")

    if args.csv:
        fields = ["status", "team_code", "team_name", "stock", "submission_no", "submitted_at",
                  "public_score", "private_score", "worst_rule", "worst_agreement"]
        for name in RULE_NAMES:
            fields += [f"{name}_rule_acc", f"{name}_agreement"]
        fields.append("note")
        with open(args.csv, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            for r in report:
                row = {**r}
                for name in RULE_NAMES:
                    row[f"{name}_rule_acc"] = "" if r["rules"][name]["rule_acc"] is None else r["rules"][name]["rule_acc"]
                    row[f"{name}_agreement"] = "" if r["rules"][name]["agreement"] is None else r["rules"][name]["agreement"]
                row["worst_agreement"] = "" if r["worst_agreement"] is None else r["worst_agreement"]
                row["worst_rule"] = r["worst_rule"] or ""
                writer.writerow(row)
        print(f"\nFull report written to {args.csv}")
    print(f"\nGenerated {datetime.now(UTC):%Y-%m-%d %H:%M:%S} UTC")
    return 0


if __name__ == "__main__":
    sys.exit(main())
