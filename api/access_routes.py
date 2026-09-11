from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status

from api.auth import CLIENT_COOKIE, DEVICE_COOKIE, cookie_options
from api.db import connection
from api.models import AccessComplete
from api.security import hash_pin, hash_token, random_token

router = APIRouter(prefix="/api/access", tags=["access"])


@router.get("/{token}")
def inspect_token(token: str):
    token_hash = hash_token(token, "access-qr")
    with connection() as conn:
        row = conn.execute(
            """
            select q.purpose, q.expires_at, c.full_name
            from vera.qr_tokens q join vera.clients c on c.id=q.client_id
            where q.token_hash=%s and q.used_at is null and q.expires_at>now()
            """,
            (token_hash,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="QR invalido o vencido")
    return row


@router.post("/{token}/complete")
def complete_token(token: str, payload: AccessComplete, request: Request, response: Response):
    if payload.pin != payload.pin_confirm:
        raise HTTPException(status_code=400, detail="Los PIN no coinciden")
    token_hash = hash_token(token, "access-qr")
    with connection() as conn:
        qr = conn.execute(
            """
            select q.id, q.client_id, q.purpose, ca.device_token_hash, ca.access_version
            from vera.qr_tokens q
            join vera.client_access ca on ca.client_id=q.client_id
            where q.token_hash=%s and q.used_at is null and q.expires_at>now()
            for update
            """,
            (token_hash,),
        ).fetchone()
        if not qr:
            raise HTTPException(status_code=404, detail="QR invalido o vencido")

        current_device_raw = request.cookies.get(DEVICE_COOKIE)
        current_device_hash = hash_token(current_device_raw, "device") if current_device_raw else None
        pin_hash = hash_pin(payload.pin)

        if qr["purpose"] == "pin_reset":
            if not current_device_hash or current_device_hash != qr["device_token_hash"]:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Este QR debe abrirse desde el dispositivo VERA ya vinculado")
            conn.execute(
                "update vera.client_access set pin_hash=%s, pin_updated_at=now(), failed_pin_attempts=0, locked_until=null where client_id=%s",
                (pin_hash, qr["client_id"]),
            )
            conn.execute("update vera.client_sessions set revoked_at=now() where client_id=%s and revoked_at is null", (qr["client_id"],))
        else:
            if qr["purpose"] == "activation" and qr["device_token_hash"]:
                raise HTTPException(status_code=409, detail="El cliente ya tiene un dispositivo vinculado. Use Revincular VERA")
            device_raw = random_token()
            device_hash = hash_token(device_raw, "device")
            conn.execute(
                """
                update vera.client_access
                set pin_hash=%s, device_token_hash=%s, device_linked_at=now(), pin_updated_at=now(),
                    access_version=access_version+1, failed_pin_attempts=0, locked_until=null, is_enabled=true
                where client_id=%s
                """,
                (pin_hash, device_hash, qr["client_id"]),
            )
            conn.execute("update vera.client_sessions set revoked_at=now() where client_id=%s and revoked_at is null", (qr["client_id"],))
            conn.execute("delete from vera.push_subscriptions where client_id=%s", (qr["client_id"],))
            response.set_cookie(DEVICE_COOKIE, device_raw, max_age=31536000, **cookie_options())

        conn.execute("update vera.qr_tokens set used_at=now() where id=%s", (qr["id"],))

    response.delete_cookie(CLIENT_COOKIE, path="/")
    return {"ok": True, "purpose": qr["purpose"]}
