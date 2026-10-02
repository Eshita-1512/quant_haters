from fastapi.testclient import TestClient

from app.main import create_app


def test_frozen_routes_exist() -> None:
    paths = TestClient(create_app()).get("/openapi.json").json()["paths"]
    assert {
        "/api/v1/auth/login",
        "/api/v1/team/me",
        "/api/v1/team/data",
        "/api/v1/team/data/file",
        "/api/v1/submit/round/{round_num}",
        "/api/v1/leaderboard",
        "/api/v1/event/status",
        "/api/v1/admin/flash-crash",
        "/api/v1/admin/status",
        "/api/v1/admin/timer",
        "/api/v1/admin/round",
        "/api/v1/admin/leaderboard",
        "/api/v1/admin/leaderboard/snapshot",
        "/api/v1/admin/final-backtest",
    } <= set(paths)


def test_openapi_exposes_bearer_authentication() -> None:
    document = TestClient(create_app()).get("/openapi.json").json()
    assert "OAuth2PasswordBearer" in document["components"]["securitySchemes"]
