from fastapi import APIRouter, Depends

from app.dependencies import get_current_team_profile
from app.schemas.team import TeamProfile


router = APIRouter(prefix="/team", tags=["team"])


@router.get("/me", response_model=TeamProfile)
def team_me(profile: TeamProfile = Depends(get_current_team_profile)) -> TeamProfile:
    return profile

