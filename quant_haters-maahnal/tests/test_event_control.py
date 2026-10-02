import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.dependencies import get_current_admin_id
from app.main import create_app
from app.models import RoundPhase
from app.routers.admin import apply_start_round, apply_timer, get_admin_status
from app.schemas.admin import AdminStatus
from app.services.event_control import (
    DEFAULT_FLASH_CRASH_MESSAGE,
    apply_timer_action,
    display_ends_at,
    effective_round_phase,
    round_remaining_seconds,
    start_round,
)


NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def make_round(code: str, phase: RoundPhase, *, remaining: int = 600, round_id: int = 1, paused: int | None = None):
    return SimpleNamespace(
        id=round_id,
        round_code=code,
        phase=phase,
        starts_at=NOW - timedelta(minutes=5),
        ends_at=NOW + timedelta(seconds=remaining),
        paused_remaining_seconds=paused,
    )


def make_state(*, flash: bool = False, current_round_id: int = 1):
    return SimpleNamespace(
        current_round_id=current_round_id,
        flash_crash_active=flash,
        flash_crash_message="Crash!" if flash else None,
        flash_crash_triggered_at=NOW if flash else None,
        state_version=1,
    )


def test_expired_open_round_is_reported_completed() -> None:
    round_ = make_round("R1", RoundPhase.LIVE, remaining=-1)
    assert effective_round_phase(round_, NOW) == RoundPhase.COMPLETED
    assert round_remaining_seconds(round_, NOW) == 0


def test_pause_freezes_remaining_time_and_resume_restores_it() -> None:
    state = make_state()
    round_ = make_round("R1", RoundPhase.LIVE, remaining=600)

    apply_timer_action(state, round_, "pause", None, NOW)
    assert round_.phase == RoundPhase.PAUSED
    assert round_.paused_remaining_seconds == 600

    later = NOW + timedelta(minutes=30)
    assert round_remaining_seconds(round_, later) == 600
    assert display_ends_at(round_, later) == later + timedelta(seconds=600)

    apply_timer_action(state, round_, "resume", None, later)
    assert round_.phase == RoundPhase.LIVE
    assert round_.paused_remaining_seconds is None
    assert round_.ends_at == later + timedelta(seconds=600)
    assert state.state_version == 3


def test_resume_during_round_two_returns_to_flash_crash_phase() -> None:
    state = make_state(flash=True, current_round_id=2)
    round_ = make_round("R2", RoundPhase.PAUSED, round_id=2, paused=120)

    apply_timer_action(state, round_, "resume", None, NOW)

    assert round_.phase == RoundPhase.FLASH_CRASH


def test_extend_and_set_adjust_running_clock() -> None:
    state = make_state()
    round_ = make_round("R1", RoundPhase.LIVE, remaining=600)

    apply_timer_action(state, round_, "extend", 300, NOW)
    assert round_.ends_at == NOW + timedelta(seconds=900)

    apply_timer_action(state, round_, "set", 60, NOW)
    assert round_.ends_at == NOW + timedelta(seconds=60)

    apply_timer_action(state, round_, "extend", -600, NOW)
    assert round_.phase == RoundPhase.COMPLETED


def test_extend_while_paused_changes_frozen_time_only() -> None:
    state = make_state()
    round_ = make_round("R1", RoundPhase.PAUSED, paused=100)

    apply_timer_action(state, round_, "extend", 60, NOW)

    assert round_.phase == RoundPhase.PAUSED
    assert round_.paused_remaining_seconds == 160


def test_extend_reopens_a_round_whose_time_ran_out() -> None:
    state = make_state()
    round_ = make_round("R1", RoundPhase.LIVE, remaining=-10)

    apply_timer_action(state, round_, "extend", 120, NOW)

    assert effective_round_phase(round_, NOW) == RoundPhase.LIVE
    assert round_remaining_seconds(round_, NOW) == 120


def test_end_closes_round_immediately() -> None:
    state = make_state()
    round_ = make_round("R1", RoundPhase.LIVE)

    apply_timer_action(state, round_, "end", None, NOW)

    assert round_.phase == RoundPhase.COMPLETED
    assert round_.ends_at == NOW
    assert round_remaining_seconds(round_, NOW) == 0


@pytest.mark.parametrize(
    ("phase", "action", "seconds"),
    [
        (RoundPhase.COMPLETED, "pause", None),
        (RoundPhase.LIVE, "resume", None),
        (RoundPhase.LIVE, "extend", None),
        (RoundPhase.SCHEDULED, "set", 60),
    ],
)
def test_invalid_timer_actions_are_rejected(phase, action, seconds) -> None:
    state = make_state()
    round_ = make_round("R1", phase)

    with pytest.raises(HTTPException) as exc:
        apply_timer_action(state, round_, action, seconds, NOW)

    assert exc.value.status_code in {400, 409}
    assert state.state_version == 1


