import csv
import uuid
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
from app.services.scoring import score_signals


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

    ranked = (
        select(
            Submission.id.label("submission_id"),
            Submission.team_id,
            Submission.stock_id,
            Submission.assignment_id,
            func.row_number()
            .over(
                partition_by=Submission.team_id,
                order_by=(Score.score.desc(), Submission.created_at.asc()),
            )
            .label("position"),
        )
        .join(Score, Score.submission_id == Submission.id)
        .where(
            Submission.round_id == round_three.id,
            Submission.status == SubmissionStatus.SCORED,
            Score.is_valid.is_(True),
        )
        .subquery()
    )
    rows = db.execute(
        select(
            ranked.c.submission_id,
            Team.team_code,
            Team.team_name,
            Stock.stock_code,
            TeamAssignment.predict_start,
        )
        .join(Team, Team.id == ranked.c.team_id)
        .join(Stock, Stock.id == ranked.c.stock_id)
        .join(TeamAssignment, TeamAssignment.id == ranked.c.assignment_id)
        .where(ranked.c.position == 1, Team.is_active.is_(True))
    ).all()
    if not rows:
        raise HTTPException(status_code=409, detail="No valid R3 submissions are available.")

    scored: list[tuple[str, float]] = []
    try:
        for submission_id, team_code, team_name, stock_code, predict_start in rows:
            signals = list(
                db.scalars(
                    select(SignalRow.signal)
                    .where(SignalRow.submission_id == submission_id)
                    .order_by(SignalRow.timestamp_index)
                ).all()
            )
            if len(signals) != 50:
                raise ValueError("Selected R3 submission has incomplete signals.")
            targets = load_hidden_targets(
                get_settings().hidden_validation_path,
                team_code,
                stock_code,
                predict_start,
            )
            scored.append((team_name, score_signals(signals, targets).score))
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
