"""Look-ahead checker.

Flags scored prediction submissions that look like they were built from future
rows of the team dataset (look-ahead) instead of a real model.

For every scored submission it compares the team's 0/1 predictions with simple
look-ahead rules computed from the team's own dataset file:

  next_open    open[t+2] > open[t+1]          (open is roughly the previous close)
  next_candle  (high+low)/2 at t+1 > open at t+1
  next_flow    order_flow[t+1] < 0
  next_rsi     rsi_14[t+1] > rsi_14[t]

A rule only counts as evidence for a file if the rule itself is accurate on that
file (rule accuracy >= rule_min against the real targets). A submission is
FLAGGED when it agrees with such a rule on at least `flag` share of rows, and
REVIEW when it agrees on at least `review` share.

Everything here is read-only. The CLI (scripts/lookahead_check.py) and the admin
Integrity panel both call run_lookahead_check; only the integrity service writes
results and penalties.
"""

import csv
from datetime import UTC
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    DatasetRelease,
    PredictionRow,
    Round,
    Score,
    Stock,
    Submission,
    SubmissionStatus,
    Team,
    TeamAssignment,
)
from app.services.datasets import UnsafeStorageKeyError, resolve_storage_path
from app.services.submissions import ValidationDataError, _validation_targets

RULE_NAMES = ("next_open", "next_candle", "next_flow", "next_rsi")

FLAG_SHARE = 0.70
REVIEW_SHARE = 0.60
RULE_MIN = 0.70
MIN_ROWS = 30

# One place to edit the penalties and the exact text a team sees.
LOOKAHEAD_PENALTY = 20
CHECK_PENALTY = 10

WARNING_LOOKAHEAD = (
    "Your predictions match a look-ahead pattern: your model appears to be using data from later rows "
    "instead of predicting. 20 points have been deducted for this round. Predictions for each row must "
    "only use that row and earlier rows."
)
WARNING_CHECK = (
    "Please make sure your model is not using look-ahead bias. Predictions for each row must only use "
    "that row and earlier rows. 10 points have been deducted for this round."
)

MESSAGE_TEXT = {"WARNING_LOOKAHEAD": WARNING_LOOKAHEAD, "WARNING_CHECK": WARNING_CHECK}

SUGGESTED = {
    "FLAGGED": (LOOKAHEAD_PENALTY, "WARNING_LOOKAHEAD"),
    "REVIEW": (CHECK_PENALTY, "WARNING_CHECK"),
    "OK": (0, None),
    "NO_FILE": (0, None),
    "NO_TARGETS": (0, None),
}


class LookaheadError(Exception):
    """Raised when the check cannot run at all (for example the round is missing)."""


