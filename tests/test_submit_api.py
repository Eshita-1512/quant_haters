import uuid

from fastapi.testclient import TestClient

from app.dependencies import get_current_team_id
from app.main import create_app
from app.schemas.submission import SubmissionResult


def test_submit_returns_frozen_success_contract(monkeypatch) -> None:
    async def fake_process_submission(**_kwargs):
        return SubmissionResult(
            status="success",
            team_id="A01",
            round=1,
            score=0.7234,
            balanced_accuracy=0.68,
            mcc=0.41,
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
