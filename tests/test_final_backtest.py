from pathlib import Path
from decimal import Decimal

from fastapi.testclient import TestClient

from app.dependencies import get_current_admin_id
from app.main import create_app
from app.routers.admin import get_final_backtest
from app.schemas.admin import FinalBacktestEntry, FinalBacktestResult
from app.services.final_backtest import load_hidden_targets


def test_hidden_targets_are_filtered_by_team_and_stock(tmp_path: Path) -> None:
    path = tmp_path / "hidden.csv"
    rows = ["team_id,stock_id,master_timestamp,target_r3"]
    for timestamp in range(801, 851):
        rows.append(f"T01,STOCK_A,{timestamp},-0.01")
        rows.append(f"T02,STOCK_A,{timestamp},0.02")
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")

    assert load_hidden_targets(path, "T01", "STOCK_A", 801) == [
        Decimal("-0.01")
    ] * 50
    assert load_hidden_targets(path, "T02", "STOCK_A", 801) == [
        Decimal("0.02")
    ] * 50


def test_final_backtest_requires_admin_token() -> None:
    response = TestClient(create_app()).post("/api/v1/admin/final-backtest")
    assert response.status_code == 401


def test_final_backtest_returns_ranked_winners() -> None:
    app = create_app()
    app.dependency_overrides[get_current_admin_id] = lambda: "admin-id"
    app.dependency_overrides[get_final_backtest] = lambda: FinalBacktestResult(
        round="R3",
        rankings=[
            FinalBacktestEntry(rank=1, team="Team A", score=2.14),
            FinalBacktestEntry(rank=2, team="Team B", score=1.72),
        ],
    )

    response = TestClient(app).post(
        "/api/v1/admin/final-backtest",
        headers={"Authorization": "Bearer admin"},
    )

    assert response.status_code == 200
    assert response.json()["round"] == "R3"
    assert response.json()["rankings"][0] == {
        "rank": 1,
        "team": "Team A",
        "score": 2.14,
    }
