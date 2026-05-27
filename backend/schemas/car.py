from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")

class PricePointResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    price: int
    recorded_at: datetime

class OutlierSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    score: float
    reason: str
    peer_group_size: int
    peer_avg_price: int

class CarSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    url: str
    title: str | None
    brand: str | None
    model: str | None
    year: int | None
    mileage: int | None
    fuel_type: str | None
    transmission: str | None
    price: int | None
    location: str | None
    status: str
    eu_inspected_at: date | None = None
    eu_next_deadline: date | None = None
    is_norwegian_reg: bool | None = None
    listing_type: str | None = None
    first_seen_at: datetime
    last_seen_at: datetime | None
    outlier_score: OutlierSummary | None = None

class CarDetailResponse(CarSummaryResponse):
    price_history: list[PricePointResponse] = []
    features: dict = {}

class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: int | None
    total: int | None = None
