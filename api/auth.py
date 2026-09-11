from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, Request, status

from api.config import settings
from api.db import connection
from api.security import hash_token

ADMIN_COOKIE = "vera_admin_session"
CLIENT_COOKIE = "vera_client_session"
DEVICE_COOKIE = "vera_device"
DEV_CLIENT_HEADER = "x-vera-dev-client"


@dataclass(frozen=True)
class AdminContext:
    id: UUID
    username: str
    display_name: str


@dataclass(frozen=True)
class ClientContext:
    id: UUID
    full_name: str
    phone: str
    device_hash: str
    access_version: int


def require_admin(request: Request) -> AdminContext:
    if not settings.auth_enabled:
        with connection() as conn:
            row = conn.execute(
                "select id, username, display_name from vera.admins where is_active=true order by created_at limit 1"
            ).fetchone()
        if not row:
            raise HTTPException(status_code=503, detail="Administrador de desarrollo no disponible")
        return AdminContext(**row)

    token = request.cookies.get(ADMIN_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion administrativa requerida")
    token_hash = hash_token(token, "admin-session")
    with connection() as conn:
        row = conn.execute(
            """
            select a.id, a.username, a.display_name
            from vera.admin_sessions s
            join vera.admins a on a.id = s.admin_id
            where s.session_token_hash = %s
              and s.revoked_at is null
              and s.expires_at > now()
              and a.is_active = true
            """,
            (token_hash,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion administrativa invalida")
    return AdminContext(**row)


def require_client(request: Request) -> ClientContext:
    if not settings.auth_enabled:
        raw_client_id = request.headers.get(DEV_CLIENT_HEADER, "").strip()
        with connection() as conn:
            if raw_client_id:
                try:
                    client_id = UUID(raw_client_id)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail="Cliente de desarrollo invalido") from exc
                row = conn.execute(
                    "select id, full_name, phone from vera.clients where id=%s",
                    (client_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    "select id, full_name, phone from vera.clients order by created_at limit 1"
                ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Todavia no hay clientes registrados")
        return ClientContext(
            id=row["id"],
            full_name=row["full_name"],
            phone=row["phone"],
            device_hash="development",
            access_version=0,
        )

    session_token = request.cookies.get(CLIENT_COOKIE)
    device_token = request.cookies.get(DEVICE_COOKIE)
    if not session_token or not device_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN requerido")
    session_hash = hash_token(session_token, "client-session")
    device_hash = hash_token(device_token, "device")
    with connection() as conn:
        row = conn.execute(
            """
            select c.id, c.full_name, c.phone, ca.access_version
            from vera.client_sessions s
            join vera.clients c on c.id = s.client_id
            join vera.client_access ca on ca.client_id = c.id
            where s.session_token_hash = %s
              and s.device_token_hash = %s
              and s.revoked_at is null
              and s.expires_at > now()
              and s.access_version = ca.access_version
              and ca.device_token_hash = %s
              and ca.is_enabled = true
            """,
            (session_hash, device_hash, device_hash),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion de cliente invalida")
    return ClientContext(device_hash=device_hash, **row)


def cookie_options() -> dict:
    return {
        "httponly": True,
        "secure": settings.secure_cookies,
        "samesite": "strict",
        "path": "/",
    }


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