def to_float(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def load_dataset(path: Path) -> dict[int, dict[str, float | None]]:
    rows = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        reader.fieldnames = [(name or "").strip().lower() for name in (reader.fieldnames or [])]
        for row in reader:
            ts = to_float(row.get("timestamp"))
            if ts is None:
                continue
            rows[int(ts)] = {
                "open": to_float(row.get("open")),
                "high": to_float(row.get("high")),
                "low": to_float(row.get("low")),
                "order_flow": to_float(row.get("order_flow")),
                "rsi_14": to_float(row.get("rsi_14")),
            }
    return rows


def rule_predictions(data: dict, start: int, end: int) -> dict[str, dict[int, int]]:
    preds: dict[str, dict[int, int]] = {name: {} for name in RULE_NAMES}
    for t in range(start, end + 1):
        cur = data.get(t, {})
        nxt = data.get(t + 1, {})
        nxt2 = data.get(t + 2, {})
        if nxt.get("open") is not None and nxt2.get("open") is not None:
            preds["next_open"][t] = int(nxt2["open"] > nxt["open"])
        if None not in (nxt.get("high"), nxt.get("low"), nxt.get("open")):
            preds["next_candle"][t] = int((nxt["high"] + nxt["low"]) / 2 > nxt["open"])
        if nxt.get("order_flow") is not None:
            preds["next_flow"][t] = int(nxt["order_flow"] < 0)
        if cur.get("rsi_14") is not None and nxt.get("rsi_14") is not None:
            preds["next_rsi"][t] = int(nxt["rsi_14"] > cur["rsi_14"])
    return preds


def agreement(a: dict[int, int], b: dict[int, int]) -> tuple[float | None, int]:
    common = [t for t in a if t in b]
    if not common:
        return None, 0
    return sum(a[t] == b[t] for t in common) / len(common), len(common)


def dataset_path_for(db: Session, assignment_id: UUID, round_id: int) -> Path | None:
    releases = db.scalars(
        select(DatasetRelease)
        .where(DatasetRelease.assignment_id == assignment_id, DatasetRelease.round_id == round_id)
        .order_by(DatasetRelease.version.desc())
    ).all()
    if not releases:
        return None
    preferred = [r for r in releases if r.release_type == "flash_crash"] + [
        r for r in releases if r.release_type != "flash_crash"
    ]
    root = get_settings().private_data_dir
    for release in preferred:
        try:
            path = resolve_storage_path(root, release.storage_key)
        except UnsafeStorageKeyError:
            continue
        if path.is_file():
            return path
    return None


def run_lookahead_check(
    db: Session,
    round_number: int,
    flag: float = FLAG_SHARE,
    review: float = REVIEW_SHARE,
    rule_min: float = RULE_MIN,
    min_rows: int = MIN_ROWS,
) -> list[dict]:
    """Return one dict per scored submission in the round. Never writes to the database."""
    round_code = f"R{round_number}"
    round_ = db.scalar(select(Round).where(Round.round_code == round_code))
    if round_ is None:
        raise LookaheadError(f"Round {round_code} is not configured.")

    rows = db.execute(
        select(Submission, Team, TeamAssignment, Stock, Score)
        .join(Team, Team.id == Submission.team_id)
        .join(TeamAssignment, TeamAssignment.id == Submission.assignment_id)
        .join(Stock, Stock.id == Submission.stock_id)
        .join(Score, Score.submission_id == Submission.id)
        .where(Submission.round_id == round_.id, Submission.status == SubmissionStatus.SCORED)
        .order_by(Team.team_code, Submission.created_at)
    ).all()

    file_cache: dict = {}
    counters: dict = {}
    results: list[dict] = []
    for submission, team, assignment, stock, score in rows:
        counters[team.id] = counters.get(team.id, 0) + 1
        start, end = assignment.predict_start, assignment.predict_end
        entry: dict = {
            "submission_id": submission.id,
            "team_id": team.id,
            "team_code": team.team_code,
            "team_name": team.team_name,
            "stock": stock.stock_code,
            "submission_no": counters[team.id],
            "submitted_at": submission.created_at.astimezone(UTC).isoformat(),
            "public_score": float(score.score),
            "private_score": (score.details or {}).get("private_score"),
            "status": "OK",
            "worst_rule": None,
            "worst_agreement": None,
            "note": "",
            "rules": {name: {"rule_acc": None, "agreement": None} for name in RULE_NAMES},
        }
        if entry["private_score"] is not None:
            entry["private_score"] = float(entry["private_score"])

        key = (assignment.id, round_.id)
        if key not in file_cache:
            path = dataset_path_for(db, assignment.id, round_.id)
            file_cache[key] = load_dataset(path) if path else None
        data = file_cache[key]
        if data is None:
            entry["status"] = "NO_FILE"
            entry["note"] = "dataset file not found under PRIVATE_DATA_DIR"
            results.append(entry)
            continue

        try:
            targets = _validation_targets(team.team_code, stock.stock_code, start, end, round_number)
        except ValidationDataError as exc:
            entry["status"] = "NO_TARGETS"
            entry["note"] = str(exc)
            results.append(entry)
            continue
        truth = {start + i: int(v) for i, v in enumerate(targets)}

        preds = {
            start + row.timestamp_index - 1: int(row.prediction)
            for row in db.scalars(select(PredictionRow).where(PredictionRow.submission_id == submission.id)).all()
        }

        rules = rule_predictions(data, start, end)
        worst_name, worst_agree = None, -1.0
        details = []
        for name in RULE_NAMES:
            rule_acc, n_rule = agreement(rules[name], truth)
            team_agree, _n_team = agreement(preds, rules[name])
            entry["rules"][name] = {
                "rule_acc": None if rule_acc is None else round(rule_acc, 3),
                "agreement": None if team_agree is None else round(team_agree, 3),
            }
            usable = (
                rule_acc is not None
                and team_agree is not None
                and n_rule >= min_rows
                and rule_acc >= rule_min
            )
            if usable:
                details.append(f"{name} {team_agree:.0%} (rule {rule_acc:.0%})")
                if team_agree > worst_agree:
                    worst_name, worst_agree = name, team_agree

        if worst_name is None:
            entry["note"] = "no rule is accurate on this file; nothing to compare"
        else:
            entry["worst_rule"] = worst_name
            entry["worst_agreement"] = round(worst_agree, 3)
            entry["note"] = "; ".join(details)
            if worst_agree >= flag:
                entry["status"] = "FLAGGED"
            elif worst_agree >= review:
                entry["status"] = "REVIEW"
        results.append(entry)
    return results


def summarize_by_team(results: list[dict]) -> list[dict]:
    """One row per team, based on the team's worst (highest match) submission."""
    by_team: dict = {}
    for entry in results:
        by_team.setdefault(entry["team_id"], []).append(entry)

    rows = []
    for team_id, subs in by_team.items():
        worst = max(
            subs,
            key=lambda r: (r["worst_agreement"] is not None, r["worst_agreement"] or 0.0, -r["submission_no"]),
        )
        points, message_key = SUGGESTED[worst["status"]]
        rows.append(
            {
                "team_id": team_id,
                "team_code": worst["team_code"],
                "team_name": worst["team_name"],
                "status": worst["status"],
                "submission_count": len(subs),
                "submission_no": worst["submission_no"],
                "worst_submission_id": worst["submission_id"],
                "worst_rule": worst["worst_rule"],
                "worst_agreement": worst["worst_agreement"],
                "public_score": worst["public_score"],
                "private_score": worst["private_score"],
                "suggested_points": points,
                "suggested_message_key": message_key,
            }
        )
    order = {"FLAGGED": 0, "REVIEW": 1, "OK": 2}
    rows.sort(
        key=lambda r: (
            order.get(r["status"], 3),
            -(r["worst_agreement"] if r["worst_agreement"] is not None else -1.0),
            r["team_code"],
        )
    )
    return rows

