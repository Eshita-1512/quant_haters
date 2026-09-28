from fastapi.testclient import TestClient

from app.main import create_app


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
