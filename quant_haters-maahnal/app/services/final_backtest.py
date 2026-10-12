import csv
import uuid
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    AdminAuditLog,
    Round,
    Score,
    SignalRow,
    Stock,
    Submission,
    SubmissionStatus,
    Team,
    TeamAssignment,
)
from app.schemas.admin import FinalBacktestEntry, FinalBacktestResult
from app.services.leaderboard import W_R1, W_R2, W_R3, _best_scores, publish_final_results
from app.services.scoring import score_signals


@dataclass(frozen=True)
class BacktestCandidate:
    submission_id: uuid.UUID
    team_id: uuid.UUID
    team_code: str
    team_name: str
    stock_code: str
    predict_start: int
    normal_score: Decimal


def select_best_candidates(
    candidates: list[BacktestCandidate],
) -> dict[uuid.UUID, BacktestCandidate]:
    best_by_team: dict[uuid.UUID, BacktestCandidate] = {}
    for candidate in sorted(
        candidates,
        key=lambda item: (-item.normal_score, item.team_name, str(item.submission_id)),
    ):
        best_by_team.setdefault(candidate.team_id, candidate)
    return best_by_team


def load_hidden_targets(
    path: Path, team_code: str, stock_code: str, start: int
) -> list[Decimal]:
    if not path.is_file():
        raise ValueError("Hidden validation data is unavailable.")
    targets: dict[int, Decimal] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"team_id", "stock_id", "master_timestamp", "target_r3"}
        if not required <= set(reader.fieldnames or []):
            raise ValueError("Hidden validation data has an invalid schema.")
        for row in reader:
            if row["team_id"] == team_code and row["stock_id"] == stock_code:
                targets[int(row["master_timestamp"])] = Decimal(row["target_r3"])
    try:
        sorted_keys = sorted(targets.keys())
        start_idx = start - 801
        keys_for_window = sorted_keys[start_idx : start_idx + 50]
        if len(keys_for_window) != 50:
            raise KeyError(f"Expected 50 targets for {team_code}/{stock_code}, found {len(keys_for_window)}")
        return [targets[k] for k in keys_for_window]
    except (KeyError, IndexError) as exc:
        raise ValueError("Hidden validation targets are incomplete.") from exc


