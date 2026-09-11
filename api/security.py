from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from api.config import settings

_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


def random_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str, purpose: str) -> str:
    secret = settings.require_secret().encode("utf-8")
    return hmac.new(secret, f"{purpose}:{token}".encode("utf-8"), hashlib.sha256).hexdigest()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(stored_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _pin_material(pin: str) -> str:
    secret = settings.require_secret().encode("utf-8")
    return hmac.new(secret, f"pin:{pin}".encode("utf-8"), hashlib.sha256).hexdigest()


def hash_pin(pin: str) -> str:
    _validate_pin(pin)
    return _hasher.hash(_pin_material(pin))


def verify_pin(stored_hash: str, pin: str) -> bool:
    try:
        _validate_pin(pin)
        return _hasher.verify(stored_hash, _pin_material(pin))
    except (ValueError, VerifyMismatchError, InvalidHashError):
        return False


def _validate_pin(pin: str) -> None:
    if len(pin) != 4 or not pin.isdigit():
        raise ValueError("El PIN debe tener exactamente 4 digitos")
