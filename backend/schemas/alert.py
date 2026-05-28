from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AlertCreate(BaseModel):
    brand: str | None = None
    model: str | None = None
    year_min: int | None = None
    year_max: int | None = None
    price_max: int | None = None
    mileage_max: int | None = None
    fuel_type: str | None = None
    min_discount_pct: int | None = None


class AlertUpdate(BaseModel):
    is_active: bool | None = None
    price_max: int | None = None
    mileage_max: int | None = None
    year_min: int | None = None
    year_max: int | None = None
    fuel_type: str | None = None
    min_discount_pct: int | None = None


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    notify_email: str
    brand: str | None
    model: str | None
    year_min: int | None
    year_max: int | None
    price_max: int | None
    mileage_max: int | None
    fuel_type: str | None
    is_active: bool
    min_discount_pct: int | None
    created_at: datetime