def run_final_backtest(db: Session, admin_id: uuid.UUID) -> FinalBacktestResult:
    round_three = db.scalar(select(Round).where(Round.round_code == "R3"))
    if round_three is None:
        raise HTTPException(status_code=409, detail="Round R3 is not configured.")

    active_teams = db.execute(
        select(Team.id, Team.team_code, Team.team_name).where(Team.is_active.is_(True))
    ).all()
    if not active_teams:
        raise HTTPException(status_code=409, detail="No active teams are configured.")

    # Get best scores for R1 and R2
    rounds = {row.round_code: row.id for row in db.scalars(select(Round)).all()}
    r1_best_map: dict[uuid.UUID, Decimal] = {}
    r2_best_map: dict[uuid.UUID, Decimal] = {}

    if "R1" in rounds:
        b1 = _best_scores(rounds["R1"])
        for tid, score, details in db.execute(select(b1.c.team_id, b1.c.best_score, b1.c.details)).all():
            priv = details.get("private_score") if details and isinstance(details, dict) else None
            r1_best_map[tid] = Decimal(str(priv)) if priv is not None else score

    if "R2" in rounds:
        b2 = _best_scores(rounds["R2"])
        for tid, score, details in db.execute(select(b2.c.team_id, b2.c.best_score, b2.c.details)).all():
            priv = details.get("private_score") if details and isinstance(details, dict) else None
            r2_best_map[tid] = Decimal(str(priv)) if priv is not None else score

    # Submission counts across all rounds
    all_subs_map: dict[uuid.UUID, int] = {}
    for tid, count in db.execute(
        select(Submission.team_id, func.count(Submission.id))
        .where(Team.is_active.is_(True))
        .join(Team, Team.id == Submission.team_id)
        .group_by(Submission.team_id)
    ).all():
        all_subs_map[tid] = count

    # R3 candidate submissions
    r3_rows = db.execute(
        select(
            Submission.id,
            Team.id,
            Team.team_code,
            Team.team_name,
            Stock.stock_code,
            TeamAssignment.predict_start,
            Score.score,
        )
        .join(Score, Score.submission_id == Submission.id)
        .join(Team, Team.id == Submission.team_id)
        .join(Stock, Stock.id == Submission.stock_id)
        .join(TeamAssignment, TeamAssignment.id == Submission.assignment_id)
        .where(
            Submission.round_id == round_three.id,
            Submission.status == SubmissionStatus.SCORED,
            Score.is_valid.is_(True),
            Team.is_active.is_(True),
        )
    ).all()

    candidates = [BacktestCandidate(*row) for row in r3_rows]
    selected_by_team = select_best_candidates(candidates)

    team_evaluations: list[dict] = []
    hidden_path = get_settings().hidden_validation_path
    if not hidden_path.is_file():
        hidden_path = get_settings().master_validation_path

    for team_id, team_code, team_name in active_teams:
        candidate = selected_by_team.get(team_id)
        r3_score = 0.0
        r3_alpha = 0.0

        if candidate:
            signals = list(
                db.scalars(
                    select(SignalRow.signal)
                    .where(SignalRow.submission_id == candidate.submission_id)
                    .order_by(SignalRow.timestamp_index)
                ).all()
            )
            if len(signals) == 50:
                try:
                    targets = load_hidden_targets(
                        hidden_path,
                        candidate.team_code,
                        candidate.stock_code,
                        candidate.predict_start,
                    )
                    sig_score = score_signals(signals, targets)
                    r3_score = float(sig_score.score)
                    r3_alpha = float(sig_score.alpha_score)
                except Exception as exc:
                    # Fallback to normal score if hidden targets missing
                    r3_score = float(candidate.normal_score)

        r1 = r1_best_map.get(team_id)
        r2 = r2_best_map.get(team_id)
        cum_score = round(
            float(r1 or 0) * W_R1
            + float(r2 or 0) * W_R2
            + float(r3_score) * W_R3,
            2,
        )
        subs = all_subs_map.get(team_id, 0)

        team_evaluations.append({
            "team_id": team_id,
            "team": team_name,
            "team_code": team_code,
            "cumulative_score": cum_score,
            "r1_score": float(r1) if r1 is not None else None,
            "r2_score": float(r2) if r2 is not None else None,
            "r3_score": r3_score,
            "r3_alpha": r3_alpha,
            "submissions": subs,
        })

    # Sort primarily by cumulative score, breaking ties by R3 alpha, then R3 score, then name
    team_evaluations.sort(
        key=lambda item: (-item["cumulative_score"], -item["r3_alpha"], -item["r3_score"], item["team"])
    )

    rankings: list[FinalBacktestEntry] = []
    ranked_dicts: list[dict] = []
    prev_score: float | None = None
    rank = 0

    for pos, item in enumerate(team_evaluations, start=1):
        if prev_score is None or item["cumulative_score"] != prev_score:
            rank = pos
        prev_score = item["cumulative_score"]

        entry_dict = {
            "rank": rank,
            "team_id": item["team_id"],
            "team": item["team"],
            "score": item["cumulative_score"],
            "cumulative_score": item["cumulative_score"],
            "r1_score": item["r1_score"],
            "r2_score": item["r2_score"],
            "r3_score": item["r3_score"],
            "submissions": item["submissions"],
        }
        ranked_dicts.append(entry_dict)
        rankings.append(
            FinalBacktestEntry(
                rank=rank,
                team=item["team"],
                score=item["cumulative_score"],
                cumulative_score=item["cumulative_score"],
                r1_score=item["r1_score"],
                r2_score=item["r2_score"],
                r3_score=item["r3_score"],
                submissions=item["submissions"],
            )
        )

    # Publish to LeaderboardSnapshot so public visitors can see
    publish_final_results(db, admin_id, ranked_dicts)

    db.add(
        AdminAuditLog(
            admin_id=admin_id,
            action="RUN_FINAL_BACKTEST",
            details={
                "round": "R3",
                "weights": {"R1": W_R1, "R2": W_R2, "R3": W_R3},
                "teams": len(rankings),
                "rankings": [
                    {
                        "rank": r.rank,
                        "team": r.team,
                        "cumulative_score": r.score,
                        "score": r.score,
                        "r1_score": r.r1_score,
                        "r2_score": r.r2_score,
                        "r3_score": r.r3_score,
                        "submissions": r.submissions,
                    }
                    for r in rankings
                ],
            },
        )
    )
    db.commit()
    return FinalBacktestResult(rankings=rankings)
