import uuid
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import create_app
from app.security import hash_password


class FakeSession:
    def __init__(self, team):
        self.team = team
        self.added = []
        self.committed = False

    def scalar(self, _statement):
        return self.team

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.committed = True


def make_client(team):
    app = create_app()
    db = FakeSession(team)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app), db


def test_login_returns_jwt_and_persists_session() -> None:
    team = SimpleNamespace(
        id=uuid.uuid4(),
        team_code="A01",
        password_hash=hash_password("correct-password"),
        is_active=True,
    )
    client, db = make_client(team)
    response = client.post(
        "/api/v1/auth/login",
        json={"team_id": "A01", "password": "correct-password"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert response.json()["token_type"] == "bearer"
    assert len(db.added) == 1
    assert db.committed is True


def test_login_rejects_wrong_password() -> None:
    team = SimpleNamespace(
        id=uuid.uuid4(),
        team_code="A01",
        password_hash=hash_password("correct-password"),
        is_active=True,
    )
    client, db = make_client(team)
    response = client.post(
        "/api/v1/auth/login",
        json={"team_id": "A01", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert db.added == []


def test_login_rejects_inactive_team() -> None:
    team = SimpleNamespace(
        id=uuid.uuid4(),
        team_code="A01",
        password_hash=hash_password("correct-password"),
        is_active=False,
    )
    client, _ = make_client(team)
    response = client.post(
        "/api/v1/auth/login",
        json={"team_id": "A01", "password": "correct-password"},
    )
    assert response.status_code == 401


def test_admin_login_returns_admin_jwt(monkeypatch) -> None:
    admin = SimpleNamespace(
        id=uuid.uuid4(),
        username="organizer",
        password_hash=hash_password("admin-password"),
        is_active=True,
    )
    client, _ = make_client(admin)
    response = client.post(
        "/api/v1/auth/admin/login",
        json={"username": "organizer", "password": "admin-password"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]
