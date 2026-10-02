import hashlib
import hmac
import time
import uuid
from pathlib import Path

from app.config import get_settings


class UnsafeStorageKeyError(ValueError):
    """Raised when a dataset storage key escapes its configured root."""


def create_download_signature(release_id: uuid.UUID, expires: int) -> str:
    message = f"{release_id}:{expires}".encode()
    return hmac.new(get_settings().jwt_secret.encode(), message, hashlib.sha256).hexdigest()


def verify_download_signature(
    release_id: uuid.UUID, expires: int, signature: str, *, now: int | None = None
) -> bool:
    if expires < (int(time.time()) if now is None else now):
        return False
    expected = create_download_signature(release_id, expires)
    return hmac.compare_digest(expected, signature)


def resolve_storage_path(root: Path, storage_key: str) -> Path:
    resolved_root = root.resolve()
    candidate = (resolved_root / storage_key).resolve()
    if not candidate.is_relative_to(resolved_root):
        raise UnsafeStorageKeyError("Dataset storage key escapes private data directory.")
    return candidate
