import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin_id
from app.models import AdminAuditLog, DatasetRelease, EventState, Round, RoundPhase, Submission, TeamAssignment
from app.schemas.admin import AdminStatus, FlashCrashResult


router = APIRouter(prefix="/admin", tags=["admin"])


def trigger_flash_crash(admin_id: uuid.UUID = Depends(get_current_admin_id), db: Session = Depends(get_db)) -> FlashCrashResult:
    state = db.scalar(select(EventState).where(EventState.id == 1).with_for_update())
    round_one = db.scalar(select(Round).where(Round.round_code == "R1"))
    round_two = db.scalar(select(Round).where(Round.round_code == "R2"))
    if state is None or round_one is None or round_two is None:
        raise HTTPException(status_code=409, detail="Rounds R1 and R2 must be configured.")
    assignment_count = db.scalar(select(func.count(TeamAssignment.id)).where(TeamAssignment.round_id == round_two.id)) or 0
    release_count = db.scalar(
        select(func.count(distinct(DatasetRelease.assignment_id))).where(
            DatasetRelease.round_id == round_two.id,
            DatasetRelease.release_type == "flash_crash",
            DatasetRelease.is_active.is_(True),
        )
    ) or 0
    if assignment_count == 0 or release_count != assignment_count:
        raise HTTPException(status_code=409, detail="Flash Crash datasets are incomplete.")
    round_one.phase = RoundPhase.COMPLETED
    round_two.phase = RoundPhase.FLASH_CRASH
    state.current_round_id = round_two.id
    state.flash_crash_active = True
    state.flash_crash_message = "Market disruption detected. Download the new dataset."
    state.state_version += 1
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
