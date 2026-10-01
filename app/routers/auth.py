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

    token = create_access_token(subject=str(team.id), role="team")
    settings = get_settings()
    db.add(
        AuthSession(
            team_id=team.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes),
        )
    )
    db.commit()
    return TokenResponse(access_token=token)


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    admin = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    if admin is None or not admin.is_active or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials.")
    token = create_access_token(subject=str(admin.id), role="admin")
    settings = get_settings()
    db.add(
        AdminAuthSession(
            admin_id=admin.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=datetime.now(UTC)
            + timedelta(minutes=settings.access_token_minutes),
        )
    )
    db.commit()
    return TokenResponse(access_token=token)
