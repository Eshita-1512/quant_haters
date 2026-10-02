from pathlib import Path
from types import SimpleNamespace
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.dialects import postgresql

from app.services.submissions import (
    ValidationDataError,
    _rate_limit_insert_statement,
    _rate_limit_row_statement,
    _validation_targets,
    rate_limit_retry_after,
)


def test_validation_targets_are_selected_by_team_and_stock(
    tmp_path: Path, monkeypatch
) -> None:
    validation = tmp_path / "master_validation.csv"
    rows = ["team_id,stock_id,master_timestamp,target_r1r2,target_r3"]
    for timestamp in range(801, 851):
        rows.append(f"T01,STOCK_A,{timestamp},0,-0.01")
        rows.append(f"T02,STOCK_A,{timestamp},1,0.02")
    validation.write_text("\n".join(rows) + "\n", encoding="utf-8")
    monkeypatch.setattr(
        "app.services.submissions.get_settings",
        lambda: SimpleNamespace(master_validation_path=validation),
    )

    team_one = _validation_targets("T01", "STOCK_A", 801, 1)
    team_two = _validation_targets("T02", "STOCK_A", 801, 1)

    assert team_one == [0] * 50
    assert team_two == [1] * 50


def test_rate_limit_reports_remaining_seconds_inside_window() -> None:
    now = datetime.now(UTC)
    assert rate_limit_retry_after(now - timedelta(seconds=18), now) == 42


def test_rate_limit_allows_request_after_window() -> None:
    now = datetime.now(UTC)
    assert rate_limit_retry_after(now - timedelta(seconds=60), now) == 0


def test_missing_team_validation_window_is_controlled(
    tmp_path: Path, monkeypatch
) -> None:
    validation = tmp_path / "master_validation.csv"
    validation.write_text(
        "team_id,stock_id,master_timestamp,target_r1r2,target_r3\n"
        "T02,STOCK_A,801,1,0.02\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "app.services.submissions.get_settings",
        lambda: SimpleNamespace(master_validation_path=validation),
    )

    with pytest.raises(ValidationDataError, match="unavailable for this team window"):
        _validation_targets("T01", "STOCK_A", 801, 1)


def test_rate_limit_statements_are_safe_across_workers() -> None:
    team_id = __import__("uuid").uuid4()
    now = datetime.now(UTC)
    insert_sql = str(
        _rate_limit_insert_statement(team_id, now).compile(
            dialect=postgresql.dialect()
        )
    )
    lock_sql = str(
        _rate_limit_row_statement(team_id).compile(dialect=postgresql.dialect())
    )

    assert "ON CONFLICT" in insert_sql
    assert "DO NOTHING" in insert_sql
    assert "FOR UPDATE" in lock_sql
