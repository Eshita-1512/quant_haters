import uuid

from fastapi.testclient import TestClient

from app.dependencies import get_current_admin_id
from app.main import create_app
from app.routers.admin import trigger_flash_crash
from app.schemas.admin import FlashCrashResult


def test_flash_crash_requires_admin_token() -> None:
    response = TestClient(create_app()).post("/api/v1/admin/flash-crash")
    assert response.status_code == 401


def test_flash_crash_returns_new_round_state() -> None:
    app = create_app()
    app.dependency_overrides[get_current_admin_id] = lambda: uuid.uuid4()
    app.dependency_overrides[trigger_flash_crash] = lambda: FlashCrashResult(
        status="success", current_round="R2", flash_crash_active=True, state_version=2
    )
    response = TestClient(app).post(
        "/api/v1/admin/flash-crash", headers={"Authorization": "Bearer admin"}
    )
    assert response.status_code == 200
    assert response.json()["current_round"] == "R2"
    assert response.json()["flash_crash_active"] is True
