from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import outliers as outlier_crud
from backend.db.models import Car
from backend.dependencies import get_db
from backend.schemas.outlier import OutlierResponse, PeerCarResponse

router = APIRouter(prefix="/api/v1/outliers", tags=["outliers"])


@router.get("", response_model=list[OutlierResponse])
async def list_outliers(
    limit: int = Query(50, ge=1, le=100),
    quality_tier: str | None = Query(None, description="Filter by quality tier: excellent, good, check, skip"),
    db: AsyncSession = Depends(get_db),
):
    rows = await outlier_crud.get_all(db, limit=limit)
    result = []
    for outlier, car in rows:
        if quality_tier and outlier.quality_tier != quality_tier:
            continue
        result.append(OutlierResponse(
            id=outlier.id, car_id=outlier.car_id, score=outlier.score,
            reason=outlier.reason, peer_group_size=outlier.peer_group_size,
            peer_avg_price=outlier.peer_avg_price, detected_at=outlier.detected_at,
            brand=car.brand, model=car.model, year=car.year,
            mileage=car.mileage, price=car.price, url=car.url, title=car.title,
            fair_value=outlier.fair_value, method=outlier.method, quality_tier=outlier.quality_tier,
        ))
    return result


@router.get("/{car_id}/peers", response_model=list[PeerCarResponse])
async def get_outlier_peers(
    car_id: int,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Car).where(Car.id == car_id))
    car = result.scalar_one_or_none()
    if car is None:
        raise HTTPException(status_code=404, detail="Car not found")

    peers = await outlier_crud.get_peers(
        db, car_id=car_id, brand=car.brand, model=car.model,
        year=car.year, mileage=car.mileage, limit=limit,
    )
    return [PeerCarResponse.model_validate(p) for p in peers]
