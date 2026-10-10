import csv
import hashlib
import math
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.csv_validation import PredictionInput, SignalInput, SubmissionValidationError, validate_submission_csv
from app.models import EventState, PredictionRow, Round, Score, SignalRow, Stock, Submission, SubmissionRateLimit, SubmissionStatus, Team, TeamAssignment
from app.schemas.submission import SubmissionResult
from app.services.scoring import score_binary, score_signals


class SubmissionRateLimitError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Only one submission is allowed every 60 seconds.")
        self.retry_after_seconds = retry_after_seconds


class ValidationDataError(RuntimeError):
    """Raised when server-owned scoring data cannot safely score a submission."""


def rate_limit_retry_after(last_attempt_at: datetime, now: datetime) -> int:
    elapsed = (now - last_attempt_at).total_seconds()
    return max(0, math.ceil(60 - elapsed))


def _rate_limit_insert_statement(team_id: uuid.UUID, now: datetime):
    return (
        postgresql_insert(SubmissionRateLimit)
        .values(team_id=team_id, last_attempt_at=now)
        .on_conflict_do_nothing(index_elements=[SubmissionRateLimit.team_id])
        .returning(SubmissionRateLimit.team_id)
    )


def _rate_limit_row_statement(team_id: uuid.UUID):
    return (
        select(SubmissionRateLimit)
        .where(SubmissionRateLimit.team_id == team_id)
        .with_for_update()
    )


def enforce_submission_rate_limit(db: Session, team_id: uuid.UUID, now: datetime) -> None:
    created_team_id = db.execute(_rate_limit_insert_statement(team_id, now)).scalar_one_or_none()
    if created_team_id is not None:
        return

    limiter = db.scalar(_rate_limit_row_statement(team_id))
    if limiter is None:
        raise RuntimeError("Submission rate limiter could not be initialized.")
    retry_after = rate_limit_retry_after(limiter.last_attempt_at, now)
    if retry_after:
        db.rollback()
        raise SubmissionRateLimitError(retry_after)
    limiter.last_attempt_at = now


import functools

@functools.lru_cache(maxsize=1)
def _load_all_master_validation(path_str: str, required_tuple: tuple) -> dict:
    from pathlib import Path
    by_key = {}
    with Path(path_str).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not set(required_tuple) <= set(reader.fieldnames or []):
            raise ValidationDataError("Master validation data has an invalid schema.")
        for row in reader:
            key = (row["team_id"], row["stock_id"])
            if key not in by_key:
                by_key[key] = {}
            by_key[key][int(row["master_timestamp"])] = row
    return by_key

def _validation_targets(
    team_code: str, stock_code: str, start: int, end: int, round_number: int
) -> list[int] | list[Decimal]:
    path = get_settings().master_validation_path
    if not path.is_file():
        raise ValidationDataError("Master validation data is unavailable.")
    column = "target_r3" if round_number == 3 else "target_r1r2"
    required = {"team_id", "stock_id", "master_timestamp", column}
    try:
        all_data = _load_all_master_validation(str(path), tuple(sorted(required)))
        by_timestamp = all_data.get((team_code, stock_code), {})
        length = end - start + 1
        
        sorted_keys = sorted(by_timestamp.keys())
        start_idx = start - 801
        keys_for_window = sorted_keys[start_idx : start_idx + length]
        
        if len(keys_for_window) != length:
            raise KeyError(f"Missing targets for window {start}-{end}")
            
        values = [by_timestamp[k][column] for k in keys_for_window]
        return (
            [Decimal(str(value)) for value in values]
            if round_number == 3
            else [int(float(value)) for value in values]
        )
    except ValidationDataError:
        raise
    except KeyError as exc:
        raise ValidationDataError(
            "Validation targets are unavailable for this team window."
        ) from exc
    except (ArithmeticError, OSError, TypeError, ValueError) as exc:
        raise ValidationDataError("Master validation data is invalid.") from exc


