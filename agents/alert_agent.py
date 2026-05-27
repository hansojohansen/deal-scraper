"""
Alert dispatch agent — callable standalone from GitHub Actions or from the scraper.

Usage:
    python -m agents.alert_agent           # dispatch for all recently active cars
    python -m agents.alert_agent --car-id 42
"""
import argparse
import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from backend.db.session import session_factory
from backend.db.models import Car, OutlierScore
from backend.db.crud import alerts as alert_crud
from notifications.email import send_alert
from notifications.push_stub import send_push


async def dispatch_for_car(db, car: Car) -> int:
    outlier = car.outlier_score
    outlier_pct = None
    if outlier and outlier.peer_avg_price and car.price:
        outlier_pct = int(abs((car.price - outlier.peer_avg_price) / outlier.peer_avg_price * 100))

    matching = await alert_crud.match_for_car(db, car)
    sent = 0
    car_data = {
        "title": car.title, "brand": car.brand, "model": car.model,
        "year": car.year, "price": car.price, "mileage": car.mileage,
        "fuel_type": car.fuel_type, "url": car.url,
    }

    for alert in matching:
        ok = await send_alert(alert.notify_email, car_data, outlier_pct)
        if alert.notify_push and alert.push_token:
            await send_push(
                alert.push_token,
                title=f"Deal: {car.title}",
                body=f"{car.price:,} NOK" + (f" — {outlier_pct}% below market" if outlier_pct else ""),
                data={"car_id": str(car.id), "url": car.url},
            )
        score = outlier.score if outlier else None
        await alert_crud.record_match(db, alert.id, car.id, score)
        sent += 1

    if sent:
        await db.commit()
    return sent


async def run(car_id: int | None = None) -> dict:
    async with session_factory() as db:
        if car_id:
            result = await db.execute(
                select(Car).options(selectinload(Car.outlier_score)).where(Car.id == car_id)
            )
            cars = [c for c in [result.scalar_one_or_none()] if c]
        else:
            result = await db.execute(
                select(Car).options(selectinload(Car.outlier_score)).where(Car.status == "active")
            )
            cars = list(result.scalars())

        total_sent = 0
        for car in cars:
            total_sent += await dispatch_for_car(db, car)

    print(f"[alert_agent] Dispatched {total_sent} notifications for {len(cars)} cars")
    return {"cars": len(cars), "notifications_sent": total_sent}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--car-id", type=int, default=None)
    args = parser.parse_args()
    asyncio.run(run(car_id=args.car_id))
