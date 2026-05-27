from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OutlierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    car_id: int
    score: float
    reason: str
    peer_group_size: int
    peer_avg_price: int
    detected_at: datetime
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    mileage: int | None = None
    price: int | None = None
    url: str | None = None
    title: str | None = None
