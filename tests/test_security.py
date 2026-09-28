import uuid

import jwt

from app.config import get_settings
from app.security import create_access_token, hash_password, verify_password


def test_password_hash_verifies_only_correct_password() -> None:
    encoded = hash_password("correct-password")
    assert encoded != "correct-password"
    assert verify_password("correct-password", encoded) is True
    assert verify_password("wrong-password", encoded) is False


def test_access_token_contains_identity_role_and_jti() -> None:
    subject = str(uuid.uuid4())
    token = create_access_token(subject=subject, role="team")
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert payload["sub"] == subject
    assert payload["role"] == "team"
    assert payload["jti"]
    assert payload["exp"] > payload["iat"]
