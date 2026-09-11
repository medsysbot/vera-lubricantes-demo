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
    if not settings.database_url or not settings.admin_username or not settings.admin_password:
        return
    with connection() as conn:
        exists = conn.execute("select id from vera.admins limit 1").fetchone()
        if exists:
            return
        conn.execute(
            "insert into vera.admins (username, display_name, password_hash) values (%s, %s, %s)",
            (settings.admin_username, settings.admin_display_name, hash_password(settings.admin_password)),
        )


@router.post("/login")
def login(payload: AdminLogin, response: Response):
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
                (client["id"], v.plate.strip(), _clean(v.brand), v.model.strip(), _clean(v.description), v.year, v.current_mileage, admin.id),
            ).fetchone()
            conn.execute("insert into vera.client_access (client_id) values (%s)", (client["id"],))
            conn.execute(
                "insert into vera.admin_activity (admin_id, client_id, vehicle_id, action_type, description, reference) values (%s,%s,%s,'client_created','Cliente y vehiculo registrados',%s)",
                (admin.id, client["id"], vehicle["id"], vehicle["plate"]),
            )
        return {"client": client, "vehicle": vehicle}
    except Exception as exc:
        if "vehicles_plate_normalized_uq" in str(exc):
            raise HTTPException(status_code=409, detail="La patente ya esta registrada") from exc
        raise


@router.post("/clients/{client_id}/vehicles", status_code=201)
def add_vehicle(client_id: UUID, payload: VehicleInput, admin: AdminContext = Depends(require_admin)):
    try:
        with connection() as conn:
            client = conn.execute("select id from vera.clients where id=%s", (client_id,)).fetchone()
            if not client:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")
            vehicle = conn.execute(
                """
                insert into vera.vehicles (client_id, plate, brand, model, description, year, current_mileage, created_by_admin_id)
                values (%s,%s,%s,%s,%s,%s,%s,%s)
                returning id, plate, brand, model, description, year, current_mileage
                """,
                (client_id, payload.plate.strip(), _clean(payload.brand), payload.model.strip(), _clean(payload.description), payload.year, payload.current_mileage, admin.id),
            ).fetchone()
            conn.execute(
                "insert into vera.admin_activity (admin_id, client_id, vehicle_id, action_type, description, reference) values (%s,%s,%s,'vehicle_created','Vehiculo agregado al cliente',%s)",
                (admin.id, client_id, vehicle["id"], vehicle["plate"]),
            )
        return vehicle
    except Exception as exc:
        if "vehicles_plate_normalized_uq" in str(exc):
            raise HTTPException(status_code=409, detail="La patente ya esta registrada") from exc
        raise


