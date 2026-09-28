import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.dependencies import get_current_admin_id
from app.main import create_app
from app.routers.admin import (
    activate_flash_crash_rounds,
    ensure_flash_crash_transition_allowed,
    trigger_flash_crash,
)
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


def test_flash_crash_opens_round_two_immediately_and_preserves_duration() -> None:
    now = datetime.now(UTC)
    round_one = SimpleNamespace(phase="live")
    round_two = SimpleNamespace(
        phase="scheduled",
        starts_at=now + timedelta(hours=4),
        ends_at=now + timedelta(hours=5),
        id=2,
    )
    state = SimpleNamespace(
        current_round_id=1,
        flash_crash_active=False,
        flash_crash_message=None,
        state_version=7,
    )

    activate_flash_crash_rounds(state, round_one, round_two, now=now)

    assert round_two.starts_at == now
    assert round_two.ends_at == now + timedelta(hours=1)
    assert state.current_round_id == 2
    assert state.flash_crash_active is True
    assert state.state_version == 8


def test_flash_crash_cannot_be_triggered_twice() -> None:
    state = SimpleNamespace(current_round_id=2, flash_crash_active=True)
    round_one = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc:
        ensure_flash_crash_transition_allowed(state, round_one)

    assert exc.value.status_code == 409
