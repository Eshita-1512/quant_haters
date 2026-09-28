import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_team_id
from app.models import EventState, Score, Team
from app.schemas.leaderboard import LeaderboardEntry


router = APIRouter(tags=["leaderboard"])


def get_leaderboard(
    _team_id: uuid.UUID = Depends(get_current_team_id), db: Session = Depends(get_db)
) -> list[LeaderboardEntry]:
    current_round_id = db.scalar(select(EventState.current_round_id).where(EventState.id == 1))
    if current_round_id is None:
        return []
    statement = (
        select(Team.team_name, func.max(Score.score).label("best_score"))
        .join(Score, Score.team_id == Team.id)
        .where(
            Score.round_id == current_round_id,
            Score.is_valid.is_(True),
            Team.is_active.is_(True),
        )
        .group_by(Team.id, Team.team_name)
        .order_by(func.max(Score.score).desc(), Team.team_name.asc())
    )
    return [LeaderboardEntry(team=name, score=score) for name, score in db.execute(statement).all()]


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(entries: list[LeaderboardEntry] = Depends(get_leaderboard)) -> list[LeaderboardEntry]:
    return entries

