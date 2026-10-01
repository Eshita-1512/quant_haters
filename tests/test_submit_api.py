import uuid

from fastapi.testclient import TestClient

from app.dependencies import get_current_team_id
from app.main import create_app
from app.schemas.submission import SubmissionResult
from app.csv_validation import SubmissionValidationError


def test_submit_returns_frozen_success_contract(monkeypatch) -> None:
    async def fake_process_submission(**_kwargs):
        return SubmissionResult(
            status="success",
            team_id="A01",
            round=1,
            submission_number=3,
            submissions_remaining=7,
        )

    monkeypatch.setattr("app.routers.submissions.process_submission", fake_process_submission)
    app = create_app()
    app.dependency_overrides[get_current_team_id] = lambda: uuid.uuid4()
    response = TestClient(app).post(
        "/api/v1/submit/round/1",
        headers={"Authorization": "Bearer test"},
        files={"file": ("predictions.csv", b"timestamp,prediction\n", "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["submission_number"] == 3
    assert response.json()["submissions_remaining"] == 7
    assert "score" not in response.json()
    assert "balanced_accuracy" not in response.json()
    assert "mcc" not in response.json()


def test_submit_returns_frozen_error_contract_without_detail_wrapper(monkeypatch) -> None:
    async def reject_submission(**_kwargs):
        raise SubmissionValidationError("Expected 50 rows, got 49.")

    monkeypatch.setattr("app.routers.submissions.process_submission", reject_submission)
    app = create_app()
    app.dependency_overrides[get_current_team_id] = lambda: uuid.uuid4()

    response = TestClient(app).post(
        "/api/v1/submit/round/1",
        headers={"Authorization": "Bearer test"},
        files={"file": ("predictions.csv", b"timestamp,prediction\n", "text/csv")},
    )

    assert response.status_code == 400
    assert response.json() == {
        "status": "error",
        "code": 400,
        "message": "Expected 50 rows, got 49.",
    }


def test_submit_returns_rate_limit_contract(monkeypatch) -> None:
    from app.services.submissions import SubmissionRateLimitError

    async def reject_submission(**_kwargs):
        raise SubmissionRateLimitError(retry_after_seconds=42)

    monkeypatch.setattr("app.routers.submissions.process_submission", reject_submission)
    app = create_app()
    app.dependency_overrides[get_current_team_id] = lambda: uuid.uuid4()

    response = TestClient(app).post(
        "/api/v1/submit/round/1",
        headers={"Authorization": "Bearer test"},
        files={"file": ("predictions.csv", b"timestamp,prediction\n", "text/csv")},
    )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "42"
    assert response.json() == {
        "status": "error",
        "code": 429,
        "message": "Only one submission is allowed every 60 seconds.",
        "retry_after_seconds": 42,
    }


def test_submit_returns_controlled_validation_configuration_error(monkeypatch) -> None:
    from app.services.submissions import ValidationDataError

    async def reject_submission(**_kwargs):
        raise ValidationDataError("Validation targets are unavailable for this team window.")

    monkeypatch.setattr("app.routers.submissions.process_submission", reject_submission)
    app = create_app()
    app.dependency_overrides[get_current_team_id] = lambda: uuid.uuid4()

    response = TestClient(app).post(
        "/api/v1/submit/round/1",
        headers={"Authorization": "Bearer test"},
        files={"file": ("predictions.csv", b"timestamp,prediction\n", "text/csv")},
    )

    assert response.status_code == 503
    assert response.json() == {
        "status": "error",
        "code": 503,
        "message": "Scoring validation data is unavailable.",
    }
