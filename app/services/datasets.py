import hashlib
import hmac
import uuid

from app.config import get_settings


def create_download_signature(release_id: uuid.UUID, expires: int) -> str:
    message = f"{release_id}:{expires}".encode()
    return hmac.new(get_settings().jwt_secret.encode(), message, hashlib.sha256).hexdigest()


def verify_download_signature(release_id: uuid.UUID, expires: int, signature: str) -> bool:
    expected = create_download_signature(release_id, expires)
    return hmac.compare_digest(expected, signature)
