"""Seed a new development database with the complete challenge structure."""

import csv
import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    AdminUser,
    DatasetRelease,
    EventState,
    Round,
    RoundPhase,
    Stock,
    Team,
    TeamAssignment,
)
from app.security import hash_password


TEAM_PASSWORD = "team-demo-password"
ADMIN_PASSWORD = "admin-demo-password"


def _write_dataset(path: Path, stock_code: str, round_number: int, crash: bool) -> tuple[str, int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = ["timestamp,stock_id,price,volume"]
    for timestamp in range(1, 851):
        shock = -25 if crash and timestamp > 800 else 0
        rows.append(f"{timestamp},{stock_code},{100 + timestamp / 100 + shock:.2f},{1000 + timestamp}")
    content = ("\n".join(rows) + "\n").encode()
    path.write_bytes(content)
    return hashlib.sha256(content).hexdigest(), len(content), 850


def _write_master_validation(path: Path, assignments: list[tuple[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["team_id", "stock_id", "master_timestamp", "target_r1r2", "target_r3"])
        for assignment_index, (team_code, stock_code) in enumerate(assignments):
            for timestamp in range(1, 3001):
                direction = 1 if (timestamp + assignment_index) % 2 else 0
                market_return = "0.0100" if direction else "-0.0080"
                writer.writerow([team_code, stock_code, timestamp, direction, market_return])


def seed() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        if db.scalar(select(func.count(Team.id))):
            raise SystemExit("Seed refused: teams already exist. Use a clean development database.")

        now = datetime.now(UTC)
        stocks = [
            Stock(stock_code=f"STOCK_{letter}", display_name=f"Stock {letter}")
            for letter in "ABCDE"
        ]
        rounds = [
            Round(id=1, round_code="R1", round_name="Round 1", submission_type="prediction", phase=RoundPhase.LIVE, starts_at=now - timedelta(minutes=5), ends_at=now + timedelta(hours=1)),
            Round(id=2, round_code="R2", round_name="Flash Crash", submission_type="prediction", phase=RoundPhase.SCHEDULED, starts_at=now + timedelta(hours=1), ends_at=now + timedelta(hours=2)),
            Round(id=3, round_code="R3", round_name="Trading Signals", submission_type="signal", phase=RoundPhase.SCHEDULED, starts_at=now + timedelta(hours=2), ends_at=now + timedelta(hours=3)),
        ]
        db.add_all(stocks + rounds)
        db.flush()

        teams = [
            Team(team_code=f"T{number:02d}", team_name=f"Team {number:02d}", password_hash=hash_password(TEAM_PASSWORD))
            for number in range(1, 41)
        ]
        db.add_all(teams)
        db.flush()

        for team_index, team in enumerate(teams):
            stock = stocks[team_index % len(stocks)]
            for round_ in rounds:
                offset = (round_.id - 1) * 850
                assignment = TeamAssignment(
                    team_id=team.id,
                    round_id=round_.id,
                    stock_id=stock.id,
                    train_start=offset + 1,
                    train_end=offset + 800,
                    predict_start=offset + 801,
                    predict_end=offset + 850,
                )
                db.add(assignment)
                db.flush()
                release_types = ["standard", "flash_crash"] if round_.id == 2 else ["standard"]
                for release_type in release_types:
                    storage_key = f"datasets/{team.team_code}/round-{round_.id}-{release_type}.csv"
                    sha256, size, row_count = _write_dataset(
                        settings.private_data_dir / storage_key,
                        stock.stock_code,
                        round_.id,
                        release_type == "flash_crash",
                    )
                    db.add(
                        DatasetRelease(
                            assignment_id=assignment.id,
                            round_id=round_.id,
                            release_type=release_type,
                            display_filename=f"{stock.stock_code}_{team.team_code}_round{round_.id}.csv",
                            storage_key=storage_key,
                            sha256=sha256,
                            file_size_bytes=size,
                            row_count=row_count,
                            available_from=now - timedelta(minutes=5),
                        )
                    )

        db.add(AdminUser(username="admin", password_hash=hash_password(ADMIN_PASSWORD)))
        db.add(EventState(id=1, current_round_id=1, flash_crash_active=False, state_version=1))
        _write_master_validation(
            settings.master_validation_path,
            [
                (team.team_code, stocks[index % len(stocks)].stock_code)
                for index, team in enumerate(teams)
            ],
        )
        db.commit()

    print("Seeded 40 teams, 5 stocks, 3 rounds, datasets, validation targets, and admin.")
    print(f"Demo team login: T01 / {TEAM_PASSWORD}")
    print(f"Demo admin login: admin / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    seed()
