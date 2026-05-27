from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr

class AlertCreate(BaseModel):
    notify_email: EmailStr
    brand: str | None = None
    model: str | None = None
    year_min: int | None = None
    year_max: int | None = None
    price_max: int | None = None
    mileage_max: int | None = None
    fuel_type: str | None = None

class AlertUpdate(BaseModel):
    is_active: bool | None = None
    price_max: int | None = None
    mileage_max: int | None = None

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
    created_at: datetime
