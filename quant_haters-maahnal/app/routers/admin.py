import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin_id
from app.models import AdminAuditLog, EventState, Round, RoundPhase
from app.schemas.admin import (
    AdminStatus,
    FinalBacktestResult,
    FlashCrashRequest,
    FlashCrashResult,
    StartRoundRequest,
    TimerRequest,
)
from app.services.event_control import (
    DEFAULT_FLASH_CRASH_MESSAGE,
    apply_timer_action,
    build_admin_status,
    ensure_flash_crash_datasets_ready,
    start_round,
)
from app.services.final_backtest import run_final_backtest
from app.schemas.leaderboard import AdminLeaderboardEntry, SnapshotResult
from app.services.leaderboard import admin_leaderboard, publish_snapshot


router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_live_leaderboard(
    round_code: Literal["R1", "R2", "R3"] | None = Query(default=None, alias="round"),
    _admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> list[AdminLeaderboardEntry]:
    return admin_leaderboard(db, round_code)


def publish_leaderboard_snapshot(
    admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)
) -> SnapshotResult:
    return publish_snapshot(db, admin_id)


@router.get("/leaderboard", response_model=list[AdminLeaderboardEntry])
def admin_leaderboard_endpoint(
    entries: list[AdminLeaderboardEntry] = Depends(get_admin_live_leaderboard),
) -> list[AdminLeaderboardEntry]:
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
    state: EventState,
    round_one: Round,
    round_two: Round,
    *,
    now: datetime,
    message: str | None = None,
    duration_seconds: int | None = None,
) -> None:
    round_two_duration = (
        timedelta(seconds=duration_seconds) if duration_seconds else round_two.ends_at - round_two.starts_at
    )
    round_one.phase = RoundPhase.COMPLETED
    round_two.phase = RoundPhase.FLASH_CRASH
    round_two.paused_remaining_seconds = None
    round_two.starts_at = now
    round_two.ends_at = now + round_two_duration
    state.current_round_id = round_two.id
    state.flash_crash_active = True
    state.flash_crash_message = message or DEFAULT_FLASH_CRASH_MESSAGE
    state.flash_crash_triggered_at = now
    state.state_version += 1


def ensure_flash_crash_transition_allowed(state: EventState, round_one: Round) -> None:
    if state.flash_crash_active or state.current_round_id != round_one.id:
        raise HTTPException(status_code=409, detail="Flash Crash can only start once from Round 1.")


def trigger_flash_crash(
    payload: FlashCrashRequest | None = Body(default=None),
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> FlashCrashResult:
    if payload is not None and not payload.active:
        raise HTTPException(
            status_code=409,
            detail="The crash stays on for all of Round 2. Restart Round 1 to undo it.",
        )
    state = db.scalar(select(EventState).where(EventState.id == 1).with_for_update())
    round_one = db.scalar(select(Round).where(Round.round_code == "R1"))
    round_two = db.scalar(select(Round).where(Round.round_code == "R2"))
    if state is None or round_one is None or round_two is None:
        raise HTTPException(status_code=409, detail="Rounds R1 and R2 must be configured.")
    ensure_flash_crash_transition_allowed(state, round_one)
    now = datetime.now(UTC)
    ensure_flash_crash_datasets_ready(db, round_two, now)
    activate_flash_crash_rounds(
        state,
        round_one,
        round_two,
        now=now,
        message=payload.message if payload else None,
        duration_seconds=payload.duration_seconds if payload else None,
    )
    db.add(AdminAuditLog(admin_id=admin_id, action="TRIGGER_FLASH_CRASH", details={"from": "R1", "to": "R2"}))
    db.commit()
    return FlashCrashResult(current_round="R2", flash_crash_active=True, state_version=state.state_version)


@router.post("/flash-crash", response_model=FlashCrashResult)
def flash_crash(result: FlashCrashResult = Depends(trigger_flash_crash)) -> FlashCrashResult:
    return result


def get_admin_status(
    _admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)
) -> AdminStatus:
    return build_admin_status(db, datetime.now(UTC))


