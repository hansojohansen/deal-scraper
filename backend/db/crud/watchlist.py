"""Watchlist CRUD — saved car listings per user."""
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.models import Car, WatchlistItem


async def add_item(db: AsyncSession, user_id: uuid.UUID, car_id: int) -> WatchlistItem:
    item = WatchlistItem(user_id=user_id, car_id=car_id)
    db.add(item)
    await db.flush()
    return item


async def remove_item(db: AsyncSession, user_id: uuid.UUID, car_id: int) -> bool:
    r = await db.execute(
        delete(WatchlistItem).where(
            WatchlistItem.user_id == user_id, WatchlistItem.car_id == car_id
        )
    )
    return r.rowcount > 0


async def get_cars(db: AsyncSession, user_id: uuid.UUID) -> list[Car]:
    result = await db.execute(
        select(WatchlistItem)
        .where(WatchlistItem.user_id == user_id)
        .options(selectinload(WatchlistItem.car).selectinload(Car.outlier_score))
        .order_by(WatchlistItem.created_at.desc())
    )
    return [row.car for row in result.scalars()]


async def is_saved(db: AsyncSession, user_id: uuid.UUID, car_id: int) -> bool:
    result = await db.execute(
        select(WatchlistItem.id).where(
            WatchlistItem.user_id == user_id, WatchlistItem.car_id == car_id
        )
    )
    return result.scalar_one_or_none() is not None
