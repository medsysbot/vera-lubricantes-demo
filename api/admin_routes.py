from __future__ import annotations

import base64
from datetime import timedelta
from io import BytesIO
from uuid import UUID

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.encoders import jsonable_encoder
from psycopg.types.json import Jsonb

from api.auth import ADMIN_COOKIE, AdminContext, cookie_options, require_admin, utcnow
from api.config import settings
from api.db import connection
from api.models import AccessQrRequest, AdminLogin, ClientCreate, PromotionInput, ServiceInput, VehicleInput
from api.push import send_push
from api.security import hash_password, hash_token, random_token, verify_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

SERVICE_COLUMNS = [
    "service_date", "mileage", "next_change_km", "oil", "oil_type", "oil_filter",
    "fuel_filter", "air_filter", "cabin_filter", "spark_plugs", "gearbox_oil",
    "differential_oil", "grease", "hydraulic_fluid", "coolant", "brake_fluid",
    "tire_control", "tire_rotation", "battery", "observations",
]


def ensure_bootstrap_admin() -> None:
    if not settings.database_url:
        return
    with connection() as conn:
        exists = conn.execute("select id from vera.admins limit 1").fetchone()
        if exists:
            return
        if not settings.auth_enabled:
            conn.execute(
                "insert into vera.admins (username, display_name, password_hash) values (%s, %s, %s)",
                ("development", settings.admin_display_name, hash_password(random_token())),
            )
            return
        if not settings.admin_username or not settings.admin_password:
            return
        conn.execute(
            "insert into vera.admins (username, display_name, password_hash) values (%s, %s, %s)",
            (settings.admin_username, settings.admin_display_name, hash_password(settings.admin_password)),
        )


