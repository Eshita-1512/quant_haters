import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.dependencies import get_current_admin_id, get_current_team_id
from app.security import create_access_token


class FakeDatabase:
    def __init__(self, row):
        self.row = row

    def execute(self, _statement):
        return SimpleNamespace(one_or_none=lambda: self.row)


def _auth_session(token: str, team_id: uuid.UUID):
    return SimpleNamespace(
        team_id=team_id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        revoked_at=None,
    )


def test_team_token_requires_active_team() -> None:
    team_id = uuid.uuid4()
    token = create_access_token(subject=str(team_id), role="team")
    db = FakeDatabase((_auth_session(token, team_id), SimpleNamespace(is_active=False)))

    with pytest.raises(HTTPException) as exc:
        get_current_team_id(token=token, db=db)  # type: ignore[arg-type]

    assert exc.value.status_code == 401


def test_team_token_session_must_belong_to_claimed_team() -> None:
    team_id = uuid.uuid4()
    token = create_access_token(subject=str(team_id), role="team")
    db = FakeDatabase((_auth_session(token, uuid.uuid4()), SimpleNamespace(is_active=True)))

    with pytest.raises(HTTPException) as exc:
        get_current_team_id(token=token, db=db)  # type: ignore[arg-type]

    assert exc.value.status_code == 401


def _admin_session(token: str, admin_id: uuid.UUID, *, revoked: bool = False):
    return SimpleNamespace(
        admin_id=admin_id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        revoked_at=datetime.now(UTC) if revoked else None,
    )


def test_admin_token_requires_active_persisted_session() -> None:
    admin_id = uuid.uuid4()
    token = create_access_token(subject=str(admin_id), role="admin")
    db = FakeDatabase(
        (_admin_session(token, admin_id), SimpleNamespace(is_active=True))
    )

    assert get_current_admin_id(token=token, db=db) == admin_id  # type: ignore[arg-type]


def test_revoked_admin_session_is_rejected() -> None:
    admin_id = uuid.uuid4()
    token = create_access_token(subject=str(admin_id), role="admin")
    db = FakeDatabase(
        (_admin_session(token, admin_id, revoked=True), SimpleNamespace(is_active=True))
    )

    with pytest.raises(HTTPException) as exc:
        get_current_admin_id(token=token, db=db)  # type: ignore[arg-type]

    assert exc.value.status_code == 401


def test_admin_session_must_belong_to_claimed_admin() -> None:
    admin_id = uuid.uuid4()
    token = create_access_token(subject=str(admin_id), role="admin")
    db = FakeDatabase(
        (_admin_session(token, uuid.uuid4()), SimpleNamespace(is_active=True))
    )

    with pytest.raises(HTTPException) as exc:
        get_current_admin_id(token=token, db=db)  # type: ignore[arg-type]

    assert exc.value.status_code == 401
