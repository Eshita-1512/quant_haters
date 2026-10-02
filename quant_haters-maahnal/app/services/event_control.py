from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import DatasetRelease, EventState, Round, RoundPhase, Submission, Team, TeamAssignment
from app.schemas.admin import AdminRoundInfo, AdminStatus


ROUND_ORDER = ("R1", "R2", "R3")
OPEN_PHASES = {RoundPhase.LIVE, RoundPhase.FLASH_CRASH}
DEFAULT_FLASH_CRASH_MESSAGE = "Market disruption detected. Download the new dataset."


def round_phase(round_) -> RoundPhase:
    return RoundPhase(round_.phase)


def round_remaining_seconds(round_, now: datetime) -> int:
    phase = round_phase(round_)
    if phase == RoundPhase.PAUSED:
        return max(0, round_.paused_remaining_seconds or 0)
    if phase in OPEN_PHASES:
        return max(0, int((round_.ends_at - now).total_seconds()))
    return 0


def effective_round_phase(round_, now: datetime) -> RoundPhase:
    """An open round whose clock has run out is reported as completed."""
    phase = round_phase(round_)
    if phase in OPEN_PHASES and round_.ends_at <= now:
        return RoundPhase.COMPLETED
    return phase


def display_ends_at(round_, now: datetime) -> datetime:
    if round_phase(round_) == RoundPhase.PAUSED:
        return now + timedelta(seconds=round_remaining_seconds(round_, now))
    return round_.ends_at


def open_phase(state) -> RoundPhase:
    return RoundPhase.FLASH_CRASH if state.flash_crash_active else RoundPhase.LIVE


def _run_for(state, round_, seconds: int, now: datetime) -> None:
    round_.paused_remaining_seconds = None
    round_.starts_at = min(round_.starts_at, now)
    round_.ends_at = now + timedelta(seconds=seconds)
    round_.phase = open_phase(state) if seconds > 0 else RoundPhase.COMPLETED


def apply_timer_action(state, round_, action: str, seconds: int | None, now: datetime) -> None:
    phase = effective_round_phase(round_, now)
    if action in {"extend", "set"} and seconds is None:
        raise HTTPException(status_code=400, detail=f"seconds is required for the {action} action.")
    if action != "end" and phase == RoundPhase.SCHEDULED:
        raise HTTPException(status_code=409, detail="Start the round before changing its timer.")

    if action == "pause":
        if phase not in OPEN_PHASES:
            raise HTTPException(status_code=409, detail="Only a running round can be paused.")
        round_.paused_remaining_seconds = round_remaining_seconds(round_, now)
        round_.phase = RoundPhase.PAUSED
    elif action == "resume":
        if phase != RoundPhase.PAUSED:
            raise HTTPException(status_code=409, detail="The round timer is not paused.")
        _run_for(state, round_, round_remaining_seconds(round_, now), now)
    elif action in {"extend", "set"}:
        base = round_remaining_seconds(round_, now) if action == "extend" else 0
        target = max(0, base + seconds)
        if phase == RoundPhase.PAUSED:
            round_.paused_remaining_seconds = target
        else:
            _run_for(state, round_, target, now)
    elif action == "end":
        round_.paused_remaining_seconds = None
        round_.starts_at = min(round_.starts_at, now)
        round_.ends_at = now
        round_.phase = RoundPhase.COMPLETED
    else:
        raise HTTPException(status_code=400, detail=f"Unknown timer action {action}.")
    state.state_version += 1


def start_round(state, rounds: dict[str, object], code: str, duration_seconds: int, now: datetime) -> None:
    """Make `code` the current round. Starting R2 always starts the Flash Crash."""
    target = rounds.get(code)
    if target is None:
        raise HTTPException(status_code=409, detail=f"Round {code} is not configured.")
    target_index = ROUND_ORDER.index(code)
    for other_code, other in rounds.items():
        if other is target or other_code not in ROUND_ORDER:
            continue
        other.paused_remaining_seconds = None
        other.phase = RoundPhase.COMPLETED if ROUND_ORDER.index(other_code) < target_index else RoundPhase.SCHEDULED

    if code == "R2":
        if not state.flash_crash_active:
            state.flash_crash_active = True
            state.flash_crash_message = DEFAULT_FLASH_CRASH_MESSAGE
            state.flash_crash_triggered_at = now
    else:
        state.flash_crash_active = False
        state.flash_crash_message = None
        state.flash_crash_triggered_at = None

    target.paused_remaining_seconds = None
    target.starts_at = now
    target.ends_at = now + timedelta(seconds=duration_seconds)
    target.phase = open_phase(state)
    state.current_round_id = target.id
    state.state_version += 1


def ensure_flash_crash_datasets_ready(db: Session, round_two: Round, now: datetime) -> None:
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


def _round_info(round_, now: datetime) -> AdminRoundInfo:
    return AdminRoundInfo(
        code=round_.round_code,
        name=round_.round_name,
        submission_type=round_.submission_type,
        phase=effective_round_phase(round_, now).value,
        duration_seconds=max(0, int((round_.ends_at - round_.starts_at).total_seconds())),
        ends_at=display_ends_at(round_, now),
    )


def build_admin_status(db: Session, now: datetime) -> AdminStatus:
    state = db.scalar(select(EventState).where(EventState.id == 1))
    if state is None:
        raise HTTPException(status_code=404, detail="Event state is not configured.")
    rounds = list(db.scalars(select(Round).order_by(Round.round_code)).all())
    current = next((round_ for round_ in rounds if round_.id == state.current_round_id), None)
    submissions = 0
    if current is not None:
        submissions = db.scalar(select(func.count(Submission.id)).where(Submission.round_id == current.id)) or 0
    teams_total = db.scalar(select(func.count(Team.id)).where(Team.is_active.is_(True))) or 0
    return AdminStatus(
        current_round=current.round_code if current else None,
        flash_crash_active=state.flash_crash_active,
        state_version=state.state_version,
        submissions_count=submissions,
        time_remaining_seconds=round_remaining_seconds(current, now) if current else 0,
        server_time=now,
        round_name=current.round_name if current else None,
        round_phase=effective_round_phase(current, now).value if current else None,
        round_ends_at=display_ends_at(current, now) if current else None,
        flash_crash_message=state.flash_crash_message,
        flash_crash_triggered_at=state.flash_crash_triggered_at,
        rounds=[_round_info(round_, now) for round_ in rounds],
        teams_total=teams_total,
    )
