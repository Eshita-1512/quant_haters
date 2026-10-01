from decimal import Decimal

from fastapi.testclient import TestClient

from app.dependencies import get_current_admin_id
from app.main import create_app
from app.routers.admin import get_admin_live_leaderboard, publish_leaderboard_snapshot
from app.routers.leaderboard import get_public_leaderboard
from app.schemas.leaderboard import LeaderboardEntry, SnapshotResult


ENTRIES = [
    LeaderboardEntry(
        rank=1, team="Team A", score=Decimal("0.850000"), submissions=3
    ),
    LeaderboardEntry(
        rank=2, team="Team B", score=Decimal("0.721000"), submissions=2
    ),
]


def test_public_leaderboard_requires_no_auth_and_returns_frozen_contract() -> None:
    app = create_app()
    app.dependency_overrides[get_public_leaderboard] = lambda: ENTRIES

    response = TestClient(app).get("/api/v1/leaderboard")

    assert response.status_code == 200
    assert response.json() == [
        {"rank": 1, "team": "Team A", "score": "0.850000", "submissions": 3},
        {"rank": 2, "team": "Team B", "score": "0.721000", "submissions": 2},
    ]


def test_admin_live_leaderboard_requires_admin_token() -> None:
    response = TestClient(create_app()).get("/api/v1/admin/leaderboard")
    assert response.status_code == 401


def test_admin_live_leaderboard_returns_current_scores() -> None:
    app = create_app()
    app.dependency_overrides[get_current_admin_id] = lambda: "admin-id"
    app.dependency_overrides[get_admin_live_leaderboard] = lambda: ENTRIES

    response = TestClient(app).get(
        "/api/v1/admin/leaderboard", headers={"Authorization": "Bearer admin"}
    )

    assert response.status_code == 200
    assert response.json()[0]["rank"] == 1
    assert response.json()[0]["submissions"] == 3


def test_admin_can_publish_public_snapshot() -> None:
    app = create_app()
    app.dependency_overrides[get_current_admin_id] = lambda: "admin-id"
    app.dependency_overrides[publish_leaderboard_snapshot] = lambda: SnapshotResult(
        status="success", snapshot_id="snapshot-id", entries=2
    )

    response = TestClient(app).post(
        "/api/v1/admin/leaderboard/snapshot",
        headers={"Authorization": "Bearer admin"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "success",
        "snapshot_id": "snapshot-id",
        "entries": 2,
    }