@router.get("/status", response_model=AdminStatus)
def admin_status(status: AdminStatus = Depends(get_admin_status)) -> AdminStatus:
    return status


def apply_timer(
    payload: TimerRequest,
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> AdminStatus:
    state = db.scalar(select(EventState).where(EventState.id == 1).with_for_update())
    if state is None or state.current_round_id is None:
        raise HTTPException(status_code=409, detail="No active round is configured.")
    round_ = db.scalar(select(Round).where(Round.id == state.current_round_id).with_for_update())
    if round_ is None:
        raise HTTPException(status_code=409, detail="No active round is configured.")
    now = datetime.now(UTC)
    apply_timer_action(state, round_, payload.action, payload.seconds, now)
    db.add(
        AdminAuditLog(
            admin_id=admin_id,
            action=f"TIMER_{payload.action.upper()}",
            details={"round": round_.round_code, "seconds": payload.seconds},
        )
    )
    db.commit()
    return build_admin_status(db, now)


@router.post("/timer", response_model=AdminStatus)
def admin_timer(status: AdminStatus = Depends(apply_timer)) -> AdminStatus:
    return status


def apply_start_round(
    payload: StartRoundRequest,
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> AdminStatus:
    state = db.scalar(select(EventState).where(EventState.id == 1).with_for_update())
    if state is None:
        raise HTTPException(status_code=404, detail="Event state is not configured.")
    rounds = {round_.round_code: round_ for round_ in db.scalars(select(Round).with_for_update()).all()}
    now = datetime.now(UTC)
    if payload.round == "R2" and "R2" in rounds:
        ensure_flash_crash_datasets_ready(db, rounds["R2"], now)
    start_round(state, rounds, payload.round, payload.duration_seconds, now)
    db.add(
        AdminAuditLog(
            admin_id=admin_id,
            action="START_ROUND",
            details={"round": payload.round, "duration_seconds": payload.duration_seconds},
        )
    )
    db.commit()
    return build_admin_status(db, now)


@router.post("/round", response_model=AdminStatus)
def admin_start_round(status: AdminStatus = Depends(apply_start_round)) -> AdminStatus:
    return status


def apply_reset_event(
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> AdminStatus:
    state = db.scalar(select(EventState).where(EventState.id == 1).with_for_update())
    if state is None:
        raise HTTPException(status_code=404, detail="Event state is not configured.")
    rounds = {round_.round_code: round_ for round_ in db.scalars(select(Round).with_for_update()).all()}
    now = datetime.now(UTC)
    
    for round_code, round_ in rounds.items():
        round_.phase = RoundPhase.SCHEDULED
        round_.paused_remaining_seconds = None
        round_.starts_at = now + timedelta(hours=1)
        round_.ends_at = now + timedelta(hours=2)
    
    from sqlalchemy import delete
    from app.models import PredictionRow, SignalRow, Score, Submission, SubmissionRateLimit, DownloadEvent, LeaderboardSnapshotEntry, LeaderboardSnapshot

    db.execute(delete(PredictionRow))
    db.execute(delete(SignalRow))
    db.execute(delete(Score))
    db.execute(delete(SubmissionRateLimit))
    db.execute(delete(Submission))
    db.execute(delete(DownloadEvent))
    db.execute(delete(LeaderboardSnapshotEntry))
    db.execute(delete(LeaderboardSnapshot))

    state.current_round_id = rounds.get("R1").id if "R1" in rounds else None
    state.flash_crash_active = False
    state.flash_crash_message = None
    state.flash_crash_triggered_at = None
    state.state_version += 1

    db.add(AdminAuditLog(admin_id=admin_id, action="RESET_EVENT", details={}))
    db.commit()
    return build_admin_status(db, now)


@router.post("/reset", response_model=AdminStatus)
def admin_reset_event(status: AdminStatus = Depends(apply_reset_event)) -> AdminStatus:
    return status
