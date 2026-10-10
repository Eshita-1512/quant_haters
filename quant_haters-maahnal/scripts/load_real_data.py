import csv
import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
import shutil

from sqlalchemy import func, select

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    AdminUser,
    AdminAuthSession,
    AuthSession,
    DatasetRelease,
    DownloadEvent,
    EventState,
    LeaderboardSnapshot,
    LeaderboardSnapshotEntry,
    PredictionRow,
    Round,
    RoundPhase,
    Score,
    SignalRow,
    Stock,
    Submission,
    SubmissionRateLimit,
    Team,
    TeamAssignment,
    AdminAuditLog,
)
from app.security import hash_password

import os

_parents = Path(__file__).resolve().parents
WORKSPACE_ROOT = _parents[3] if len(_parents) > 3 else Path("/quant")
default_team_files = WORKSPACE_ROOT / "team_files" if (WORKSPACE_ROOT / "team_files").exists() else Path("/quant/team_files")
default_generated = WORKSPACE_ROOT / "generated_test" / "round2" if (WORKSPACE_ROOT / "generated_test" / "round2").exists() else Path("/quant/generated_test/round2")
default_passwords = WORKSPACE_ROOT / "generated_test" / "passwords.csv" if (WORKSPACE_ROOT / "generated_test").exists() else Path("/quant/generated_test/passwords.csv")

TEAM_FILES_DIR = Path(os.environ.get("TEAM_FILES_DIR", str(default_team_files)))
GENERATED_DIR = Path(os.environ.get("GENERATED_DIR", str(default_generated)))
PASSWORDS_FILE = Path(os.environ.get("PASSWORDS_FILE", str(default_passwords)))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin-demo-password")

def _hash_and_copy(src_path: Path, dest_path: Path) -> tuple[str, int, int]:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    content = src_path.read_bytes()
    dest_path.write_bytes(content)
    row_count = len(content.splitlines()) - 1
    return hashlib.sha256(content).hexdigest(), len(content), row_count

def _normalize_stock(stock: str) -> str:
    return stock.replace("%20", "_").replace(" (1)", "").replace(" ", "_")

