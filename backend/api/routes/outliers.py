from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import outliers as outlier_crud
from backend.dependencies import get_db
from backend.schemas.outlier import OutlierResponse

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
