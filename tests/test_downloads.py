import uuid

from fastapi.testclient import TestClient

from app.dependencies import get_current_team_id
from app.main import create_app
from app.routers.team import get_download_response
from app.schemas.team import DatasetDownload
from app.services.datasets import create_download_signature, verify_download_signature


def test_download_signature_detects_tampering() -> None:
    release_id = uuid.uuid4()
    signature = create_download_signature(release_id, 2_000_000_000)
    assert verify_download_signature(release_id, 2_000_000_000, signature)
    assert not verify_download_signature(uuid.uuid4(), 2_000_000_000, signature)


def test_team_data_returns_authorized_signed_url() -> None:
    app = create_app()
    app.dependency_overrides[get_current_team_id] = lambda: uuid.uuid4()
    app.dependency_overrides[get_download_response] = lambda: DatasetDownload(
        filename="STOCK_A_team_A01_round1.csv",
        download_url="/api/v1/team/data/file?token=signed",
        expires_in_seconds=120,
    )
    response = TestClient(app).get(
        "/api/v1/team/data", headers={"Authorization": "Bearer test"}
    )
    assert response.status_code == 200
    assert response.json()["filename"] == "STOCK_A_team_A01_round1.csv"
    assert response.json()["expires_in_seconds"] == 120
