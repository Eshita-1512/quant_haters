import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_team_id
from app.models import EventState, Round, Stock, TeamAssignment
from app.schemas.event import EventStatus, StatusStock
from app.services.event_control import display_ends_at, effective_round_phase, round_remaining_seconds


router = APIRouter(prefix="/event", tags=["event"])


def get_status(
    team_id: uuid.UUID = Depends(get_current_team_id), db: Session = Depends(get_db)
) -> EventStatus:
    statement = (
        select(EventState, Round, TeamAssignment, Stock)
        .join(Round, Round.id == EventState.current_round_id)
        .join(TeamAssignment, (TeamAssignment.round_id == Round.id) & (TeamAssignment.team_id == team_id))
        .join(Stock, Stock.id == TeamAssignment.stock_id)
        .where(EventState.id == 1)
    )
    row = db.execute(statement).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No active event assignment found.")
    state, round_, _assignment, stock = row
    now = datetime.now(UTC)
    return EventStatus(
        state_version=state.state_version,
        server_time=now,
        current_round=round_.round_code,
        round_name=round_.round_name,
        round_phase=effective_round_phase(round_, now).value,
        round_ends_at=display_ends_at(round_, now),
        time_remaining_seconds=round_remaining_seconds(round_, now),
        flash_crash_active=state.flash_crash_active,
        flash_crash_message=state.flash_crash_message,
        assigned_stock=StatusStock(code=stock.stock_code, name=stock.display_name),
        download_available=True,
        submission_type=round_.submission_type,
    )


@router.get("/status", response_model=EventStatus)
def event_status(status: EventStatus = Depends(get_status)) -> EventStatus:
    return status
