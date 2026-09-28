import csv
import hashlib
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.csv_validation import PredictionInput, SignalInput, SubmissionValidationError, validate_submission_csv
from app.models import EventState, PredictionRow, Round, Score, SignalRow, Stock, Submission, SubmissionStatus, Team, TeamAssignment
from app.schemas.submission import SubmissionResult
from app.services.scoring import score_binary, score_signals


def _validation_targets(stock_code: str, start: int, round_number: int) -> list[int] | list[Decimal]:
    path = get_settings().master_validation_path
    if not path.is_file():
        raise RuntimeError("Master validation data is unavailable.")
    by_timestamp: dict[int, dict[str, str]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["stock_id"] == stock_code:
                by_timestamp[int(row["master_timestamp"])] = row
    column = "target_r3" if round_number == 3 else "target_r1r2"
    values = [by_timestamp[start + offset][column] for offset in range(50)]
    return [Decimal(value) for value in values] if round_number == 3 else [int(value) for value in values]


async def process_submission(*, file: UploadFile, round_number: int, team_id: uuid.UUID, db: Session) -> SubmissionResult:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise SubmissionValidationError("Only .csv files are accepted.")
    content = await file.read(get_settings().max_upload_bytes + 1)
    if len(content) > get_settings().max_upload_bytes:
        raise SubmissionValidationError("CSV file is too large.")
    now = datetime.now(UTC)
    statement = (
        select(Team, Round, TeamAssignment, Stock)
        .join(EventState, EventState.id == 1)
        .join(Round, Round.id == EventState.current_round_id)
        .join(TeamAssignment, (TeamAssignment.team_id == Team.id) & (TeamAssignment.round_id == Round.id))
        .join(Stock, Stock.id == TeamAssignment.stock_id)
        .where(Team.id == team_id, Round.round_code == f"R{round_number}")
        .with_for_update()
    )
    row = db.execute(statement).one_or_none()
    if row is None:
        raise SubmissionValidationError(f"Round {round_number} is closed.")
    team, round_, assignment, stock = row
    if not (round_.starts_at <= now <= round_.ends_at) or round_.phase.value not in {"live", "flash_crash"}:
        raise SubmissionValidationError(f"Round {round_number} is closed.")
    count = db.scalar(select(func.count(Submission.id)).where(Submission.team_id == team_id, Submission.round_id == round_.id)) or 0
    if count >= round_.max_submissions_per_team:
        raise SubmissionValidationError(f"Submission limit ({round_.max_submissions_per_team}) reached for this round.")
    rows = validate_submission_csv(content, round_number=round_number)
    submission = Submission(team_id=team_id, round_id=round_.id, stock_id=stock.id, assignment_id=assignment.id, original_filename=file.filename, file_hash=hashlib.sha256(content).hexdigest(), file_size_bytes=len(content), row_count=50, status=SubmissionStatus.SCORING)
    db.add(submission)
    db.flush()
    targets = _validation_targets(stock.stock_code, assignment.predict_start, round_number)
    if round_number == 3:
        signals = [row.signal for row in rows if isinstance(row, SignalInput)]
        result = score_signals(signals, targets)  # type: ignore[arg-type]
        db.add_all([SignalRow(submission_id=submission.id, timestamp_index=row.timestamp, signal=row.signal) for row in rows if isinstance(row, SignalInput)])
        score = Score(submission_id=submission.id, team_id=team_id, round_id=round_.id, stock_id=stock.id, score=Decimal(str(result.score)), details={"sharpe_ratio": result.sharpe_ratio, "max_drawdown": result.max_drawdown, "transaction_cost_penalty": result.transaction_cost_penalty})
        balanced_accuracy = mcc = None
    else:
        predictions = [row.prediction for row in rows if isinstance(row, PredictionInput)]
        result = score_binary(predictions, targets)  # type: ignore[arg-type]
        db.add_all([PredictionRow(submission_id=submission.id, timestamp_index=row.timestamp, prediction=row.prediction, confidence=row.confidence) for row in rows if isinstance(row, PredictionInput)])
        score = Score(submission_id=submission.id, team_id=team_id, round_id=round_.id, stock_id=stock.id, score=Decimal(str(result.score)), balanced_accuracy=Decimal(str(result.balanced_accuracy)), mcc=Decimal(str(result.mcc)))
        balanced_accuracy, mcc = result.balanced_accuracy, result.mcc
    db.add(score)
    submission.status = SubmissionStatus.SCORED
    db.commit()
    return SubmissionResult(team_id=team.team_code, round=round_number, score=float(score.score), balanced_accuracy=balanced_accuracy, mcc=mcc, submission_number=count + 1, submissions_remaining=round_.max_submissions_per_team - count - 1)