@router.post("/login")
def login(payload: AdminLogin, response: Response):
    if not settings.auth_enabled:
        return {"ok": True, "development": True}
    with connection() as conn:
        admin = conn.execute(
            "select id, username, display_name, password_hash from vera.admins where lower(username)=lower(%s) and is_active=true",
            (payload.username.strip(),),
        ).fetchone()
        if not admin or not verify_password(admin["password_hash"], payload.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contrasena incorrectos")
        raw = random_token()
        token_hash = hash_token(raw, "admin-session")
        expires = utcnow() + timedelta(hours=settings.admin_session_hours)
        conn.execute(
            "insert into vera.admin_sessions (admin_id, session_token_hash, expires_at) values (%s,%s,%s)",
            (admin["id"], token_hash, expires),
        )
    response.set_cookie(ADMIN_COOKIE, raw, max_age=settings.admin_session_hours * 3600, **cookie_options())
    return {"id": admin["id"], "username": admin["username"], "display_name": admin["display_name"]}


@router.post("/logout")
def logout(request: Request, response: Response, admin: AdminContext = Depends(require_admin)):
    if not settings.auth_enabled:
        return {"ok": True, "development": True}
    token = request.cookies.get(ADMIN_COOKIE)
    if token:
        with connection() as conn:
            conn.execute(
                "update vera.admin_sessions set revoked_at=now() where session_token_hash=%s and revoked_at is null",
                (hash_token(token, "admin-session"),),
            )
    response.delete_cookie(ADMIN_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(admin: AdminContext = Depends(require_admin)):
    return admin.__dict__


@router.get("/dashboard")
def dashboard(admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        counts = conn.execute(
            """
            select
              (select count(*) from vera.clients) as clients,
              (select count(*) from vera.vehicles) as vehicles,
              (select count(*) from vera.services where date_trunc('month', service_date)=date_trunc('month', current_date)) as services_month,
              (select count(*) from vera.promotions) as promotions,
              (select count(*) from vera.reminders where status='pending') as reminders
            """
        ).fetchone()
        activity = conn.execute(
            "select action_type, description, reference, created_at from vera.admin_activity order by created_at desc limit 12"
        ).fetchall()
    return {"counts": counts, "activity": activity}


@router.get("/clients")
def list_clients(search: str = "", admin: AdminContext = Depends(require_admin)):
    term = search.strip()
    pattern = f"%{term}%"
    with connection() as conn:
        rows = conn.execute(
            """
            select c.id, c.full_name, c.phone, c.created_at,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', v.id, 'plate', v.plate, 'brand', v.brand, 'model', v.model,
                  'description', v.description, 'year', v.year, 'current_mileage', v.current_mileage
                ) order by v.created_at)
                from vera.vehicles v where v.client_id=c.id
              ), '[]'::jsonb) as vehicles
            from vera.clients c
            where (%s='' or c.full_name ilike %s or c.phone ilike %s
              or exists(select 1 from vera.vehicles v where v.client_id=c.id and v.plate ilike %s))
            order by c.full_name
            limit 200
            """,
            (term, pattern, pattern, pattern),
        ).fetchall()
    return rows


@router.post("/clients", status_code=201)
def create_client(payload: ClientCreate, admin: AdminContext = Depends(require_admin)):
    v = payload.vehicle
    try:
        with connection() as conn:
            client = conn.execute(
                "insert into vera.clients (full_name, phone, created_by_admin_id) values (%s,%s,%s) returning id, full_name, phone",
                (payload.full_name.strip(), payload.phone.strip(), admin.id),
            ).fetchone()
            vehicle = conn.execute(
                """
                insert into vera.vehicles (client_id, plate, brand, model, description, year, current_mileage, created_by_admin_id)
                values (%s,%s,%s,%s,%s,%s,%s,%s)
                returning id, plate, brand, model, description, year, current_mileage
                """,
                (
                    client["id"], v.plate.strip().upper(), v.brand, v.model.strip(), v.description,
                    v.year, v.current_mileage, admin.id,
                ),
            ).fetchone()
            conn.execute(
                "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
                (admin.id, "client_created", f"Cliente creado: {client['full_name']}", vehicle["plate"]),
            )
        return {"client": client, "vehicle": vehicle}
    except Exception as exc:
        if "vehicles_plate_key" in str(exc) or "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="La patente ya esta registrada") from exc
        raise


@router.delete("/clients/{client_id}", status_code=204)
def delete_client(client_id: UUID, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        row = conn.execute("delete from vera.clients where id=%s returning full_name", (client_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description) values (%s,%s,%s)",
            (admin.id, "client_deleted", f"Cliente eliminado: {row['full_name']}"),
        )
    return Response(status_code=204)


@router.post("/clients/{client_id}/vehicles", status_code=201)
def add_vehicle(client_id: UUID, payload: VehicleInput, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        client = conn.execute("select id from vera.clients where id=%s", (client_id,)).fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        try:
            row = conn.execute(
                """
                insert into vera.vehicles (client_id, plate, brand, model, description, year, current_mileage, created_by_admin_id)
                values (%s,%s,%s,%s,%s,%s,%s,%s)
                returning id, plate, brand, model, description, year, current_mileage
                """,
                (client_id, payload.plate.strip().upper(), payload.brand, payload.model.strip(), payload.description, payload.year, payload.current_mileage, admin.id),
            ).fetchone()
        except Exception as exc:
            if "unique" in str(exc).lower():
                raise HTTPException(status_code=409, detail="La patente ya esta registrada") from exc
            raise
        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
            (admin.id, "vehicle_created", f"Vehiculo agregado: {row['plate']}", row["plate"]),
        )
    return row


@router.get("/vehicles")
def list_vehicles(search: str = "", admin: AdminContext = Depends(require_admin)):
    term = search.strip()
    pattern = f"%{term}%"
    with connection() as conn:
        return conn.execute(
            """
            select v.id, v.client_id, v.plate, v.brand, v.model, v.description, v.year, v.current_mileage,
                   c.full_name as client_name, c.phone,
                   ls.service_date as last_service_date, ls.mileage as last_service_mileage
            from vera.vehicles v join vera.clients c on c.id=v.client_id
            left join lateral (
                select service_date, mileage from vera.services s where s.vehicle_id=v.id
                order by service_date desc, created_at desc limit 1
            ) ls on true
            where (%s='' or v.plate ilike %s or v.model ilike %s or c.full_name ilike %s)
            order by v.plate limit 300
            """,
            (term, pattern, pattern, pattern),
        ).fetchall()


@router.get("/vehicles/{vehicle_id}")
def vehicle_detail(vehicle_id: UUID, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        vehicle = conn.execute(
            """
            select v.*, c.full_name as client_name, c.phone
            from vera.vehicles v join vera.clients c on c.id=v.client_id where v.id=%s
            """,
            (vehicle_id,),
        ).fetchone()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
        services = conn.execute(
            "select * from vera.services where vehicle_id=%s order by service_date desc, created_at desc",
            (vehicle_id,),
        ).fetchall()
    return {"vehicle": vehicle, "services": services}


@router.delete("/vehicles/{vehicle_id}", status_code=204)
def delete_vehicle(vehicle_id: UUID, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        row = conn.execute("delete from vera.vehicles where id=%s returning plate", (vehicle_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
            (admin.id, "vehicle_deleted", f"Vehiculo eliminado: {row['plate']}", row["plate"]),
        )
    return Response(status_code=204)


@router.post("/vehicles/{vehicle_id}/services", status_code=201)
def create_service(vehicle_id: UUID, payload: ServiceInput, admin: AdminContext = Depends(require_admin)):
    values = payload.model_dump()
    with connection() as conn:
        vehicle = conn.execute("select id, plate from vera.vehicles where id=%s", (vehicle_id,)).fetchone()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
        cols = ",".join(SERVICE_COLUMNS)
        placeholders = ",".join(["%s"] * len(SERVICE_COLUMNS))
        row = conn.execute(
            f"insert into vera.services (vehicle_id, created_by_admin_id, {cols}) values (%s,%s,{placeholders}) returning *",
            (vehicle_id, admin.id, *[values.get(k) for k in SERVICE_COLUMNS]),
        ).fetchone()
        conn.execute("update vera.vehicles set current_mileage=%s, updated_at=now() where id=%s", (payload.mileage, vehicle_id))
        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
            (admin.id, "service_created", f"Servicio registrado para {vehicle['plate']}", vehicle["plate"]),
        )
    return row


@router.put("/services/{service_id}")
def correct_service(service_id: UUID, payload: ServiceInput, admin: AdminContext = Depends(require_admin)):
    values = payload.model_dump()
    with connection() as conn:
        before = conn.execute("select * from vera.services where id=%s for update", (service_id,)).fetchone()
        if not before:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        set_sql = ",".join([f"{c}=%s" for c in SERVICE_COLUMNS])
        after = conn.execute(
            f"update vera.services set {set_sql}, updated_at=now() where id=%s returning *",
            (*[values.get(k) for k in SERVICE_COLUMNS], service_id),
        ).fetchone()
        conn.execute(
            "insert into vera.service_corrections (service_id, corrected_by_admin_id, before_data, after_data) values (%s,%s,%s,%s)",
            (service_id, admin.id, Jsonb(jsonable_encoder(before)), Jsonb(jsonable_encoder(after))),
        )
        conn.execute(
            "update vera.vehicles set current_mileage=%s, updated_at=now() where id=%s",
            (payload.mileage, before["vehicle_id"]),
        )
        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
            (admin.id, "service_corrected", "Servicio corregido", str(service_id)),
        )
    return after


@router.post("/clients/{client_id}/access/qr")
def access_qr(client_id: UUID, payload: AccessQrRequest, request: Request, admin: AdminContext = Depends(require_admin)):
    purpose_map = {"activation": "initial", "pin_reset": "pin_reset", "relink": "relink"}
    purpose = purpose_map[payload.purpose]
    token = random_token()
    token_hash = hash_token(token, "qr")
    expires = utcnow() + timedelta(minutes=settings.qr_ttl_minutes)
    with connection() as conn:
        client = conn.execute("select full_name from vera.clients where id=%s", (client_id,)).fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        conn.execute("update vera.qr_tokens set invalidated_at=now() where client_id=%s and purpose=%s and used_at is null and invalidated_at is null", (client_id, purpose))
        conn.execute(
            "insert into vera.qr_tokens (client_id, purpose, token_hash, expires_at, created_by_admin_id) values (%s,%s,%s,%s,%s)",
            (client_id, purpose, token_hash, expires, admin.id),
        )
    base = settings.app_base_url or str(request.base_url).rstrip("/")
    url = f"{base}/activate?token={token}"
    image = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage)
    buf = BytesIO(); image.save(buf)
    svg = base64.b64encode(buf.getvalue()).decode("ascii")
    return {"url": url, "qr": f"data:image/svg+xml;base64,{svg}", "expires_at": expires, "client_name": client["full_name"]}


@router.post("/promotions/preview")
def promotion_preview(payload: PromotionInput, admin: AdminContext = Depends(require_admin)):
    ids = _promotion_clients(payload)
    return {"count": len(ids)}


@router.post("/promotions", status_code=201)
def publish_promotion(payload: PromotionInput, admin: AdminContext = Depends(require_admin)):
    client_ids = _promotion_clients(payload)
    with connection() as conn:
        promotion = conn.execute(
            "insert into vera.promotions (title, detail, criterion_source, criterion_field, criterion_value, created_by_admin_id, published_at) values (%s,%s,%s,%s,%s,%s,now()) returning id, title, published_at",
            (payload.title.strip(), payload.detail.strip(), payload.criterion_source, payload.criterion_field, payload.criterion_value.strip(), admin.id),
        ).fetchone()
        for client_id in client_ids:
            conn.execute(
                "insert into vera.messages (client_id, message_type, title, body, promotion_id) values (%s,'promotion',%s,%s,%s) on conflict do nothing",
                (client_id, payload.title.strip(), payload.detail.strip(), promotion["id"]),
            )
        subscriptions = conn.execute(
            "select endpoint,p256dh,auth from vera.push_subscriptions where client_id=any(%s)",
            (client_ids,),
        ).fetchall() if client_ids else []
        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
            (admin.id, "promotion_published", f"Promocion publicada: {promotion['title']}", str(promotion["id"])),
        )
    sent = sum(1 for s in subscriptions if send_push(s, {"title": payload.title, "body": payload.detail, "url": "/"}))
    return {"promotion": promotion, "recipients": len(client_ids), "push_sent": sent}


@router.get("/promotions")
def list_promotions(admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        return conn.execute(
            """
            select p.id,p.title,p.detail,p.criterion_source,p.criterion_field,p.criterion_value,p.published_at,
                   (select count(*) from vera.messages m where m.promotion_id=p.id) as recipients
            from vera.promotions p order by p.published_at desc nulls last, p.created_at desc
            """
        ).fetchall()


@router.get("/messages")
def admin_messages(admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        return conn.execute(
            """
            select m.id,m.message_type,m.title,m.body,m.is_read,m.created_at,m.read_at,
                   c.full_name as client_name, v.plate
            from vera.messages m join vera.clients c on c.id=m.client_id
            left join vera.vehicles v on v.id=m.vehicle_id
            order by m.created_at desc limit 300
            """
        ).fetchall()


@router.get("/reminders")
def reminders(admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        return conn.execute(
            """
            select r.id,r.due_date,r.notify_at,r.status,r.sent_at,v.plate,v.model,c.full_name as client_name
            from vera.reminders r join vera.vehicles v on v.id=r.vehicle_id join vera.clients c on c.id=v.client_id
            order by coalesce(r.notify_at, r.due_date::timestamptz) nulls last
            """
        ).fetchall()


def _promotion_clients(payload: PromotionInput) -> list[UUID]:
    value = f"%{payload.criterion_value.strip()}%"
    with connection() as conn:
        if payload.criterion_source == "vehicle" and payload.criterion_field == "model":
            rows = conn.execute("select distinct client_id from vera.vehicles where model ilike %s", (value,)).fetchall()
        elif payload.criterion_source == "service" and payload.criterion_field == "oil":
            rows = conn.execute(
                "select distinct v.client_id from vera.services s join vera.vehicles v on v.id=s.vehicle_id where s.oil ilike %s",
                (value,),
            ).fetchall()
        else:
            raise HTTPException(status_code=400, detail="Criterio de promocion no aprobado")
    return [r["client_id"] for r in rows]
