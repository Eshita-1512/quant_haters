import hashlib
import uuid
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AdminAuthSession, AdminUser, AuthSession, EventState, Stock, Team, TeamAssignment, DatasetRelease
from app.schemas.team import StockInfo, TeamProfile
from app.security import InvalidTokenError, decode_access_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_team_id(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> uuid.UUID:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        claims = decode_access_token(token)
        team_id = uuid.UUID(claims.subject)
    except (InvalidTokenError, ValueError):
        raise unauthorized from None
    if claims.role != "team":
        raise unauthorized
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.execute(
        select(AuthSession, Team)
        .join(Team, Team.id == AuthSession.team_id)
        .where(AuthSession.token_hash == token_hash)
    ).one_or_none()
    if row is None:
        raise unauthorized
    session, team = row
    if (
        session.team_id != team_id
        or not team.is_active
        or session.revoked_at is not None
        or session.expires_at <= datetime.now(UTC)
    ):
        raise unauthorized
    return team_id


def get_current_admin_id(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> uuid.UUID:
    unauthorized = HTTPException(status_code=401, detail="Administrator authorization required.")
    try:
        claims = decode_access_token(token)
        admin_id = uuid.UUID(claims.subject)
    except (InvalidTokenError, ValueError):
        raise unauthorized from None
    if claims.role != "admin":
        raise unauthorized
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.execute(
        select(AdminAuthSession, AdminUser)
        .join(AdminUser, AdminUser.id == AdminAuthSession.admin_id)
        .where(AdminAuthSession.token_hash == token_hash)
    ).one_or_none()
    if row is None:
        raise unauthorized
    session, admin = row
    if (
        session.admin_id != admin_id
        or not admin.is_active
        or session.revoked_at is not None
        or session.expires_at <= datetime.now(UTC)
    ):
        raise unauthorized
    return admin_id


def team_profile_statement(team_id: uuid.UUID):
    return (
        select(Team, TeamAssignment, Stock)
        .select_from(Team)
        .join(EventState, EventState.id == 1)
        .join(TeamAssignment, (TeamAssignment.team_id == Team.id) & (TeamAssignment.round_id == EventState.current_round_id))
        .join(Stock, Stock.id == TeamAssignment.stock_id)
        .where(Team.id == team_id, Team.is_active.is_(True))
    )


def get_current_team_profile(
    team_id: uuid.UUID = Depends(get_current_team_id), db: Session = Depends(get_db)
) -> TeamProfile:
    row = db.execute(team_profile_statement(team_id)).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No active team assignment found.")
    team, assignment, stock = row
    
    state = db.scalar(select(EventState).where(EventState.id == 1))
    download_available = False
    if state and state.current_round_id:
        release_type = "flash_crash" if state.flash_crash_active else "standard"
        download_available = db.scalar(
            select(DatasetRelease.id)
            .join(TeamAssignment, TeamAssignment.id == DatasetRelease.assignment_id)
            .where(
                TeamAssignment.team_id == team_id,
                DatasetRelease.round_id == state.current_round_id,
                DatasetRelease.release_type == release_type,
                DatasetRelease.is_active.is_(True),
                DatasetRelease.available_from <= datetime.now(UTC),
                or_(DatasetRelease.available_until.is_(None), DatasetRelease.available_until > datetime.now(UTC)),
            )
            .limit(1)
        ) is not None

    return TeamProfile(
        team_id=team.team_code,
        team_name=team.team_name,
        assigned_stock=StockInfo(code=stock.stock_code, name=stock.display_name),
        train_start=assignment.train_start,
        train_end=assignment.train_end,
        predict_start=assignment.predict_start,
        predict_end=assignment.predict_end,
        download_available=download_available,
    )
