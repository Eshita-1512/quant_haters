import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_team_id, get_current_team_profile
from app.models import DatasetRelease, DownloadEvent, EventState, LeaderboardSnapshotEntry, Team, TeamAssignment, TeamNotice
from app.schemas.team import DatasetDownload, NoticeAck, TeamProfile, UpdateTeamNameRequest
from app.config import get_settings
from app.services.datasets import (
    UnsafeStorageKeyError,
    create_download_signature,
    resolve_storage_path,
    verify_download_signature,
)


router = APIRouter(prefix="/team", tags=["team"])


@dataclass(frozen=True)
class DownloadFile:
    path: Path
    filename: str


@router.get("/me", response_model=TeamProfile)
def team_me(profile: TeamProfile = Depends(get_current_team_profile)) -> TeamProfile:
    return profile


@router.patch("/name", response_model=TeamProfile)
def update_team_name(
    payload: UpdateTeamNameRequest,
    team_id: uuid.UUID = Depends(get_current_team_id),
    db: Session = Depends(get_db),
) -> TeamProfile:
    clean_name = payload.team_name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Team name cannot be empty.")
    if len(clean_name) > 50:
        raise HTTPException(status_code=400, detail="Team name must be 50 characters or less.")

    team = db.scalar(select(Team).where(Team.id == team_id))
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found.")

    team.team_name = clean_name
    db.execute(
        update(LeaderboardSnapshotEntry)
        .where(LeaderboardSnapshotEntry.team_id == team_id)
        .values(team_name=clean_name)
    )
    db.commit()

    return get_current_team_profile(team_id=team_id, db=db)


@router.post("/notices/{notice_id}/ack", response_model=NoticeAck)
def acknowledge_notice(
    notice_id: uuid.UUID,
    team_id: uuid.UUID = Depends(get_current_team_id),
    db: Session = Depends(get_db),
) -> NoticeAck:
    notice = db.scalar(select(TeamNotice).where(TeamNotice.id == notice_id, TeamNotice.team_id == team_id))
    if notice is None:
        raise HTTPException(status_code=404, detail="Notice not found.")
    if notice.acknowledged_at is None:
        notice.acknowledged_at = datetime.now(UTC)
        db.commit()
    return NoticeAck()


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


def get_download_file_response(
    release_id: uuid.UUID,
    expires: int,
    signature: str,
    db: Session = Depends(get_db),
) -> DownloadFile:
    if not verify_download_signature(release_id, expires, signature):
        raise HTTPException(status_code=403, detail="Download link is invalid or expired.")

    now = datetime.now(UTC)
    release = db.scalar(
        select(DatasetRelease).where(
            DatasetRelease.id == release_id,
            DatasetRelease.is_active.is_(True),
            DatasetRelease.available_from <= now,
            or_(DatasetRelease.available_until.is_(None), DatasetRelease.available_until > now),
        )
    )
    if release is None:
        raise HTTPException(status_code=404, detail="Dataset is not available.")

    try:
        path = resolve_storage_path(get_settings().private_data_dir, release.storage_key)
    except UnsafeStorageKeyError as exc:
        raise HTTPException(status_code=404, detail="Dataset is not available.") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Dataset file is missing.")
    return DownloadFile(path=path, filename=release.display_filename)


@router.get("/data/file", response_class=FileResponse)
def team_data_file(download: DownloadFile = Depends(get_download_file_response)) -> FileResponse:
    return FileResponse(download.path, filename=download.filename, media_type="text/csv")
