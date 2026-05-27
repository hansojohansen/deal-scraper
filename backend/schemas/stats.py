from pydantic import BaseModel


class KmBucket(BaseModel):
    label: str
    avg_price: int
    count: int

class PriceTrendPoint(BaseModel):
    date: str
    avg_price: int

class StatsSummaryResponse(BaseModel):
    total_listings: int
    avg_price: int
    median_price: int
    new_today: int
    price_by_km_buckets: list[KmBucket]
    price_trend_30d: list[PriceTrendPoint]

class BrandStatsResponse(BaseModel):
    brand: str
    count: int
    avg_price: int

class ModelStatsResponse(BaseModel):
    model: str
    count: int
    avg_price: int
    min_price: int
    max_price: int


class ModelSoldStats(BaseModel):
    brand: str
    model: str
    sold_count: int
    avg_days_on_market: float | None
    avg_last_price: int | None
    min_last_price: int | None
    max_last_price: int | None


class SoldStatsResponse(BaseModel):
    total_removed: int
    by_model: list[ModelSoldStats]