from decimal import Decimal

from fastapi.testclient import TestClient

from app.dependencies import get_current_team_id
from app.main import create_app
from app.routers.leaderboard import get_leaderboard
from app.schemas.leaderboard import LeaderboardEntry


def test_leaderboard_preserves_frontend_contract() -> None:
    app = create_app()
    app.dependency_overrides[get_current_team_id] = lambda: "team-id"
    app.dependency_overrides[get_leaderboard] = lambda: [
        LeaderboardEntry(team="Team A", score=Decimal("0.850000")),
        LeaderboardEntry(team="Team B", score=Decimal("0.721000")),
    ]
    response = TestClient(app).get(
        "/api/v1/leaderboard", headers={"Authorization": "Bearer test"}
    )
    assert response.status_code == 200
    assert response.json() == [
        {"team": "Team A", "score": "0.850000"},
        {"team": "Team B", "score": "0.721000"},
    ]
