from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    app_secret: str
    admin_username: str | None
    admin_password: str | None
    admin_display_name: str
    vapid_public_key: str | None
    vapid_private_key: str | None
    vapid_subject: str
    app_base_url: str | None
    qr_ttl_minutes: int
    pin_max_attempts: int
    pin_lock_minutes: int
    admin_session_hours: int
    client_session_hours: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_env=os.getenv("APP_ENV", "production").strip() or "production",
            database_url=os.getenv("DATABASE_URL", "").strip(),
            app_secret=os.getenv("APP_SECRET", "").strip(),
            admin_username=_optional("ADMIN_USERNAME"),
            admin_password=_optional("ADMIN_PASSWORD"),
            admin_display_name=os.getenv("ADMIN_DISPLAY_NAME", "Administrador").strip() or "Administrador",
            vapid_public_key=_optional("VAPID_PUBLIC_KEY"),
            vapid_private_key=_optional("VAPID_PRIVATE_KEY"),
            vapid_subject=os.getenv("VAPID_SUBJECT", "mailto:lub.vera12@gmail.com").strip(),
            app_base_url=_optional("APP_BASE_URL"),
            qr_ttl_minutes=_positive_int("QR_TTL_MINUTES", 15),
            pin_max_attempts=_positive_int("PIN_MAX_ATTEMPTS", 5),
            pin_lock_minutes=_positive_int("PIN_LOCK_MINUTES", 15),
            admin_session_hours=_positive_int("ADMIN_SESSION_HOURS", 12),
            client_session_hours=_positive_int("CLIENT_SESSION_HOURS", 12),
        )

    @property
    def secure_cookies(self) -> bool:
        return self.app_env.lower() != "development"

    def require_database(self) -> str:
        if not self.database_url:
            raise RuntimeError("DATABASE_URL no esta configurada")
        return self.database_url

    def require_secret(self) -> str:
        if len(self.app_secret) < 48:
            raise RuntimeError("APP_SECRET debe tener al menos 48 caracteres")
        return self.app_secret


def _optional(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    value = int(raw)
    if value <= 0:
        raise RuntimeError(f"{name} debe ser mayor que cero")
    return value


settings = Settings.from_env()
