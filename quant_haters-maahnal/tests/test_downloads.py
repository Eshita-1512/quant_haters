import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app.dependencies import get_current_team_id
from app.main import create_app
from app.routers.team import DownloadFile, get_download_file_response, get_download_response
from app.schemas.team import DatasetDownload
from app.services.datasets import (
    UnsafeStorageKeyError,
    create_download_signature,
    resolve_storage_path,
    verify_download_signature,
)


def test_download_signature_detects_tampering() -> None:
    release_id = uuid.uuid4()
    signature = create_download_signature(release_id, 2_000_000_000)
    assert verify_download_signature(release_id, 2_000_000_000, signature)
    assert not verify_download_signature(uuid.uuid4(), 2_000_000_000, signature)


def test_download_signature_rejects_expired_link() -> None:
    release_id = uuid.uuid4()
    expires = int(time.time()) - 1
    signature = create_download_signature(release_id, expires)
    assert not verify_download_signature(release_id, expires, signature)


def test_storage_path_must_remain_under_private_data_root(tmp_path: Path) -> None:
    assert resolve_storage_path(tmp_path, "rounds/round-1.csv") == (
        tmp_path / "rounds/round-1.csv"
    ).resolve()

    try:
        resolve_storage_path(tmp_path, "../secret.csv")
    except UnsafeStorageKeyError:
        pass
    else:
        raise AssertionError("path traversal must be rejected")


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


def test_signed_download_endpoint_serves_csv(tmp_path: Path) -> None:
    dataset = tmp_path / "round-1.csv"
    dataset.write_text("timestamp,price\n1,100\n")
    app = create_app()
    app.dependency_overrides[get_download_file_response] = lambda: DownloadFile(
        path=dataset, filename="team-round-1.csv"
    )

    response = TestClient(app).get(
        "/api/v1/team/data/file",
        params={"release_id": str(uuid.uuid4()), "expires": 2_000_000_000, "signature": "test"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="team-round-1.csv"' in response.headers["content-disposition"]
    assert response.text == "timestamp,price\n1,100\n"
