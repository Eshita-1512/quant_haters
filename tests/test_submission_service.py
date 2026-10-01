from pathlib import Path
from types import SimpleNamespace

from app.services.submissions import _validation_targets


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
