import csv
import uuid
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
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
    candidates: list[BacktestCandidate], active_team_ids: set[uuid.UUID]
) -> list[BacktestCandidate]:
    best_by_team: dict[uuid.UUID, BacktestCandidate] = {}
    for candidate in sorted(
        candidates,
        key=lambda item: (-item.normal_score, item.team_name, str(item.submission_id)),
    ):
        best_by_team.setdefault(candidate.team_id, candidate)
    if set(best_by_team) != active_team_ids:
        raise ValueError("One or more active teams are missing a valid R3 submission.")
    return sorted(best_by_team.values(), key=lambda item: item.team_name)


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
        return [targets[start + offset] for offset in range(50)]
    except KeyError as exc:
        raise ValueError("Hidden validation targets are incomplete.") from exc


def run_final_backtest(db: Session, admin_id: uuid.UUID) -> FinalBacktestResult:
    round_three = db.scalar(select(Round).where(Round.round_code == "R3"))
    if round_three is None:
        raise HTTPException(status_code=409, detail="Round R3 is not configured.")

    active_team_ids = set(
        db.scalars(select(Team.id).where(Team.is_active.is_(True))).all()
    )
    if not active_team_ids:
        raise HTTPException(status_code=409, detail="No active teams are configured.")
    rows = db.execute(
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

    scored: list[tuple[str, float]] = []
    try:
        candidates = [BacktestCandidate(*row) for row in rows]
        selected = select_best_candidates(candidates, active_team_ids)
        for candidate in selected:
            signals = list(
                db.scalars(
                    select(SignalRow.signal)
                    .where(SignalRow.submission_id == candidate.submission_id)
                    .order_by(SignalRow.timestamp_index)
                ).all()
            )
            if len(signals) != 50:
                raise ValueError("Selected R3 submission has incomplete signals.")
            targets = load_hidden_targets(
                get_settings().hidden_validation_path,
                candidate.team_code,
                candidate.stock_code,
                candidate.predict_start,
            )
            scored.append(
                (candidate.team_name, score_signals(signals, targets).alpha_score)
            )
    except (ArithmeticError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    scored.sort(key=lambda item: (-item[1], item[0]))
    rankings = [
        FinalBacktestEntry(rank=rank, team=team, score=score)
        for rank, (team, score) in enumerate(scored, start=1)
    ]
    db.add(
        AdminAuditLog(
            admin_id=admin_id,
            action="RUN_FINAL_BACKTEST",
            details={"round": "R3", "teams": len(rankings)},
        )
    )
    db.commit()
    return FinalBacktestResult(rankings=rankings)
