from datetime import UTC, datetime, timedelta

from sqlalchemy import Integer, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.db.models import Car, PriceHistory

_PRICE_DROP_TTL_DAYS = 14


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
            listing_type=item.get("listing_type"),
            horsepower=item.get("horsepower"),
            body_type=item.get("body_type"),
            engine_size_cc=item.get("engine_size_cc"),
            image_url=item.get("image_url"),
            trim_level=item.get("trim_level"),
            last_seen_at=now,
        )
        db.add(car)
        await db.flush()  # get car.id

        if price is not None:
            db.add(PriceHistory(car_id=car.id, price=price))

        return car, True

    else:
        existing.last_seen_at = now
        existing.status = "active"
        if item.get("image_url") and not existing.image_url:
            existing.image_url = item["image_url"]
        if item.get("trim_level") and not existing.trim_level:
            existing.trim_level = item["trim_level"]

        features = dict(existing.features or {})
        drop_at_str = features.get("price_dropped_at")
        if drop_at_str:
            try:
                drop_at = datetime.fromisoformat(drop_at_str)
                if now - drop_at > timedelta(days=_PRICE_DROP_TTL_DAYS):
                    features.pop("price_dropped_recently", None)
                    features.pop("price_dropped_at", None)
            except ValueError:
                pass

        if price is not None and price != existing.price:
            if existing.price is not None and price < existing.price:
                features["price_dropped_recently"] = True
                features["price_dropped_at"] = now.isoformat()
            existing.price = price
            db.add(PriceHistory(car_id=existing.id, price=price))

        existing.features = features
        flag_modified(existing, "features")

        return existing, False


async def mark_unseen_as_removed(db: AsyncSession, seen_urls: set[str], source: str) -> int:
    """Mark listings not seen in the current run as 'removed'. Stores dom_days. Returns count."""
    if not seen_urls:
        return 0
    result = await db.execute(
        update(Car)
        .where(Car.source == source, Car.status == "active", Car.url.not_in(seen_urls))
        .values(
            status="removed",
            dom_days=cast(
                func.extract("epoch", func.now() - Car.first_seen_at) / 86400,
                Integer,
            ),
        )
        .returning(Car.id)
    )
    return len(result.fetchall())
