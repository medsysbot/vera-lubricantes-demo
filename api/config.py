from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    app_secret: str
    vapid_public_key: str
    vapid_private_key: str
    vapid_subject: str

    @classmethod
    def from_env(cls) -> "Settings":
        app_secret = _required("APP_SECRET")
        if len(app_secret) < 48:
            raise RuntimeError("APP_SECRET debe tener al menos 48 caracteres")

        return cls(
            app_env=os.getenv("APP_ENV", "production").strip() or "production",
            database_url=_required("DATABASE_URL"),
            app_secret=app_secret,
            vapid_public_key=_required("VAPID_PUBLIC_KEY"),
            vapid_private_key=_required("VAPID_PRIVATE_KEY"),
            vapid_subject=_required("VAPID_SUBJECT"),
        )

    def derive_secret(self, purpose: str) -> bytes:
        return hmac.new(
            self.app_secret.encode("utf-8"),
            purpose.encode("utf-8"),
            hashlib.sha256,
        ).digest()


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} no esta configurada")
    return value


def get_public_base_url() -> str:
    explicit = os.getenv("APP_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")

    railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
    if railway_domain:
        return f"https://{railway_domain}"

    raise RuntimeError("No se pudo determinar la URL publica de VERA")
