from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import AlertMatch, Car, DealAlert

_ALERT_CREATE_FIELDS = {"notify_email", "brand", "model", "year_min", "year_max", "price_max", "mileage_max", "fuel_type", "is_active"}
_ALERT_UPDATE_FIELDS = {"is_active", "price_max", "mileage_max", "year_min", "year_max", "fuel_type"}

async def create(db: AsyncSession, data: dict) -> DealAlert:
    safe = {k: v for k, v in data.items() if k in _ALERT_CREATE_FIELDS}
    alert = DealAlert(**safe)
    db.add(alert)
    await db.flush()
    return alert

async def get_by_id(db: AsyncSession, alert_id: int) -> DealAlert | None:
    result = await db.execute(select(DealAlert).where(DealAlert.id == alert_id))
    return result.scalar_one_or_none()

async def list_active(db: AsyncSession, cursor: int | None = None, limit: int = 20) -> list[DealAlert]:
    q = select(DealAlert).where(DealAlert.is_active.is_(True))
    if cursor:
        q = q.where(DealAlert.id > cursor)
    q = q.order_by(DealAlert.id).limit(limit)
    result = await db.execute(q)
    return list(result.scalars())

async def update(db: AsyncSession, alert: DealAlert, data: dict) -> DealAlert:
    for k, v in data.items():
        if k in _ALERT_UPDATE_FIELDS and v is not None:
            setattr(alert, k, v)
    return alert

async def delete(db: AsyncSession, alert: DealAlert) -> None:
    await db.delete(alert)

async def match_for_car(db: AsyncSession, car: Car) -> list[DealAlert]:
    q = select(DealAlert).where(DealAlert.is_active.is_(True))
    if car.brand:
        q = q.where((DealAlert.brand.is_(None)) | (DealAlert.brand == car.brand))
    if car.model:
        q = q.where((DealAlert.model.is_(None)) | (DealAlert.model == car.model))
    if car.price:
        q = q.where((DealAlert.price_max.is_(None)) | (DealAlert.price_max >= car.price))
    if car.mileage:
        q = q.where((DealAlert.mileage_max.is_(None)) | (DealAlert.mileage_max >= car.mileage))
    result = await db.execute(q)
    alerts = list(result.scalars())
    if alerts:
        matched = await db.execute(
            select(AlertMatch.alert_id).where(
                AlertMatch.car_id == car.id,
                AlertMatch.alert_id.in_([a.id for a in alerts])
            )
        )
        already = {r[0] for r in matched}
        alerts = [a for a in alerts if a.id not in already]
    return alerts

async def record_match(db: AsyncSession, alert_id: int, car_id: int, score: float | None) -> None:
    db.add(AlertMatch(alert_id=alert_id, car_id=car_id, score=score))

