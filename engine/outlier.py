"""
Windowed median deal detector.

For each car, finds same brand+model peers within a year/mileage window and
uses their median as the fair value. Two windows tried in order:
  tight: ±1 year, ±25k km
  loose: ±3 years, ±50k km (fallback if tight has fewer than min_peers)
Minimum 3 peers required. Deal threshold: price >20% below peer median.
"""
import statistics
from datetime import date
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car, OutlierScore

_cfg = yaml.safe_load(Path("config.yaml").read_text())["outlier"]
TIGHT_YEAR_WINDOW: int = _cfg["tight_year_window"]
TIGHT_MILEAGE_WINDOW: int = _cfg["tight_mileage_window"]
LOOSE_YEAR_WINDOW: int = _cfg["loose_year_window"]
LOOSE_MILEAGE_WINDOW: int = _cfg["loose_mileage_window"]
MIN_PEERS: int = _cfg["min_peers"]
DEAL_THRESHOLD: float = _cfg["deal_threshold"]
STALE_THRESHOLD: float = _cfg["stale_threshold"]
MIN_PRICE_NOK: int = _cfg["min_price_nok"]

_CURRENT_YEAR: int = date.today().year


def _windowed_median(
    car: "Car", all_cars: list["Car"]
) -> "tuple[list[Car], int, str] | None":
    """
    Find peers and compute median fair value using progressively wider windows.
    Returns (peers, fair_value_nok, reason) or None if insufficient peers.
    """
    if car.year is None or car.price is None:
        return None

    for year_w, mil_w in [
        (TIGHT_YEAR_WINDOW, TIGHT_MILEAGE_WINDOW),
        (LOOSE_YEAR_WINDOW, LOOSE_MILEAGE_WINDOW),
    ]:
        peers = [
            c for c in all_cars
            if c.id != car.id
            and c.brand == car.brand
            and c.model == car.model
            and c.price is not None
            and c.year is not None
            and abs(c.year - car.year) <= year_w
            and (
                car.mileage is None
                or c.mileage is None
                or abs(c.mileage - car.mileage) <= mil_w
            )
        ]
        if len(peers) >= MIN_PEERS:
            fair_value = int(statistics.median(p.price for p in peers))
            reason = (
                f"{car.price:,} NOK · medianpris for {len(peers)} tilsvarende "
                f"{car.brand} {car.model} (±{year_w}år/±{mil_w // 1000}tkm) "
                f"er {fair_value:,} NOK"
            )
            return peers, fair_value, reason

    return None


def _quality_tier(car: "Car", score: float) -> str:
    """
    Classify deal quality.
    skip      — likely salvage/scam/missing data
    check     — genuine deal but buyer should verify (import, no EU data)
    excellent — best deals (>25% below median) with Norwegian reg + valid EU
    good      — default for any genuine priced-below-market listing
    """
    if car.price and car.price < MIN_PRICE_NOK:
        return "skip"
    if car.mileage and car.mileage > 400_000:
        return "skip"
    if car.year is None:
        return "skip"
    if car.is_norwegian_reg is False:
        return "check"
    car_age = _CURRENT_YEAR - car.year
    if car_age > 4 and car.eu_next_deadline is None:
        return "check"
    if score < -0.25:
        return "excellent"
    return "good"


async def run_detection(db: AsyncSession) -> dict:
    result = await db.execute(
        select(Car).where(Car.status == "active", Car.price.is_not(None))
    )
    all_cars: list[Car] = list(result.scalars())

    upserted = 0
    removed = 0

    for car in all_cars:
        median_result = _windowed_median(car, all_cars)

        if median_result is None:
            r = await db.execute(
                delete(OutlierScore).where(OutlierScore.car_id == car.id)
            )
            removed += r.rowcount
            continue

        peers, fair_value, reason = median_result
        score = (car.price - fair_value) / fair_value
        is_deal = score < DEAL_THRESHOLD
        stale = score >= STALE_THRESHOLD

        if is_deal:
            tier = _quality_tier(car, score)
            existing = await db.execute(
                select(OutlierScore).where(OutlierScore.car_id == car.id)
            )
            ex = existing.scalar_one_or_none()
            peer_avg = int(statistics.mean(p.price for p in peers))
            vals = dict(
                score=round(score, 4),
                reason=reason,
                peer_group_size=len(peers),
                peer_avg_price=peer_avg,
                fair_value=fair_value,
                method="median",
                quality_tier=tier,
            )
            if ex:
                for k, v in vals.items():
                    setattr(ex, k, v)
            else:
                db.add(OutlierScore(car_id=car.id, **vals))
            upserted += 1
        elif stale:
            r = await db.execute(
                delete(OutlierScore).where(OutlierScore.car_id == car.id)
            )
            removed += r.rowcount

    await db.commit()
    return {"cars_checked": len(all_cars), "upserted": upserted, "removed": removed}
