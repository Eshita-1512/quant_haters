import csv
from pathlib import Path

from scripts.seed_demo import _write_master_validation


def test_seeded_validation_targets_cover_round_three_window(tmp_path: Path) -> None:
    target = tmp_path / "master_validation.csv"
    _write_master_validation(target, [("T01", "STOCK_A")])

    with target.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    assert rows[0]["team_id"] == "T01"
    assert rows[0]["stock_id"] == "STOCK_A"
    assert max(int(row["master_timestamp"]) for row in rows) >= 2550
