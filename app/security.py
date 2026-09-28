import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import get_settings


password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded_hash: str) -> bool:
    return password_hash.verify(password, encoded_hash)


def create_access_token(*, subject: str, role: str) -> str:
    settings = get_settings()
    issued_at = datetime.now(UTC)
    payload = {
        "sub": subject,
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
