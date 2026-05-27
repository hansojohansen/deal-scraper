from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car
from backend.dependencies import get_db
from backend.schemas.stats import (
    BrandStatsResponse,
    KmBucket,
    ModelSoldStats,
    ModelStatsResponse,
    PriceTrendPoint,
    SoldStatsResponse,
    StatsSummaryResponse,
)

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])

@router.get("/summary", response_model=StatsSummaryResponse)
async def stats_summary(db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(func.count(Car.id), func.avg(Car.price), func.percentile_cont(0.5).within_group(Car.price))
        .where(Car.status == "active", Car.price.is_not(None))
    )
    total, avg_price, median_price = r.one()
    today = datetime.now(UTC).date()
    r2 = await db.execute(
        select(func.count(Car.id)).where(func.date(Car.first_seen_at) == today)
    )
    new_today = r2.scalar() or 0
    buckets_sql = text("""
        SELECT
          CASE
            WHEN mileage < 30000 THEN '0-30k'
            WHEN mileage < 60000 THEN '30k-60k'
            WHEN mileage < 100000 THEN '60k-100k'
            WHEN mileage < 150000 THEN '100k-150k'
            ELSE '150k+' END AS label,
          ROUND(AVG(price)) AS avg_price,
          COUNT(*) AS cnt
        FROM cars WHERE status='active' AND price IS NOT NULL AND mileage IS NOT NULL
        GROUP BY 1 ORDER BY MIN(mileage)
    """)
    r3 = await db.execute(buckets_sql)
    buckets = [KmBucket(label=row[0], avg_price=int(row[1]), count=row[2]) for row in r3]
    trend_sql = text("""
        SELECT DATE(recorded_at) AS day, ROUND(AVG(price)) AS avg_price
        FROM price_history
        WHERE recorded_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
    """)
    r4 = await db.execute(trend_sql)
    trend = [PriceTrendPoint(date=str(row[0]), avg_price=int(row[1])) for row in r4]
    return StatsSummaryResponse(
        total_listings=total or 0,
        avg_price=int(avg_price or 0),
        median_price=int(median_price or 0),
        new_today=new_today,
        price_by_km_buckets=buckets,
        price_trend_30d=trend,
    )

@router.get("/brands", response_model=list[BrandStatsResponse])
async def brands_stats(db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(Car.brand, func.count(Car.id), func.avg(Car.price))
        .where(Car.status == "active", Car.brand.is_not(None))
        .group_by(Car.brand).order_by(func.count(Car.id).desc()).limit(30)
    )
    return [BrandStatsResponse(brand=row[0], count=row[1], avg_price=int(row[2] or 0)) for row in r]

@router.get("/models", response_model=list[ModelStatsResponse])
async def models_stats(brand: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(
            Car.model,
            func.count(Car.id),
            func.avg(Car.price),
            func.min(Car.price),
            func.max(Car.price),
        )
        .where(
            Car.status == "active",
            Car.brand.ilike(brand),
            Car.model.is_not(None),
            Car.price.is_not(None),
        )
        .group_by(Car.model)
        .order_by(func.count(Car.id).desc())
        .limit(50)
    )
    return [
        ModelStatsResponse(
            model=row[0],
            count=row[1],
            avg_price=int(row[2] or 0),
            min_price=int(row[3] or 0),
            max_price=int(row[4] or 0),
        )
        for row in r
    ]

@router.get("/sold", response_model=SoldStatsResponse)
async def sold_stats(
    brand: str | None = None,
    model: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Statistics derived from listings that have been removed (likely sold)."""
    total_r = await db.execute(
        select(func.count(Car.id)).where(Car.status == "removed")
    )
    total_removed = total_r.scalar() or 0

    q = (
        select(
            Car.brand,
            Car.model,
            func.count(Car.id).label("sold_count"),
            func.avg(
                func.extract("epoch", Car.last_seen_at - Car.first_seen_at) / 86400
            ).label("avg_days"),
            func.avg(Car.price).label("avg_price"),
            func.min(Car.price).label("min_price"),
            func.max(Car.price).label("max_price"),
        )
        .where(Car.status == "removed", Car.brand.is_not(None), Car.model.is_not(None))
        .group_by(Car.brand, Car.model)
        .order_by(func.count(Car.id).desc())
        .limit(200)
    )
    if brand:
        q = q.where(Car.brand.ilike(f"%{brand}%"))
    if model:
        q = q.where(Car.model.ilike(f"%{model}%"))

    result = await db.execute(q)
    rows = result.all()

    return SoldStatsResponse(
        total_removed=total_removed,
        by_model=[
            ModelSoldStats(
                brand=r.brand,
                model=r.model,
                sold_count=r.sold_count,
                avg_days_on_market=round(float(r.avg_days), 1) if r.avg_days else None,
                avg_last_price=int(r.avg_price) if r.avg_price else None,
                min_last_price=int(r.min_price) if r.min_price else None,
                max_last_price=int(r.max_price) if r.max_price else None,
            )
            for r in rows
        ],
    )