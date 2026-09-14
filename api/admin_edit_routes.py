from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from api.auth import AdminContext, require_admin
from api.db import connection
from api.models import VehicleInput

router = APIRouter(prefix="/api/admin", tags=["admin"])


class VehicleProfileInput(VehicleInput):
    id: UUID


class ClientProfileInput(BaseModel):
    full_name: str = Field(min_length=1, max_length=180)
    phone: str = Field(min_length=1, max_length=80)
    vehicles: list[VehicleProfileInput] = Field(default_factory=list, max_length=50)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


@router.get("/clients/{client_id}/profile")
def client_profile(client_id: UUID, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        client = conn.execute(
            "select id, full_name, phone from vera.clients where id=%s",
            (client_id,),
        ).fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        vehicles = conn.execute(
            """
            select id, plate, brand, model, description, year, current_mileage
            from vera.vehicles
            where client_id=%s
            order by created_at, plate
            """,
            (client_id,),
        ).fetchall()
    return {"client": client, "vehicles": vehicles}


@router.put("/clients/{client_id}/profile")
def update_client_profile(
    client_id: UUID,
    payload: ClientProfileInput,
    admin: AdminContext = Depends(require_admin),
):
    full_name = payload.full_name.strip()
    phone = payload.phone.strip()
    vehicle_ids = [vehicle.id for vehicle in payload.vehicles]
    if len(vehicle_ids) != len(set(vehicle_ids)):
        raise HTTPException(status_code=400, detail="Hay vehículos repetidos en la edición")

    try:
        with connection() as conn:
            client = conn.execute(
                "select id from vera.clients where id=%s for update",
                (client_id,),
            ).fetchone()
            if not client:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")

            if vehicle_ids:
                owned_rows = conn.execute(
                    "select id from vera.vehicles where client_id=%s and id=any(%s)",
                    (client_id, vehicle_ids),
                ).fetchall()
                owned_ids = {row["id"] for row in owned_rows}
                if owned_ids != set(vehicle_ids):
                    raise HTTPException(status_code=400, detail="Uno de los vehículos no pertenece al cliente")

            conn.execute(
                "update vera.clients set full_name=%s, phone=%s where id=%s",
                (full_name, phone, client_id),
            )

            for vehicle in payload.vehicles:
                conn.execute(
                    """
                    update vera.vehicles
                    set plate=%s, brand=%s, model=%s, description=%s, year=%s,
                        current_mileage=%s, updated_at=now()
                    where id=%s and client_id=%s
                    """,
                    (
                        vehicle.plate.strip().upper(),
                        _clean_optional(vehicle.brand),
                        vehicle.model.strip(),
                        _clean_optional(vehicle.description),
                        vehicle.year,
                        vehicle.current_mileage,
                        vehicle.id,
                        client_id,
                    ),
                )

            conn.execute(
                "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
                (admin.id, "client_profile_updated", f"Datos actualizados: {full_name}", str(client_id)),
            )

            updated_client = conn.execute(
                "select id, full_name, phone from vera.clients where id=%s",
                (client_id,),
            ).fetchone()
            updated_vehicles = conn.execute(
                """
                select id, plate, brand, model, description, year, current_mileage
                from vera.vehicles
                where client_id=%s
                order by created_at, plate
                """,
                (client_id,),
            ).fetchall()
    except HTTPException:
        raise
    except Exception as exc:
        if "unique" in str(exc).lower() or "vehicles_plate_key" in str(exc):
            raise HTTPException(status_code=409, detail="La patente ya está registrada") from exc
        raise

    return {"client": updated_client, "vehicles": updated_vehicles}


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(service_id: UUID, admin: AdminContext = Depends(require_admin)):
    with connection() as conn:
        service = conn.execute(
            """
            select s.id, s.vehicle_id, s.service_date, s.mileage, v.plate
            from vera.services s
            join vera.vehicles v on v.id=s.vehicle_id
            where s.id=%s
            for update
            """,
            (service_id,),
        ).fetchone()
        if not service:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")

        conn.execute("delete from vera.service_corrections where service_id=%s", (service_id,))
        conn.execute("delete from vera.services where id=%s", (service_id,))

        latest = conn.execute(
            """
            select mileage
            from vera.services
            where vehicle_id=%s
            order by service_date desc, created_at desc
            limit 1
            """,
            (service["vehicle_id"],),
        ).fetchone()
        if latest:
            conn.execute(
                "update vera.vehicles set current_mileage=%s, updated_at=now() where id=%s",
                (latest["mileage"], service["vehicle_id"]),
            )

        conn.execute(
            "insert into vera.admin_activity (admin_id, action_type, description, reference) values (%s,%s,%s,%s)",
            (admin.id, "service_deleted", f"Servicio eliminado de {service['plate']}", str(service_id)),
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
