from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car, PriceHistory


async def get_by_url(db: AsyncSession, url: str) -> Car | None:
    result = await db.execute(select(Car).where(Car.url == url))
    return result.scalar_one_or_none()


async def get_existing_urls(db: AsyncSession, urls: list[str]) -> set[str]:
    """Return which of the given URLs already exist in the DB."""
    if not urls:
        return set()
    result = await db.execute(select(Car.url).where(Car.url.in_(urls)))
    return {row[0] for row in result}


async def upsert_car(db: AsyncSession, item: dict) -> tuple[Car, bool]:
    """
    Insert or update a car. Returns (car, is_new).
    Always writes a price_history row if price changed or car is new.
    """
    existing = await get_by_url(db, item["url"])

    now = datetime.now(UTC)
    price = item.get("price")

    if existing is None:
        car = Car(
            source_id=item["source_id"],
            url=item["url"],
            source=item["source"],
            title=item.get("title"),
            brand=item.get("brand"),
            model=item.get("model"),
            year=item.get("year"),
            mileage=item.get("mileage"),
            fuel_type=item.get("fuel_type"),
            transmission=item.get("transmission"),
            price=price,
            location=item.get("location"),
            features=item.get("features", {}),
            status="active",
            last_seen_at=now,
        )
        db.add(car)
        await db.flush()  # get car.id

        if price is not None:
            db.add(PriceHistory(car_id=car.id, price=price))

        return car, True

    else:
        # Update last_seen and status
        existing.last_seen_at = now
        existing.status = "active"

        # Write price history row only when price changes
        if price is not None and price != existing.price:
            existing.price = price
            db.add(PriceHistory(car_id=existing.id, price=price))

        return existing, False


async def mark_unseen_as_removed(db: AsyncSession, seen_urls: set[str], source: str) -> int:
    """Mark listings not seen in the current run as 'removed'. Returns count."""
    if not seen_urls:
        return 0
    result = await db.execute(
        update(Car)
        .where(Car.source == source, Car.status == "active", Car.url.not_in(seen_urls))
        .values(status="removed")
        .returning(Car.id)
    )
    return len(result.fetchall())
