import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import AdminAuthSession, AdminUser, AuthSession, Team
from app.schemas.auth import AdminLoginRequest, LoginRequest, TokenResponse
from app.security import create_access_token, verify_password


router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    team = db.scalar(select(Team).where(Team.team_code == payload.team_id))
    if team is None or not team.is_active or not verify_password(payload.password, team.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid team ID or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    # JWT "exp" is whole seconds, so truncate here to keep the stored expiry identical to the token's.
    issued_at = datetime.now(UTC).replace(microsecond=0)
    expires_at = issued_at + timedelta(minutes=settings.access_token_minutes)
    token = create_access_token(subject=str(team.id), role="team", issued_at=issued_at)
    db.add(
        AuthSession(
            team_id=team.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=expires_at,
        )
    )
    db.commit()
    return TokenResponse(
        access_token=token,
        expires_at=expires_at,
        expires_in_seconds=settings.access_token_minutes * 60,
    )


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    admin = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    if admin is None or not admin.is_active or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials.")
    settings = get_settings()
    # JWT "exp" is whole seconds, so truncate here to keep the stored expiry identical to the token's.
    issued_at = datetime.now(UTC).replace(microsecond=0)
    expires_at = issued_at + timedelta(minutes=settings.access_token_minutes)
    token = create_access_token(subject=str(admin.id), role="admin", issued_at=issued_at)
    db.add(
        AdminAuthSession(
            admin_id=admin.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=expires_at,
        )
    )
    db.commit()
    return TokenResponse(
        access_token=token,
        expires_at=expires_at,
        expires_in_seconds=settings.access_token_minutes * 60,
    )
