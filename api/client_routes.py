from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from api.auth import CLIENT_COOKIE, DEVICE_COOKIE, ClientContext, cookie_options, require_client, utcnow
from api.config import settings
from api.db import connection
from api.models import ClientLogin, MessageInput, MessageSelection, PushSubscriptionInput
from api.push import push_is_configured
from api.security import hash_token, random_token, verify_pin

router = APIRouter(prefix="/api/client", tags=["client"])


@router.post("/login")
def login(payload: ClientLogin, request: Request, response: Response):
    device_raw = request.cookies.get(DEVICE_COOKIE)
    if not device_raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Este dispositivo no esta vinculado a VERA")
    device_hash = hash_token(device_raw, "device")
    with connection() as conn:
        access = conn.execute(
            """
            select ca.client_id, ca.pin_hash, ca.access_version, ca.failed_pin_attempts, ca.locked_until, c.full_name
            from vera.client_access ca join vera.clients c on c.id=ca.client_id
            where ca.device_token_hash=%s and ca.is_enabled=true
            for update
            """,
            (device_hash,),
        ).fetchone()
        if not access or not access["pin_hash"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Acceso VERA no configurado")
        if access["locked_until"] and access["locked_until"] > utcnow():
            raise HTTPException(status_code=429, detail="Acceso temporalmente bloqueado. Intente mas tarde")
        if not verify_pin(access["pin_hash"], payload.pin):
            attempts = access["failed_pin_attempts"] + 1
            locked_until = None
            if attempts >= settings.pin_max_attempts:
                locked_until = utcnow() + timedelta(minutes=settings.pin_lock_minutes)
                attempts = 0
            conn.execute(
                "update vera.client_access set failed_pin_attempts=%s, locked_until=%s where client_id=%s",
                (attempts, locked_until, access["client_id"]),
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN incorrecto")
        conn.execute(
            "update vera.client_access set failed_pin_attempts=0, locked_until=null where client_id=%s",
            (access["client_id"],),
        )
        raw = random_token()
        session_hash = hash_token(raw, "client-session")
        expires = utcnow() + timedelta(hours=settings.client_session_hours)
        conn.execute(
            """
            insert into vera.client_sessions (client_id, session_token_hash, device_token_hash, access_version, expires_at)
            values (%s,%s,%s,%s,%s)
            """,
            (access["client_id"], session_hash, device_hash, access["access_version"], expires),
        )
    response.set_cookie(CLIENT_COOKIE, raw, max_age=settings.client_session_hours * 3600, **cookie_options())
    return {"ok": True, "full_name": access["full_name"]}


@router.post("/logout")
def logout(request: Request, response: Response, client: ClientContext = Depends(require_client)):
    raw = request.cookies.get(CLIENT_COOKIE)
    if raw:
        with connection() as conn:
            conn.execute(
                "update vera.client_sessions set revoked_at=now() where session_token_hash=%s and revoked_at is null",
                (hash_token(raw, "client-session"),),
            )
    response.delete_cookie(CLIENT_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(client: ClientContext = Depends(require_client)):
    with connection() as conn:
        vehicles = conn.execute(
            """
            select v.id, v.plate, v.brand, v.model, v.description, v.year, v.current_mileage,
                   ls.service_date as last_service_date, ls.mileage as last_service_mileage,
                   ls.next_change_km, ls.oil
            from vera.vehicles v
            left join lateral (
                select service_date, mileage, next_change_km, oil
                from vera.services s where s.vehicle_id=v.id
                order by service_date desc, created_at desc limit 1
            ) ls on true
            where v.client_id=%s order by v.created_at
            """,
            (client.id,),
        ).fetchall()
        unread = conn.execute(
            "select count(*) as n from vera.messages where client_id=%s and sender_role='admin' and is_read=false and client_deleted_at is null",
            (client.id,),
        ).fetchone()["n"]
    return {"id": client.id, "full_name": client.full_name, "phone": client.phone, "vehicles": vehicles, "unread_messages": unread}


@router.get("/vehicles/{vehicle_id}")
def vehicle(vehicle_id: UUID, client: ClientContext = Depends(require_client)):
    with connection() as conn:
        v = conn.execute(
            "select id, plate, brand, model, description, year, current_mileage from vera.vehicles where id=%s and client_id=%s",
            (vehicle_id, client.id),
        ).fetchone()
        if not v:
            raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
        latest = conn.execute(
            "select * from vera.services where vehicle_id=%s order by service_date desc, created_at desc limit 1",
            (vehicle_id,),
        ).fetchone()
    return {"vehicle": v, "latest_service": latest, "client": {"full_name": client.full_name, "phone": client.phone}}


@router.get("/vehicles/{vehicle_id}/services")
def services(vehicle_id: UUID, client: ClientContext = Depends(require_client)):
    with connection() as conn:
        owns = conn.execute("select 1 from vera.vehicles where id=%s and client_id=%s", (vehicle_id, client.id)).fetchone()
        if not owns:
            raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
        rows = conn.execute(
            "select * from vera.services where vehicle_id=%s order by service_date desc, created_at desc",
            (vehicle_id,),
        ).fetchall()
    return rows


@router.get("/messages")
def messages(client: ClientContext = Depends(require_client)):
    with connection() as conn:
        rows = conn.execute(
            """
            select m.id, m.sender_role, m.message_type, m.title, m.body, m.is_read, m.created_at,
                   m.read_at, m.vehicle_id, p.criterion_value as promotion_item
            from vera.messages m
            left join vera.promotions p on p.id=m.promotion_id
            where m.client_id=%s and m.client_deleted_at is null
            order by m.created_at desc, m.id desc
            limit 200
            """,
            (client.id,),
        ).fetchall()
    return rows


@router.post("/messages", status_code=201)
def send_client_message(payload: MessageInput, client: ClientContext = Depends(require_client)):
    with connection() as conn:
        row = conn.execute(
            """
            insert into vera.messages (client_id, message_type, title, body, sender_role)
            values (%s, 'message', %s, %s, 'client')
            returning id, created_at
            """,
            (client.id, payload.title, payload.body),
        ).fetchone()
    return row


@router.delete("/messages")
def delete_client_messages(payload: MessageSelection, client: ClientContext = Depends(require_client)):
    ids = list(dict.fromkeys(payload.ids))
    with connection() as conn:
        rows = conn.execute(
            """
            update vera.messages set client_deleted_at=now()
            where id=any(%s) and client_id=%s and client_deleted_at is null
            returning id
            """,
            (ids, client.id),
        ).fetchall()
    return {"deleted": len(rows), "ids": [row["id"] for row in rows]}


@router.post("/messages/{message_id}/read")
def read_message(message_id: UUID, client: ClientContext = Depends(require_client)):
    with connection() as conn:
        row = conn.execute(
            """
            update vera.messages
            set is_read=true, read_at=coalesce(read_at,now())
            where id=%s and client_id=%s and sender_role='admin' and client_deleted_at is null
            returning id, read_at
            """,
            (message_id, client.id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    return {"ok": True, "read_at": row["read_at"]}


@router.delete("/messages/{message_id}")
def delete_message(message_id: UUID, client: ClientContext = Depends(require_client)):
    with connection() as conn:
        row = conn.execute(
            """
            update vera.messages
            set client_deleted_at=coalesce(client_deleted_at,now())
            where id=%s and client_id=%s and client_deleted_at is null
            returning id
            """,
            (message_id, client.id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    return {"ok": True}


@router.get("/push/config")
def push_config(client: ClientContext = Depends(require_client)):
    return {"enabled": push_is_configured(), "public_key": settings.vapid_public_key if push_is_configured() else None}


@router.post("/push/subscription")
def save_push(payload: PushSubscriptionInput, client: ClientContext = Depends(require_client)):
    with connection() as conn:
        conn.execute("delete from vera.push_subscriptions where endpoint=%s and client_id<>%s", (payload.endpoint, client.id))
        conn.execute(
            """
            insert into vera.push_subscriptions (client_id, device_token_hash, endpoint, p256dh, auth)
            values (%s,%s,%s,%s,%s)
            on conflict (client_id) do update set
              device_token_hash=excluded.device_token_hash,
              endpoint=excluded.endpoint,
              p256dh=excluded.p256dh,
              auth=excluded.auth,
              updated_at=now()
            """,
            (client.id, client.device_hash, payload.endpoint, payload.p256dh, payload.auth),
        )
    return {"ok": True}
