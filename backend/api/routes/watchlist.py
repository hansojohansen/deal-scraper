"""Watchlist endpoints — save/unsave/list cars. All routes require auth."""
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import watchlist as watchlist_crud
from backend.db.models import Car, User
from backend.dependencies import get_current_user, get_db
from backend.exceptions import ApiError
from backend.schemas.car import CarSummaryResponse
from backend.scoring.chips import compute_score_chips

router = APIRouter(prefix="/api/v1/watchlist", tags=["watchlist"])


class AddBody(BaseModel):
    car_id: int


@router.get("", response_model=list[CarSummaryResponse])
async def list_watchlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cars = await watchlist_crud.get_cars(db, current_user.id)
    result = []
    for car in cars:
        item = CarSummaryResponse.model_validate(car)
        item.score_chips = compute_score_chips(car, car.outlier_score)
        result.append(item)
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    body: AddBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    car_check = await db.execute(select(Car.id).where(Car.id == body.car_id))
    if not car_check.scalar_one_or_none():
        raise ApiError(code="not_found", message="Car not found", status=404)
    if await watchlist_crud.is_saved(db, current_user.id, body.car_id):
        raise ApiError(code="already_saved", message="Already in watchlist", status=409)
    await watchlist_crud.add_item(db, current_user.id, body.car_id)
    await db.commit()
    return {"saved": True}


@router.delete("/{car_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    car_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    removed = await watchlist_crud.remove_item(db, current_user.id, car_id)
    if not removed:
        raise ApiError(code="not_found", message="Not in watchlist", status=404)
    await db.commit()