def submission_context_statement(team_id: uuid.UUID, round_number: int):
    return (
        select(Team, Round, TeamAssignment, Stock)
        .select_from(Team)
        .join(EventState, EventState.id == 1)
        .join(Round, Round.id == EventState.current_round_id)
        .join(TeamAssignment, (TeamAssignment.team_id == Team.id) & (TeamAssignment.round_id == Round.id))
        .join(Stock, Stock.id == TeamAssignment.stock_id)
        .where(Team.id == team_id, Round.round_code == f"R{round_number}")
        .with_for_update()
    )


async def process_submission(*, file: UploadFile, round_number: int, team_id: uuid.UUID, db: Session) -> SubmissionResult:
    now = datetime.now(UTC)
    enforce_submission_rate_limit(db, team_id, now)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise SubmissionValidationError("Only .csv files are accepted.")
    content = await file.read(get_settings().max_upload_bytes + 1)
    if len(content) > get_settings().max_upload_bytes:
        raise SubmissionValidationError("CSV file is too large.")
    row = db.execute(submission_context_statement(team_id, round_number)).one_or_none()
    if row is None:
        raise SubmissionValidationError(f"Round {round_number} is closed.")
    team, round_, assignment, stock = row
    if not (round_.starts_at <= now <= round_.ends_at) or round_.phase.value not in {"live", "flash_crash"}:
        raise SubmissionValidationError(f"Round {round_number} is closed.")
    count = db.scalar(select(func.count(Submission.id)).where(Submission.team_id == team_id, Submission.round_id == round_.id)) or 0
    if count >= round_.max_submissions_per_team:
        raise SubmissionValidationError(f"Submission limit ({round_.max_submissions_per_team}) reached for this round.")
    rows = sorted(validate_submission_csv(content, round_number=round_number, predict_start=assignment.predict_start, predict_end=assignment.predict_end), key=lambda item: item.timestamp)
    submission = Submission(team_id=team_id, round_id=round_.id, stock_id=stock.id, assignment_id=assignment.id, original_filename=file.filename, file_hash=hashlib.sha256(content).hexdigest(), file_size_bytes=len(content), row_count=50, status=SubmissionStatus.SCORING)
    db.add(submission)
    db.flush()
    targets = _validation_targets(
        team.team_code, stock.stock_code, assignment.predict_start, assignment.predict_end, round_number
    )
    half = len(targets) // 2
    if round_number == 3:
        signals = [row.signal for row in rows if isinstance(row, SignalInput)]
        result = score_signals(signals[:half], targets[:half])  # type: ignore[arg-type]
        private_result = score_signals(signals, targets)  # type: ignore[arg-type]
        db.add_all([SignalRow(submission_id=submission.id, timestamp_index=row.timestamp - assignment.predict_start + 1, signal=row.signal) for row in rows if isinstance(row, SignalInput)])
        score = Score(submission_id=submission.id, team_id=team_id, round_id=round_.id, stock_id=stock.id, score=Decimal(str(result.score)), details={"sharpe_ratio": result.sharpe_ratio, "max_drawdown": result.max_drawdown, "transaction_cost_penalty": result.transaction_cost_penalty, "alpha_score": result.alpha_score, "private_score": private_result.score})
        balanced_accuracy = mcc = None
    else:
        predictions = [row.prediction for row in rows if isinstance(row, PredictionInput)]
        result = score_binary(predictions[:half], targets[:half])  # type: ignore[arg-type]
        private_result = score_binary(predictions, targets)  # type: ignore[arg-type]
        db.add_all([PredictionRow(submission_id=submission.id, timestamp_index=row.timestamp - assignment.predict_start + 1, prediction=row.prediction, confidence=row.confidence) for row in rows if isinstance(row, PredictionInput)])
        score = Score(submission_id=submission.id, team_id=team_id, round_id=round_.id, stock_id=stock.id, score=Decimal(str(result.score)), balanced_accuracy=Decimal(str(result.balanced_accuracy)), mcc=Decimal(str(result.mcc)), details={"private_score": private_result.score})
        balanced_accuracy, mcc = result.balanced_accuracy, result.mcc
    db.add(score)
    submission.status = SubmissionStatus.SCORED
    db.commit()
    return SubmissionResult(team_id=team.team_code, round=round_number, submission_number=count + 1, submissions_remaining=round_.max_submissions_per_team - count - 1)
