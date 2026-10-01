import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin_id
from app.models import AdminAuditLog, DatasetRelease, EventState, Round, RoundPhase, Submission, Team, TeamAssignment
from app.schemas.admin import AdminStatus, FinalBacktestResult, FlashCrashResult
from app.services.final_backtest import run_final_backtest
from app.schemas.leaderboard import LeaderboardEntry, SnapshotResult
from app.services.leaderboard import live_leaderboard, publish_snapshot


router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_live_leaderboard(
    _admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)
) -> list[LeaderboardEntry]:
    return live_leaderboard(db)


def publish_leaderboard_snapshot(
    admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)
) -> SnapshotResult:
    return publish_snapshot(db, admin_id)


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def admin_leaderboard(
    entries: list[LeaderboardEntry] = Depends(get_admin_live_leaderboard),
) -> list[LeaderboardEntry]:
    return entries


@router.post("/leaderboard/snapshot", response_model=SnapshotResult)
def admin_leaderboard_snapshot(
    result: SnapshotResult = Depends(publish_leaderboard_snapshot),
) -> SnapshotResult:
    return result


def get_final_backtest(
    admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)
) -> FinalBacktestResult:
    return run_final_backtest(db, admin_id)


@router.post("/final-backtest", response_model=FinalBacktestResult)
def final_backtest(
    result: FinalBacktestResult = Depends(get_final_backtest),
) -> FinalBacktestResult:
    return result


def activate_flash_crash_rounds(
    state: EventState, round_one: Round, round_two: Round, *, now: datetime
) -> None:
    round_two_duration = round_two.ends_at - round_two.starts_at
    round_one.phase = RoundPhase.COMPLETED
    round_two.phase = RoundPhase.FLASH_CRASH
    round_two.starts_at = now
    round_two.ends_at = now + round_two_duration
    state.current_round_id = round_two.id
    state.flash_crash_active = True
    state.flash_crash_message = "Market disruption detected. Download the new dataset."
    state.state_version += 1


def ensure_flash_crash_transition_allowed(state: EventState, round_one: Round) -> None:
    if state.flash_crash_active or state.current_round_id != round_one.id:
        raise HTTPException(status_code=409, detail="Flash Crash can only start once from Round 1.")


def trigger_flash_crash(admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)) -> FlashCrashResult:
    state = db.scalar(select(EventState).where(EventState.id == 1).with_for_update())
    round_one = db.scalar(select(Round).where(Round.round_code == "R1"))
    round_two = db.scalar(select(Round).where(Round.round_code == "R2"))
    if state is None or round_one is None or round_two is None:
        raise HTTPException(status_code=409, detail="Rounds R1 and R2 must be configured.")
    ensure_flash_crash_transition_allowed(state, round_one)
    now = datetime.now(UTC)
    active_assignment_ids = set(
        db.scalars(
            select(TeamAssignment.id)
            .join(Team, Team.id == TeamAssignment.team_id)
            .where(TeamAssignment.round_id == round_two.id, Team.is_active.is_(True))
        ).all()
    )
    ready_assignment_ids = set(
        db.scalars(
            select(DatasetRelease.assignment_id)
            .join(
                TeamAssignment,
                (TeamAssignment.id == DatasetRelease.assignment_id)
                & (TeamAssignment.round_id == DatasetRelease.round_id),
            )
            .join(Team, Team.id == TeamAssignment.team_id)
            .where(
                DatasetRelease.round_id == round_two.id,
                DatasetRelease.release_type == "flash_crash",
                DatasetRelease.is_active.is_(True),
                DatasetRelease.available_from <= now,
                or_(DatasetRelease.available_until.is_(None), DatasetRelease.available_until > now),
                Team.is_active.is_(True),
            )
        ).all()
    )
    if not active_assignment_ids or ready_assignment_ids != active_assignment_ids:
        raise HTTPException(status_code=409, detail="Flash Crash datasets are incomplete.")
    activate_flash_crash_rounds(state, round_one, round_two, now=now)
    db.add(AdminAuditLog(admin_id=admin_id, action="TRIGGER_FLASH_CRASH", details={"from": "R1", "to": "R2"}))
    db.commit()
    return FlashCrashResult(current_round="R2", flash_crash_active=True, state_version=state.state_version)


@router.post("/flash-crash", response_model=FlashCrashResult)
def flash_crash(result: FlashCrashResult = Depends(trigger_flash_crash)) -> FlashCrashResult:
    return result


@router.get("/status", response_model=AdminStatus)
def admin_status(_admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)) -> AdminStatus:
    state = db.scalar(select(EventState).where(EventState.id == 1))
    if state is None:
        raise HTTPException(status_code=404, detail="Event state is not configured.")
    round_ = db.scalar(select(Round).where(Round.id == state.current_round_id)) if state.current_round_id else None
    submissions = db.scalar(select(func.count(Submission.id)).where(Submission.round_id == state.current_round_id)) or 0
    remaining = max(0, int((round_.ends_at - datetime.now(UTC)).total_seconds())) if round_ else 0
    return AdminStatus(current_round=round_.round_code if round_ else None, flash_crash_active=state.flash_crash_active, state_version=state.state_version, submissions_count=submissions, time_remaining_seconds=remaining)
