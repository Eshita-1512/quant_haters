import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_team_id, get_current_team_profile
from app.models import DatasetRelease, DownloadEvent, EventState, TeamAssignment
from app.schemas.team import DatasetDownload, TeamProfile
from app.services.datasets import create_download_signature


router = APIRouter(prefix="/team", tags=["team"])


@router.get("/me", response_model=TeamProfile)
def team_me(profile: TeamProfile = Depends(get_current_team_profile)) -> TeamProfile:
    return profile


def get_download_response(
    team_id: uuid.UUID = Depends(get_current_team_id), db: Session = Depends(get_db)
) -> DatasetDownload:
    now = time.time()
    state = db.scalar(select(EventState).where(EventState.id == 1))
    if state is None or state.current_round_id is None:
        raise HTTPException(status_code=404, detail="No active round.")
    release_type = "flash_crash" if state.flash_crash_active else "standard"
    statement = (
        select(DatasetRelease)
        .join(TeamAssignment, TeamAssignment.id == DatasetRelease.assignment_id)
        .where(
            TeamAssignment.team_id == team_id,
            DatasetRelease.round_id == state.current_round_id,
            DatasetRelease.release_type == release_type,
            DatasetRelease.is_active.is_(True),
            DatasetRelease.available_from <= datetime.now(UTC),
            or_(DatasetRelease.available_until.is_(None), DatasetRelease.available_until > datetime.now(UTC)),
        )
        .order_by(DatasetRelease.version.desc())
        .limit(1)
    )
    release = db.scalar(statement)
    if release is None:
        raise HTTPException(status_code=404, detail="Dataset is not available.")
    db.add(DownloadEvent(team_id=team_id, dataset_release_id=release.id))
    db.commit()
    expires = int(now) + 120
    signature = create_download_signature(release.id, expires)
    url = f"/api/v1/team/data/file?release_id={release.id}&expires={expires}&signature={signature}"
    return DatasetDownload(filename=release.display_filename, download_url=url, expires_in_seconds=120)


@router.get("/data", response_model=DatasetDownload)
def team_data(download: DatasetDownload = Depends(get_download_response)) -> DatasetDownload:
    return download