@router.delete("/clients/{client_id}")
def delete_client(client_id: UUID, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        deleted = conn.execute("delete from vera.clients where id=%s returning id", (client_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description) values (%s,'client_deleted','Cliente eliminado completamente')",
            (admin.id,),
        )
    return {"ok": True}


@router.get("/vehicles")
def list_vehicles(search: str = "", admin: AdminContext = Depends(require_admin)):
    term = search.strip()
    pattern = f"%{term}%"
    with connection() as conn:
        rows = conn.execute(
            """
            select v.id, v.client_id, v.plate, v.brand, v.model, v.description, v.year, v.current_mileage,
                   c.full_name as client_name, c.phone,
                   (select max(service_date) from vera.services s where s.vehicle_id=v.id) as last_service_date
            from vera.vehicles v join vera.clients c on c.id=v.client_id
            where (%s='' or v.plate ilike %s or v.model ilike %s or c.full_name ilike %s)
            order by v.updated_at desc
            limit 250
            """,
            (term, pattern, pattern, pattern),
        ).fetchall()
    return rows


@router.get("/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: UUID, admin: AdminContext = Depends(require_admin)):
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


@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: UUID, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        row = conn.execute("select client_id, plate from vera.vehicles where id=%s", (vehicle_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
        conn.execute("delete from vera.vehicles where id=%s", (vehicle_id,))
        conn.execute(
            "insert into vera.admin_activity (admin_id, client_id, action_type, description) values (%s,%s,'vehicle_deleted','Vehiculo e historial eliminados')",
            (admin.id, row["client_id"]),
        )
    return {"ok": True}


@router.post("/vehicles/{vehicle_id}/services", status_code=201)
def create_service(vehicle_id: UUID, payload: ServiceInput, admin: AdminContext = Depends(require_admin)):
    values = _service_values(payload)
    with connection() as conn:
        vehicle = conn.execute("select client_id, plate from vera.vehicles where id=%s", (vehicle_id,)).fetchone()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
        placeholders = ",".join(["%s"] * len(SERVICE_COLUMNS))
        columns = ",".join(SERVICE_COLUMNS)
        service = conn.execute(
            f"insert into vera.services (vehicle_id,{columns},created_by_admin_id) values (%s,{placeholders},%s) returning *",
            (vehicle_id, *values, admin.id),
        ).fetchone()
        conn.execute("update vera.vehicles set current_mileage=%s where id=%s", (payload.mileage, vehicle_id))
        conn.execute(
            "insert into vera.admin_activity (admin_id, client_id, vehicle_id, service_id, action_type, description, reference) values (%s,%s,%s,%s,'service_created','Nuevo servicio registrado',%s)",
            (admin.id, vehicle["client_id"], vehicle_id, service["id"], vehicle["plate"]),
        )
    return service


@router.put("/services/{service_id}")
def correct_service(service_id: UUID, payload: ServiceInput, admin: AdminContext = Depends(require_admin)):
    values = _service_values(payload)
    with connection() as conn:
        old = conn.execute("select * from vera.services where id=%s for update", (service_id,)).fetchone()
        if not old:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        assignments = ",".join(f"{column}=%s" for column in SERVICE_COLUMNS)
        new = conn.execute(
            f"update vera.services set {assignments} where id=%s returning *",
            (*values, service_id),
        ).fetchone()
        before = {k: old[k] for k in SERVICE_COLUMNS}
        after = {k: new[k] for k in SERVICE_COLUMNS}
        if before != after:
            conn.execute(
                "insert into vera.service_corrections (service_id, changed_by_admin_id, before_data, after_data) values (%s,%s,%s,%s)",
                (service_id, admin.id, Jsonb(jsonable_encoder(before)), Jsonb(jsonable_encoder(after))),
            )
            conn.execute(
                "insert into vera.admin_activity (admin_id, vehicle_id, service_id, action_type, description) values (%s,%s,%s,'service_corrected','Servicio corregido')",
                (admin.id, old["vehicle_id"], service_id),
            )
        latest = conn.execute(
            "select mileage from vera.services where vehicle_id=%s order by service_date desc, created_at desc limit 1",
            (old["vehicle_id"],),
        ).fetchone()
        if latest:
            conn.execute("update vera.vehicles set current_mileage=%s where id=%s", (latest["mileage"], old["vehicle_id"]))
    return new


@router.post("/clients/{client_id}/access/qr")
def create_access_qr(client_id: UUID, payload: AccessQrRequest, request: Request, admin: AdminContext = Depends(require_admin)):
    raw = random_token()
    token_hash = hash_token(raw, "access-qr")
    expires = utcnow() + timedelta(minutes=settings.qr_ttl_minutes)
    with connection() as conn:
        client = conn.execute("select id, full_name from vera.clients where id=%s", (client_id,)).fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        conn.execute(
            "update vera.qr_tokens set used_at=now() where client_id=%s and purpose=%s and used_at is null",
            (client_id, payload.purpose),
        )
        conn.execute(
            "insert into vera.qr_tokens (client_id, purpose, token_hash, created_by_admin_id, expires_at) values (%s,%s,%s,%s,%s)",
            (client_id, payload.purpose, token_hash, admin.id, expires),
        )
    base = (settings.app_base_url or str(request.base_url)).rstrip("/")
    url = f"{base}/activate?token={raw}"
    factory = qrcode.image.svg.SvgPathImage
    image = qrcode.make(url, image_factory=factory, box_size=8, border=2)
    buf = BytesIO()
    image.save(buf)
    data_url = "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    return {"client_name": client["full_name"], "purpose": payload.purpose, "expires_at": expires, "url": url, "qr": data_url}


@router.post("/promotions/preview")
def preview_promotion(payload: PromotionInput, admin: AdminContext = Depends(require_admin)):
    matches = _promotion_matches(payload)
    return {"matches": matches, "count": len(matches)}


@router.post("/promotions", status_code=201)
def publish_promotion(payload: PromotionInput, admin: AdminContext = Depends(require_admin)):
    matches = _promotion_matches(payload)
    with connection() as conn:
        promo = conn.execute(
            """
            insert into vera.promotions (title, detail, criterion_source, criterion_field, criterion_value, created_by_admin_id)
            values (%s,%s,%s,%s,%s,%s) returning *
            """,
            (payload.title.strip(), payload.detail.strip(), payload.criterion_source, payload.criterion_field, payload.criterion_value.strip(), admin.id),
        ).fetchone()
        for match in matches:
            conn.execute(
                """
                insert into vera.messages (client_id, vehicle_id, promotion_id, message_type, title, body)
                values (%s,%s,%s,'promotion',%s,%s)
                on conflict (promotion_id, client_id) where promotion_id is not null do nothing
                """,
                (match["client_id"], match["vehicle_id"], promo["id"], promo["title"], promo["detail"]),
            )
        conn.execute(
            "insert into vera.admin_activity (admin_id, promotion_id, action_type, description, reference) values (%s,%s,'promotion_published','Promocion publicada',%s)",
            (admin.id, promo["id"], promo["title"]),
        )
    for match in matches:
        _push_client(match["client_id"], {"title": payload.title, "body": payload.detail, "url": "/"})
    return {"promotion": promo, "recipients": len(matches)}


@router.get("/promotions")
def list_promotions(admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        rows = conn.execute(
            "select p.*, (select count(*) from vera.messages m where m.promotion_id=p.id) as recipients from vera.promotions p order by published_at desc limit 100"
        ).fetchall()
    return rows


@router.get("/messages")
def list_messages(admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        rows = conn.execute(
            """
            select m.id, m.message_type, m.title, m.body, m.is_read, m.created_at, m.read_at,
                   c.full_name as client_name, v.plate
            from vera.messages m
            join vera.clients c on c.id=m.client_id
            left join vera.vehicles v on v.id=m.vehicle_id
            order by m.created_at desc limit 300
            """
        ).fetchall()
    return rows


@router.get("/reminders")
def list_reminders(admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        rows = conn.execute(
            """
            select r.*, v.plate, v.model, c.full_name as client_name
            from vera.reminders r
            join vera.vehicles v on v.id=r.vehicle_id
            join vera.clients c on c.id=v.client_id
            order by r.notify_at desc limit 200
            """
        ).fetchall()
    return rows


def _service_values(payload: ServiceInput) -> tuple:
    data = payload.model_dump()
    return tuple(_clean(data[column]) if isinstance(data[column], str) else data[column] for column in SERVICE_COLUMNS)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _promotion_matches(payload: PromotionInput) -> list[dict]:
    value = payload.criterion_value.strip()
    if payload.criterion_source == "vehicle" and payload.criterion_field == "model":
        sql = """
            select distinct on (c.id) c.id as client_id, c.full_name as client_name,
                   v.id as vehicle_id, v.plate, v.model
            from vera.clients c join vera.vehicles v on v.client_id=c.id
            where v.model ilike %s
            order by c.id, v.updated_at desc
        """
    elif payload.criterion_source == "service" and payload.criterion_field == "oil":
        sql = """
            select distinct on (c.id) c.id as client_id, c.full_name as client_name,
                   v.id as vehicle_id, v.plate, v.model
            from vera.clients c
            join vera.vehicles v on v.client_id=c.id
            join vera.services s on s.vehicle_id=v.id
            where s.oil ilike %s
            order by c.id, s.service_date desc, s.created_at desc
        """
    else:
        raise HTTPException(status_code=400, detail="Criterio de promocion no aprobado")
    with connection() as conn:
        return conn.execute(sql, (f"%{value}%",)).fetchall()


def _push_client(client_id: UUID, payload: dict) -> None:
    with connection() as conn:
        subscription = conn.execute(
            "select endpoint, p256dh, auth from vera.push_subscriptions where client_id=%s",
            (client_id,),
        ).fetchone()
    if subscription:
        send_push(subscription, payload)