def load() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        db.query(EventState).delete()
        db.query(LeaderboardSnapshotEntry).delete()
        db.query(LeaderboardSnapshot).delete()
        db.query(AdminAuditLog).delete()
        db.query(AdminAuthSession).delete()
        db.query(AuthSession).delete()
        db.query(PredictionRow).delete()
        db.query(SignalRow).delete()
        db.query(Score).delete()
        db.query(SubmissionRateLimit).delete()
        db.query(Submission).delete()
        db.query(DownloadEvent).delete()
        db.query(DatasetRelease).delete()
        db.query(TeamAssignment).delete()
        db.query(Team).delete()
        db.query(Stock).delete()
        db.query(Round).delete()
        db.query(AdminUser).delete()
        db.commit()
        
        now = datetime.now(UTC)
        rounds = [
            Round(id=1, round_code="R1", round_name="Round 1: Foundation", submission_type="prediction", phase=RoundPhase.SCHEDULED, starts_at=now + timedelta(hours=1), ends_at=now + timedelta(hours=2)),
            Round(id=2, round_code="R2", round_name="Round 2: Signal Hunt", submission_type="prediction", phase=RoundPhase.SCHEDULED, starts_at=now + timedelta(hours=1), ends_at=now + timedelta(hours=2)),
            Round(id=3, round_code="R3", round_name="Round 3: Alpha", submission_type="signal", phase=RoundPhase.SCHEDULED, starts_at=now + timedelta(hours=2), ends_at=now + timedelta(hours=3)),
        ]
        db.add_all(rounds)
        db.flush()

        stocks_map = {}
        teams_map = {}
        passwords = []

        for stock_dir in TEAM_FILES_DIR.iterdir():
            if not stock_dir.is_dir():
                continue
            stock_code_raw = stock_dir.name
            stock_code = _normalize_stock(stock_code_raw)
            if stock_code not in stocks_map:
                stock = Stock(stock_code=stock_code, display_name=stock_code)
                db.add(stock)
                db.flush()
                stocks_map[stock_code] = stock
            
            stock = stocks_map[stock_code]
            
            for file in stock_dir.iterdir():
                if file.is_file() and "_round1.csv" in file.name:
                    team_code = file.name.split("_")[-2] if "_" in file.name else file.name.split("round1")[0].strip("_")
                    if team_code not in teams_map:
                        team_pw = f"pw_{team_code}_{hashlib.md5(team_code.encode()).hexdigest()[:6]}"
                        team = Team(team_code=team_code, team_name=f"Team {team_code}", password_hash=hash_password(team_pw))
                        db.add(team)
                        db.flush()
                        teams_map[team_code] = team
                        passwords.append((team_code, team_pw))
                    
                    team = teams_map[team_code]
                    
                    # Round 1
                    r1_assign = TeamAssignment(
                        team_id=team.id, round_id=1, stock_id=stock.id,
                        train_start=1, train_end=800, predict_start=801, predict_end=850
                    )
                    db.add(r1_assign)
                    db.flush()
                    r1_key = f"datasets/{team.team_code}/round-1-standard.csv"
                    sha256, size, rows = _hash_and_copy(file, settings.private_data_dir / r1_key)
                    db.add(DatasetRelease(
                        assignment_id=r1_assign.id, round_id=1, release_type="standard",
                        display_filename=f"{stock.stock_code}_{team.team_code}_round1.csv",
                        storage_key=r1_key, sha256=sha256, file_size_bytes=size, row_count=rows,
                        available_from=now - timedelta(minutes=5)
                    ))

                    # Round 2 / 3 file
                    r2_file = GENERATED_DIR / stock_code / f"{stock_code}_{team_code}_round2.csv"
                    if r2_file.exists():
                        # Round 2
                        r2_assign = TeamAssignment(
                            team_id=team.id, round_id=2, stock_id=stock.id,
                            train_start=1, train_end=850, predict_start=851, predict_end=900
                        )
                        db.add(r2_assign)
                        db.flush()
                        r2_key = f"datasets/{team.team_code}/round-2-flash_crash.csv"
                        sha256, size, rows = _hash_and_copy(r2_file, settings.private_data_dir / r2_key)
                        db.add(DatasetRelease(
                            assignment_id=r2_assign.id, round_id=2, release_type="flash_crash",
                            display_filename=f"{stock.stock_code}_{team.team_code}_round2.csv",
                            storage_key=r2_key, sha256=sha256, file_size_bytes=size, row_count=rows,
                            available_from=now - timedelta(minutes=5)
                        ))

                        # Round 3
                        r3_assign = TeamAssignment(
                            team_id=team.id, round_id=3, stock_id=stock.id,
                            train_start=1, train_end=850, predict_start=851, predict_end=900
                        )
                        db.add(r3_assign)
                        db.flush()
                        r3_key = f"datasets/{team.team_code}/round-3-standard.csv"
                        sha256, size, rows = _hash_and_copy(r2_file, settings.private_data_dir / r3_key)
                        db.add(DatasetRelease(
                            assignment_id=r3_assign.id, round_id=3, release_type="standard",
                            display_filename=f"{stock.stock_code}_{team.team_code}_round3.csv",
                            storage_key=r3_key, sha256=sha256, file_size_bytes=size, row_count=rows,
                            available_from=now - timedelta(minutes=5)
                        ))

        db.add(AdminUser(username="admin", password_hash=hash_password(ADMIN_PASSWORD)))
        db.add(EventState(id=1, current_round_id=1, flash_crash_active=False, state_version=1))
        
        db.commit()

        # Copy master_validation
        default_master = WORKSPACE_ROOT / "generated_test" / "private_data" / "master_validation.csv" if (WORKSPACE_ROOT / "generated_test" / "private_data" / "master_validation.csv").exists() else Path("/quant/generated_test/private_data/master_validation.csv")
        master_src = Path(os.environ.get("MASTER_VAL_SRC", str(default_master)))
        if master_src.exists():
            settings.master_validation_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(master_src, settings.master_validation_path)
            shutil.copy2(master_src, settings.hidden_validation_path)

        # write passwords safely
        pw_backup = settings.private_data_dir / "passwords.csv"
        try:
            pw_backup.parent.mkdir(parents=True, exist_ok=True)
            with pw_backup.open("w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["team_code", "password"])
                for code, pw in passwords:
                    writer.writerow([code, pw])
            print(f"[SUCCESS] Team credentials saved to {pw_backup}")
        except Exception as e:
            print(f"[WARN] Could not write to {pw_backup}: {e}")

        try:
            PASSWORDS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with PASSWORDS_FILE.open("w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["team_code", "password"])
                for code, pw in passwords:
                    writer.writerow([code, pw])
            print(f"[SUCCESS] Team credentials also written to {PASSWORDS_FILE}")
        except OSError:
            pass

        print(f"\n==========================================")
        print(f"DATABASE INITIALIZATION COMPLETE")
        print(f"Total Teams:  {len(teams_map)}")
        print(f"Total Stocks: {len(stocks_map)}")
        print(f"Admin User:   admin")
        print(f"Admin Pass:   {ADMIN_PASSWORD}")
        print(f"==========================================\n")

if __name__ == "__main__":
    load()
