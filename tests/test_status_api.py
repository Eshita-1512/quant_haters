from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.dependencies import get_current_team_id
from app.main import create_app
from app.routers.event import get_status
from app.schemas.event import EventStatus, StatusStock


def test_status_returns_timer_and_flash_crash_state() -> None:
    app = create_app()
    app.dependency_overrides[get_current_team_id] = lambda: "team-id"
    app.dependency_overrides[get_status] = lambda: EventStatus(
        state_version=2,
        server_time=datetime.now(UTC),
        current_round="R2",
        round_name="Round 2",
        round_phase="flash_crash",
        round_ends_at=datetime.now(UTC) + timedelta(hours=1),
        time_remaining_seconds=3600,
        flash_crash_active=True,
        flash_crash_message="Download crash data.",
        assigned_stock=StatusStock(code="STOCK_A", name="Stock A"),
        download_available=True,
    )
    response = TestClient(app).get(
        "/api/v1/event/status", headers={"Authorization": "Bearer test"}
    )
    assert response.status_code == 200
    assert response.json()["current_round"] == "R2"
    assert response.json()["flash_crash_active"] is True
    assert response.json()["time_remaining_seconds"] == 3600
