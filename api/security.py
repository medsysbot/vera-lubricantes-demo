from __future__ import annotations

import hashlib
import hmac
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from api.config import Settings

_PIN_PATTERN = re.compile(r"^\d{4}$")
_PASSWORD_HASHER = PasswordHasher()


def generate_token(size: int = 32) -> str:
    return secrets.token_urlsafe(size)


def hash_token(token: str, purpose: str, settings: Settings) -> str:
    if not token:
        raise ValueError("El token no puede estar vacio")
    return hmac.new(
        settings.derive_secret(f"token:{purpose}"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def hash_pin(pin: str, settings: Settings) -> str:
    _validate_pin(pin)
    return _PASSWORD_HASHER.hash(_peppered_pin(pin, settings))


def verify_pin(pin: str, encoded_hash: str, settings: Settings) -> bool:
    if not _PIN_PATTERN.fullmatch(pin or ""):
        return False
    try:
        return _PASSWORD_HASHER.verify(encoded_hash, _peppered_pin(pin, settings))
    except (VerifyMismatchError, InvalidHashError):
        return False


def pin_hash_needs_rehash(encoded_hash: str) -> bool:
    try:
        return _PASSWORD_HASHER.check_needs_rehash(encoded_hash)
    except InvalidHashError:
        return True


def _peppered_pin(pin: str, settings: Settings) -> str:
    pepper = settings.derive_secret("pin").hex()
    return f"{pin}:{pepper}"


def _validate_pin(pin: str) -> None:
    if not _PIN_PATTERN.fullmatch(pin or ""):
        raise ValueError("El PIN debe contener exactamente 4 digitos")
