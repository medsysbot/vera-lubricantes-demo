from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class AdminLogin(BaseModel):
    username: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=8, max_length=256)


class VehicleInput(BaseModel):
    plate: str = Field(min_length=1, max_length=24)
    brand: str | None = Field(default=None, max_length=120)
    model: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=240)
    year: int | None = Field(default=None, ge=1900, le=2200)
    current_mileage: int | None = Field(default=None, ge=0)


class ClientCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=180)
    phone: str = Field(min_length=1, max_length=80)
    vehicle: VehicleInput


class ServiceInput(BaseModel):
    service_date: date
    mileage: int = Field(ge=0)
    next_change_km: int | None = Field(default=None, ge=0)
    oil: str | None = Field(default=None, max_length=240)
    oil_type: str | None = Field(default=None, max_length=160)
    oil_filter: str | None = Field(default=None, max_length=240)
    fuel_filter: str | None = Field(default=None, max_length=240)
    air_filter: str | None = Field(default=None, max_length=240)
    cabin_filter: str | None = Field(default=None, max_length=240)
    spark_plugs: str | None = Field(default=None, max_length=240)
    gearbox_oil: str | None = Field(default=None, max_length=240)
    differential_oil: str | None = Field(default=None, max_length=240)
    grease: str | None = Field(default=None, max_length=240)
    hydraulic_fluid: str | None = Field(default=None, max_length=240)
    coolant: str | None = Field(default=None, max_length=240)
    brake_fluid: str | None = Field(default=None, max_length=240)
    tire_control: str | None = Field(default=None, max_length=240)
    tire_rotation: str | None = Field(default=None, max_length=240)
    battery: str | None = Field(default=None, max_length=240)
    observations: str | None = Field(default=None, max_length=4000)


class AccessQrRequest(BaseModel):
    purpose: Literal["activation", "pin_reset", "relink"]


class AccessComplete(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    pin_confirm: str = Field(pattern=r"^\d{4}$")


class ClientLogin(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")


class PushSubscriptionInput(BaseModel):
    endpoint: str = Field(min_length=10, max_length=3000)
    p256dh: str = Field(min_length=10, max_length=1000)
    auth: str = Field(min_length=5, max_length=1000)


class PromotionInput(BaseModel):
    title: str = Field(min_length=1, max_length=220)
    detail: str = Field(min_length=1, max_length=3000)
    audience_scope: Literal["history", "all"]
    criterion_value: str = Field(min_length=1, max_length=200)
