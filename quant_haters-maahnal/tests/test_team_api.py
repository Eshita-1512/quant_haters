from fastapi.testclient import TestClient

from app.dependencies import get_current_team_profile
from app.main import create_app
from app.schemas.team import StockInfo, TeamProfile


def test_team_me_returns_assignment_windows() -> None:
    app = create_app()
    app.dependency_overrides[get_current_team_profile] = lambda: TeamProfile(
        team_id="A01",
        team_name="Team A01",
        assigned_stock=StockInfo(code="STOCK_A", name="Stock A"),
        train_start=1,
        train_end=800,
        predict_start=801,
        predict_end=850,
    )
    response = TestClient(app).get(
        "/api/v1/team/me", headers={"Authorization": "Bearer test"}
    )
    assert response.status_code == 200
    assert response.json()["assigned_stock"]["code"] == "STOCK_A"
    assert response.json()["predict_start"] == 801


def test_team_me_requires_bearer_token() -> None:
    response = TestClient(create_app()).get("/api/v1/team/me")
    assert response.status_code == 401
