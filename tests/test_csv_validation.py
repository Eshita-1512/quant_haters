from decimal import Decimal

import pytest

from app.csv_validation import SubmissionValidationError, validate_submission_csv


def prediction_csv(*, confidence: bool = False) -> bytes:
    header = "timestamp,prediction,confidence" if confidence else "timestamp,prediction"
    rows = [header]
    for timestamp in range(1, 51):
        row = f"{timestamp},{timestamp % 2}"
        if confidence:
            row += ",0.75"
        rows.append(row)
    return ("\n".join(rows) + "\n").encode()


def test_round_one_defaults_confidence() -> None:
    rows = validate_submission_csv(prediction_csv(), round_number=1)
    assert len(rows) == 50
    assert all(row.confidence == Decimal("0.5") for row in rows)


def test_round_one_reads_confidence() -> None:
    rows = validate_submission_csv(prediction_csv(confidence=True), round_number=2)
    assert rows[0].confidence == Decimal("0.75")


def test_round_three_accepts_signal_boundaries() -> None:
    rows = ["timestamp,signal", "1,-1.0"]
    rows.extend(f"{timestamp},0" for timestamp in range(2, 50))
    rows.append("50,1.0")
    result = validate_submission_csv(("\n".join(rows) + "\n").encode(), round_number=3)
    assert result[0].signal == Decimal("-1.0")
    assert result[-1].signal == Decimal("1.0")


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"timestamp,prediction\n1,1\n", "Expected 50 rows, got 1."),
        (prediction_csv().replace(b"50,0", b"49,0"), "Duplicate timestamp"),
        (prediction_csv().replace(b"1,1", b"1,2", 1), "prediction must be 0 or 1"),
        (prediction_csv(confidence=True).replace(b"1,1,0.75", b"1,1,nan"), "non-numeric"),
    ],
)
def test_invalid_prediction_csv_is_rejected(content: bytes, message: str) -> None:
    with pytest.raises(SubmissionValidationError, match=message):
        validate_submission_csv(content, round_number=1)


@pytest.mark.parametrize(
    "content",
    [
        prediction_csv().replace(b"1,1", b"1", 1),
        prediction_csv().replace(b"1,1", b"1,1,unexpected", 1),
        prediction_csv().replace(
            b"timestamp,prediction", b"timestamp,prediction,prediction", 1
        ),
    ],
)
def test_malformed_csv_shape_is_a_safe_validation_error(content: bytes) -> None:
    with pytest.raises(SubmissionValidationError):
        validate_submission_csv(content, round_number=1)
