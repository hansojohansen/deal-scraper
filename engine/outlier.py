"""
Z-score + IQR outlier detector.

Peer group: same brand+model, year ±year_range, mileage ±mileage_range.
If peer group < min_peer_group_size, broadens to brand+model only.
Flags cars where z < z_score_threshold and peer_size >= min_peer_group_size.
Removes stale rows where z >= z_score_remove_threshold.
"""
import statistics
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car, OutlierScore

_cfg = yaml.safe_load(Path("config.yaml").read_text())["outlier"]
Z_THRESHOLD: float = _cfg["z_score_threshold"]
STALE_THRESHOLD: float = _cfg["z_score_remove_threshold"]
MIN_PEERS: int = _cfg["min_peer_group_size"]
IQR_MULT: float = _cfg["iqr_multiplier"]
YEAR_WINDOW: int = _cfg["year_range"]
MILEAGE_WINDOW: int = _cfg["mileage_range"]


def _peer_group(car: Car, candidates: list[Car]) -> list[Car]:
    peers = [
        c for c in candidates
        if c.id != car.id
        and c.brand == car.brand
        and c.model == car.model
        and c.price is not None
        and (car.year is None or c.year is None or abs(c.year - car.year) <= YEAR_WINDOW)
        and (car.mileage is None or c.mileage is None or abs(c.mileage - car.mileage) <= MILEAGE_WINDOW)
    ]
    if len(peers) >= MIN_PEERS:
        return peers
    return [
        c for c in candidates
        if c.id != car.id
        and c.brand == car.brand
        and c.model == car.model
        and c.price is not None
    ]


def _z_score(price: int, peer_prices: list[int]) -> float:
    if len(peer_prices) < 2:
        return 0.0
    mean = statistics.mean(peer_prices)
    stdev = statistics.stdev(peer_prices)
    if stdev == 0:
        return 0.0
    return (price - mean) / stdev


def _iqr_is_outlier(price: int, peer_prices: list[int]) -> bool:
    sorted_p = sorted(peer_prices)
    n = len(sorted_p)
    q1 = sorted_p[n // 4]
    q3 = sorted_p[(3 * n) // 4]
    iqr = q3 - q1
    return price < q1 - IQR_MULT * iqr


def _reason(car: Car, peer_prices: list[int]) -> str:
    mean = int(statistics.mean(peer_prices))
    pct = int(abs((car.price - mean) / mean * 100)) if mean else 0
    direction = "below" if car.price < mean else "above"
    return f"{car.price:,} NOK is {pct}% {direction} peer avg {mean:,} NOK (n={len(peer_prices)})"


async def run_detection(db: AsyncSession) -> dict:
    result = await db.execute(
        select(Car).where(Car.status == "active", Car.price.is_not(None))
    )
    all_cars: list[Car] = list(result.scalars())

    upserted = 0
    removed = 0

    for car in all_cars:
        peers = _peer_group(car, all_cars)
        if len(peers) < MIN_PEERS:
            continue
        peer_prices = [c.price for c in peers]
        z = _z_score(car.price, peer_prices)
        iqr_flag = _iqr_is_outlier(car.price, peer_prices)

        if z < Z_THRESHOLD and iqr_flag:
            existing = await db.execute(
                select(OutlierScore).where(OutlierScore.car_id == car.id)
            )
            ex = existing.scalar_one_or_none()
            vals = dict(
                score=round(z, 4),
                reason=_reason(car, peer_prices),
                peer_group_size=len(peers),
                peer_avg_price=int(statistics.mean(peer_prices)),
            )
            if ex:
                for k, v in vals.items():
                    setattr(ex, k, v)
            else:
                db.add(OutlierScore(car_id=car.id, **vals))
            upserted += 1
        elif z >= STALE_THRESHOLD:
            r = await db.execute(delete(OutlierScore).where(OutlierScore.car_id == car.id))
            removed += r.rowcount

    await db.commit()
    return {"cars_checked": len(all_cars), "upserted": upserted, "removed": removed}

