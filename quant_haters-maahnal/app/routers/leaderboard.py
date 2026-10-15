from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.leaderboard import (
    CumulativeLeaderboardEntry,
    LeaderboardEntry,
    PublicFinalResults,
)
from app.services.leaderboard import (
    cumulative_leaderboard,
    public_final_results,
    public_leaderboard,
)


router = APIRouter(tags=["leaderboard"])


def get_public_leaderboard(db: Session = Depends(get_db)) -> list[LeaderboardEntry]:
    return public_leaderboard(db)


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(entries: list[LeaderboardEntry] = Depends(get_public_leaderboard)) -> list[LeaderboardEntry]:
    return entries


@router.get("/leaderboard/cumulative", response_model=list[CumulativeLeaderboardEntry])
def get_cumulative_leaderboard(db: Session = Depends(get_db)) -> list[CumulativeLeaderboardEntry]:
    return cumulative_leaderboard(db)


@router.get("/leaderboard/final-results", response_model=PublicFinalResults)
def get_final_results(db: Session = Depends(get_db)) -> PublicFinalResults:
    return public_final_results(db)