def _rounds():
    return {
        "R1": make_round("R1", RoundPhase.LIVE, round_id=1),
        "R2": make_round("R2", RoundPhase.SCHEDULED, round_id=2),
        "R3": make_round("R3", RoundPhase.SCHEDULED, round_id=3),
    }


def test_starting_round_two_triggers_the_flash_crash() -> None:
    state = make_state()
    rounds = _rounds()

    start_round(state, rounds, "R2", 3600, NOW)

    assert state.current_round_id == 2
    assert state.flash_crash_active is True
    assert state.flash_crash_message == DEFAULT_FLASH_CRASH_MESSAGE
    assert state.flash_crash_triggered_at == NOW
    assert rounds["R1"].phase == RoundPhase.COMPLETED
    assert rounds["R2"].phase == RoundPhase.FLASH_CRASH
    assert rounds["R2"].starts_at == NOW
    assert rounds["R2"].ends_at == NOW + timedelta(hours=1)
    assert rounds["R3"].phase == RoundPhase.SCHEDULED


def test_starting_round_three_clears_the_flash_crash() -> None:
    state = make_state(flash=True, current_round_id=2)
    rounds = _rounds()

    start_round(state, rounds, "R3", 1800, NOW)

    assert state.current_round_id == 3
    assert state.flash_crash_active is False
    assert state.flash_crash_message is None
    assert rounds["R1"].phase == RoundPhase.COMPLETED
    assert rounds["R2"].phase == RoundPhase.COMPLETED
    assert rounds["R3"].phase == RoundPhase.LIVE


def test_restarting_round_one_resets_later_rounds() -> None:
    state = make_state(flash=True, current_round_id=2)
    rounds = _rounds()
    rounds["R2"].phase = RoundPhase.FLASH_CRASH

    start_round(state, rounds, "R1", 600, NOW)

    assert state.current_round_id == 1
    assert state.flash_crash_active is False
    assert rounds["R1"].phase == RoundPhase.LIVE
    assert rounds["R2"].phase == RoundPhase.SCHEDULED


def test_starting_unconfigured_round_is_rejected() -> None:
    state = make_state()
    with pytest.raises(HTTPException) as exc:
        start_round(state, {"R1": make_round("R1", RoundPhase.LIVE)}, "R3", 600, NOW)
    assert exc.value.status_code == 409


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/api/v1/admin/status"), ("post", "/api/v1/admin/timer"), ("post", "/api/v1/admin/round")],
)
def test_admin_control_routes_require_admin_token(method: str, path: str) -> None:
    response = getattr(TestClient(create_app()), method)(path)
    assert response.status_code == 401


def _admin_status() -> AdminStatus:
    return AdminStatus(
        current_round="R2",
        flash_crash_active=True,
        state_version=4,
        submissions_count=7,
        time_remaining_seconds=3600,
        server_time=NOW,
        round_name="Flash Crash",
        round_phase="flash_crash",
        round_ends_at=NOW + timedelta(hours=1),
        flash_crash_message="Crash!",
        flash_crash_triggered_at=NOW,
        rounds=[],
        teams_total=40,
    )


@pytest.mark.parametrize(
    ("dependency", "method", "path", "body"),
    [
        (get_admin_status, "get", "/api/v1/admin/status", None),
        (apply_timer, "post", "/api/v1/admin/timer", {"action": "pause"}),
        (apply_start_round, "post", "/api/v1/admin/round", {"round": "R2", "duration_seconds": 3600}),
    ],
)
def test_admin_control_routes_return_full_status(dependency, method, path, body) -> None:
    app = create_app()
    app.dependency_overrides[get_current_admin_id] = lambda: uuid.uuid4()
    app.dependency_overrides[dependency] = _admin_status
    client = TestClient(app)
    kwargs = {"headers": {"Authorization": "Bearer admin"}}
    if body is not None:
        kwargs["json"] = body

    response = getattr(client, method)(path, **kwargs)

    assert response.status_code == 200
    payload = response.json()
    assert payload["current_round"] == "R2"
    assert payload["round_phase"] == "flash_crash"
    assert payload["submissions_count"] == 7
    assert payload["teams_total"] == 40


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/v1/admin/timer", {"action": "rewind"}),
        ("/api/v1/admin/round", {"round": "R4", "duration_seconds": 60}),
        ("/api/v1/admin/round", {"round": "R1", "duration_seconds": 0}),
    ],
)
def test_admin_control_routes_validate_payloads(path: str, body: dict) -> None:
    app = create_app()
    app.dependency_overrides[get_current_admin_id] = lambda: uuid.uuid4()

    response = TestClient(app).post(path, json=body, headers={"Authorization": "Bearer admin"})

    assert response.status_code == 422


def test_turning_flash_crash_off_is_rejected() -> None:
    app = create_app()
    app.dependency_overrides[get_current_admin_id] = lambda: uuid.uuid4()

    response = TestClient(app).post(
        "/api/v1/admin/flash-crash", json={"active": False}, headers={"Authorization": "Bearer admin"}
    )

    assert response.status_code == 409
