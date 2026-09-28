import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.dependencies import get_current_team_id
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
