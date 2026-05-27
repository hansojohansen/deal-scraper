from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.models import Car, PriceHistory
from backend.dependencies import CursorPagination, get_db
from backend.exceptions import ApiError
from backend.schemas.car import (
    CarDetailResponse,
    CarSummaryResponse,
    CursorPage,
    PricePointResponse,
)

router = APIRouter(prefix="/api/v1/cars", tags=["cars"])


@router.get("", response_model=CursorPage[CarSummaryResponse])
async def list_cars(
    pagination: CursorPagination = Depends(),
    brand: str | None = None,
    model: str | None = None,
    title: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    price_min: int | None = None,
    price_max: int | None = None,
    mileage_max: int | None = None,
    fuel_type: str | None = None,
    listing_type: str | None = None,
    body_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Car).options(selectinload(Car.outlier_score)).where(Car.status == "active")
    if pagination.cursor:
        q = q.where(Car.id > pagination.cursor)
    if brand:
        q = q.where(Car.brand.ilike(f"%{brand}%"))
    if model:
        q = q.where(Car.model.ilike(f"%{model}%"))
    if title:
        q = q.where(Car.title.ilike(f"%{title}%"))
    if year_min:
        q = q.where(Car.year >= year_min)
    if year_max:
        q = q.where(Car.year <= year_max)
    if price_min:
        q = q.where(Car.price >= price_min)
    if price_max:
        q = q.where(Car.price <= price_max)
    if mileage_max:
        q = q.where(Car.mileage <= mileage_max)
    if fuel_type:
        q = q.where(Car.fuel_type.ilike(f"%{fuel_type}%"))
    if listing_type:
        q = q.where(Car.listing_type == listing_type)
    if body_type:
        q = q.where(Car.body_type.ilike(f"%{body_type}%"))
    q = q.order_by(Car.id).limit(pagination.limit + 1)
    result = await db.execute(q)
    cars = list(result.scalars())
    next_cursor = cars[-1].id if len(cars) > pagination.limit else None
    return CursorPage(items=cars[:pagination.limit], next_cursor=next_cursor)


@router.get("/brands/{brand}/models", response_model=list[str])
async def get_models_by_brand(brand: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Car.model, func.count(Car.id).label("cnt"))
        .where(Car.brand.ilike(brand), Car.model.is_not(None))
        .group_by(Car.model)
        .order_by(func.count(Car.id).desc())
    )
    return [row[0] for row in result]


@router.get("/{car_id}", response_model=CarDetailResponse)
async def get_car(car_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Car).options(selectinload(Car.outlier_score), selectinload(Car.price_history)).where(Car.id == car_id)
    )
    car = result.scalar_one_or_none()
    if not car:
        raise ApiError(code="not_found", message="Car not found", status=404)
    return car


@router.get("/{car_id}/price-history", response_model=list[PricePointResponse])
async def get_price_history(car_id: int, db: AsyncSession = Depends(get_db)):
    car_check = await db.execute(select(Car.id).where(Car.id == car_id))
    if not car_check.scalar_one_or_none():
        raise ApiError(code="not_found", message="Car not found", status=404)
    result = await db.execute(
        select(PriceHistory)
        .where(PriceHistory.car_id == car_id)
        .order_by(PriceHistory.recorded_at.asc())
    )
    return list(result.scalars())
