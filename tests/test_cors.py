from fastapi.testclient import TestClient

from app.main import create_app
from app.config import get_settings


def test_configured_frontend_origin_can_call_api() -> None:
    response = TestClient(create_app()).options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_production_frontend_origin_can_call_api(monkeypatch) -> None:
    monkeypatch.setenv("PRODUCTION_FRONTEND_URL", "https://quant.example.com")
    get_settings.cache_clear()
    try:
        response = TestClient(create_app()).options(
            "/api/v1/auth/login",
            headers={
                "Origin": "https://quant.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://quant.example.com"
