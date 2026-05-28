from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car, OutlierScore


async def get_all(db: AsyncSession, limit: int = 50) -> list[tuple]:
    result = await db.execute(
        select(OutlierScore, Car)
        .join(Car, Car.id == OutlierScore.car_id)
        .order_by(OutlierScore.score.asc())
        .limit(limit)
    )
    return result.all()

async def get_by_car_id(db: AsyncSession, car_id: int) -> OutlierScore | None:
    result = await db.execute(select(OutlierScore).where(OutlierScore.car_id == car_id))
    return result.scalar_one_or_none()

async def upsert(db: AsyncSession, car_id: int, score: float, reason: str, peer_group_size: int, peer_avg_price: int) -> OutlierScore:
    existing = await get_by_car_id(db, car_id)
    if existing:
        existing.score = score
        existing.reason = reason
        existing.peer_group_size = peer_group_size
        existing.peer_avg_price = peer_avg_price
        return existing
    outlier = OutlierScore(car_id=car_id, score=score, reason=reason, peer_group_size=peer_group_size, peer_avg_price=peer_avg_price)
    db.add(outlier)
    return outlier

async def delete_by_car_id(db: AsyncSession, car_id: int) -> None:
    await db.execute(delete(OutlierScore).where(OutlierScore.car_id == car_id))


async def get_peers(
    db: AsyncSession,
    car_id: int,
    brand: str | None,
    model: str | None,
    year: int | None,
    mileage: int | None,
    limit: int = 20,
) -> list[Car]:
    if not brand or not model:
        return []

    base = [Car.id != car_id, Car.brand == brand, Car.model == model,
            Car.price.is_not(None), Car.status == "active"]

    narrow = list(base)
    if year is not None:
        narrow.append(Car.year.between(year - 2, year + 2))
    if mileage is not None:
        narrow.append(Car.mileage.between(mileage - 30000, mileage + 30000))

    result = await db.execute(
        select(Car).where(and_(*narrow)).order_by(Car.price.asc()).limit(limit)
    )
    peers = list(result.scalars())
    if len(peers) >= 5:
        return peers

    result = await db.execute(
        select(Car).where(and_(*base)).order_by(Car.price.asc()).limit(limit)
    )
    return list(result.scalars())
