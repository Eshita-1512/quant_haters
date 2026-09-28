import csv
from pathlib import Path

from scripts.seed_demo import _write_master_validation


def test_seeded_validation_targets_cover_round_three_window(tmp_path: Path) -> None:
    target = tmp_path / "master_validation.csv"
    _write_master_validation(target, ["STOCK_A"])

    with target.open(newline="", encoding="utf-8") as handle:
        timestamps = [int(row["master_timestamp"]) for row in csv.DictReader(handle)]

    assert max(timestamps) >= 2550
