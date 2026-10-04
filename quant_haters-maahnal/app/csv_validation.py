import csv
import io
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


class SubmissionValidationError(ValueError):
    pass


@dataclass(frozen=True)
class PredictionInput:
    timestamp: int
    prediction: int
    confidence: Decimal


@dataclass(frozen=True)
class SignalInput:
    timestamp: int
    signal: Decimal


def _decimal(value: str | None, row_number: int) -> Decimal:
    try:
        number = Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        raise SubmissionValidationError(f"Row {row_number}: non-numeric value found.") from None
    if not number.is_finite():
        raise SubmissionValidationError(f"Row {row_number}: non-numeric value found.")
    return number


def validate_submission_csv(content: bytes, *, round_number: int, predict_start: int, predict_end: int) -> list[PredictionInput | SignalInput]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise SubmissionValidationError("CSV must use UTF-8 encoding.") from None

    reader = csv.DictReader(io.StringIO(text))
    expected = {"timestamp", "signal"} if round_number == 3 else {"timestamp", "prediction"}
    allowed = expected if round_number == 3 else expected | {"confidence"}
    headers = reader.fieldnames or []
    if len(headers) != len(set(headers)):
        raise SubmissionValidationError("Invalid CSV schema")
    if not expected.issubset(headers):
        missing = sorted(expected - set(headers))
        raise SubmissionValidationError(f"Missing columns: {', '.join(missing)}")
    if set(headers) - allowed:
        raise SubmissionValidationError("Invalid CSV schema")

    raw_rows = list(reader)
    expected_count = predict_end - predict_start + 1
    if len(raw_rows) != expected_count:
        raise SubmissionValidationError(f"Expected {expected_count} rows, got {len(raw_rows)}.")

    result: list[PredictionInput | SignalInput] = []
    seen: set[int] = set()
    for row_number, row in enumerate(raw_rows, start=1):
        if None in row or any(row.get(column) is None for column in expected):
            raise SubmissionValidationError(f"Row {row_number}: invalid number of columns.")
        try:
            timestamp = int(row["timestamp"])
        except (TypeError, ValueError):
            raise SubmissionValidationError(f"Row {row_number}: non-numeric value found.") from None
        if timestamp in seen:
            raise SubmissionValidationError(f"Duplicate timestamp found at row {row_number}.")
        if timestamp < predict_start or timestamp > predict_end:
            raise SubmissionValidationError(f"Timestamp {timestamp} is outside your assigned window.")
        seen.add(timestamp)

        if round_number == 3:
            signal = _decimal(row["signal"], row_number)
            if not Decimal("-1") <= signal <= Decimal("1"):
                raise SubmissionValidationError(f"Row {row_number}: signal must be between -1.0 and 1.0.")
            result.append(SignalInput(timestamp, signal))
        else:
            prediction_number = _decimal(row["prediction"], row_number)
            if prediction_number not in (Decimal(0), Decimal(1)):
                raise SubmissionValidationError(f"Row {row_number}: prediction must be 0 or 1.")
            confidence_text = row.get("confidence") or "0.5"
            confidence = _decimal(confidence_text, row_number)
            if not Decimal(0) <= confidence <= Decimal(1):
                raise SubmissionValidationError(f"Row {row_number}: confidence must be between 0.0 and 1.0.")
            result.append(PredictionInput(timestamp, int(prediction_number), confidence))

    expected_set = set(range(predict_start, predict_end + 1))
    if seen != expected_set:
        missing = min(expected_set - seen)
        raise SubmissionValidationError(f"Timestamp {missing} is missing from your submission.")
    return result
