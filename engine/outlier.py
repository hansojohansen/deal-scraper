"""
Windowed median deal detector with condition-adjusted scoring.

For each car, finds same brand+model peers within a year/mileage window and
uses their median as the fair value. Two windows tried in order:
  tight: ±1 year, ±25k km
  loose: ±3 years, ±50k km (fallback if tight has fewer than min_peers)
Minimum 3 peers required. Deal threshold: price >20% below peer median.

Condition signals (from Gemini description analysis) adjust the fair value:
  - service history + one owner: fair value +7% (car worth more, real discount)
  - accident history: fair value -10% (already discounted, apparent deal may not be)
  - rust: fair value -8%
  - 4+ owners: fair value -5%
"""
import statistics
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car, DealEvent, OutlierScore, PriceHistory

_cfg = yaml.safe_load(Path("config.yaml").read_text())["outlier"]
_filter_cfg = yaml.safe_load(Path("config.yaml").read_text()).get("filter", {})
TIGHT_YEAR_WINDOW: int = _cfg["tight_year_window"]
TIGHT_MILEAGE_WINDOW: int = _cfg["tight_mileage_window"]
LOOSE_YEAR_WINDOW: int = _cfg["loose_year_window"]
LOOSE_MILEAGE_WINDOW: int = _cfg["loose_mileage_window"]
MIN_PEERS: int = _cfg["min_peers"]
DEAL_THRESHOLD: float = _cfg["deal_threshold"]
STALE_THRESHOLD: float = _cfg["stale_threshold"]
MIN_PRICE_NOK: int = _cfg["min_price_nok"]
MAX_PRICE_NOK: int = _filter_cfg.get("max_price_nok", 3_000_000)

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
            # Try trim-aware sub-group — same trim gives a more accurate fair value
            trim = getattr(car, "trim_level", None)
            if trim:
                trim_peers = [p for p in peers if getattr(p, "trim_level", None) == trim]
                if len(trim_peers) >= MIN_PEERS:
                    peers = trim_peers

            fair_value = int(statistics.median(p.price for p in peers))
            reason = (
                f"{car.price:,} NOK · medianpris for {len(peers)} tilsvarende "
                f"{car.brand} {car.model} (±{year_w}år/±{mil_w // 1000}tkm) "
                f"er {fair_value:,} NOK"
            )
            return peers, fair_value, reason

    return None


def _condition_adjusted_fair_value(car: "Car", raw_fair_value: int) -> int:
    """
    Adjust the peer-median fair value based on condition signals from AI description parsing.
    A car with full service history is worth more → the discount is more real.
    A car with accident history is already discounted → apparent deal may be misleading.
    """
    signals = car.condition_signals or {}
    multiplier = 1.0

    has_service = signals.get("has_service_history") is True
    is_one_owner = signals.get("is_one_owner") is True
    has_accident = signals.get("has_accident_history") is True
    has_rust = signals.get("has_rust") is True

    if has_service and is_one_owner:
        multiplier += 0.07  # car worth 7% more than bare median
    elif has_service:
        multiplier += 0.04

    if has_accident:
        multiplier -= 0.10  # car worth 10% less → apparent "deal" shrinks
    if has_rust:
        multiplier -= 0.08

    if car.num_owners is not None and car.num_owners >= 4:
        multiplier -= 0.05

    return max(1, int(raw_fair_value * multiplier))


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
    if car.price and car.price > MAX_PRICE_NOK:
        return "skip"
    if car.listing_type == "lease":
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


def _has_price_dropped(car_id: int, recent_history: dict[int, list[int]]) -> bool:
    """Return True if this car had a price drop in the pre-loaded recent history map."""
    prices = recent_history.get(car_id, [])
    return len(prices) >= 2 and prices[-1] < prices[0]


async def run_detection(db: AsyncSession) -> dict:
    """
    Bulk outlier detection. Pre-loads all data upfront to avoid per-car DB
    queries inside the loop (which trigger autoflush and cause statement timeouts
    on hosted Postgres with strict timeouts).
    """
    # 1. Load all active cars with a price
    cars_result = await db.execute(
        select(Car).where(Car.status == "active", Car.price.is_not(None))
    )
    all_cars: list[Car] = list(cars_result.scalars())

    # 2. Pre-load all existing outlier scores keyed by car_id
    scores_result = await db.execute(select(OutlierScore))
    existing_scores: dict[int, OutlierScore] = {
        s.car_id: s for s in scores_result.scalars()
    }

    # 3. Pre-load recent price history (last 14 days) in one query
    cutoff = datetime.now(UTC) - timedelta(days=14)
    ph_result = await db.execute(
        select(PriceHistory.car_id, PriceHistory.price)
        .where(PriceHistory.recorded_at >= cutoff)
        .order_by(PriceHistory.car_id, PriceHistory.recorded_at)
    )
    recent_history: dict[int, list[int]] = {}
    for row in ph_result:
        recent_history.setdefault(row.car_id, []).append(row.price)

    # 4. Compute all changes in pure Python (no DB queries in loop)
    to_delete: list[int] = []   # car_ids whose OutlierScore should be removed
    to_upsert: list[tuple[int, dict]] = []  # (car_id, vals) to insert or update

    for car in all_cars:
        median_result = _windowed_median(car, all_cars)

        if median_result is None:
            if car.id in existing_scores:
                to_delete.append(car.id)
            continue

        peers, fair_value, reason = median_result
        raw_score = (car.price - fair_value) / fair_value
        adj_fair_value = _condition_adjusted_fair_value(car, fair_value)
        condition_adjusted_score = round((car.price - adj_fair_value) / adj_fair_value, 4)

        is_deal = raw_score < DEAL_THRESHOLD
        stale = raw_score >= STALE_THRESHOLD

        if is_deal:
            tier = _quality_tier(car, condition_adjusted_score)

            # "skip" tier means salvage/scrap/leasing — not a useful deal signal
            if tier == "skip":
                if car.id in existing_scores:
                    to_delete.append(car.id)
                continue

            # Update price-drop signal in features (pure Python, no DB)
            price_dropped = _has_price_dropped(car.id, recent_history)
            if price_dropped and not car.features.get("price_dropped_recently"):
                car.features = {**car.features, "price_dropped_recently": True}
            elif not price_dropped and car.features.get("price_dropped_recently"):
                car.features = {k: v for k, v in car.features.items() if k != "price_dropped_recently"}

            peer_avg = int(statistics.mean(p.price for p in peers))
            to_upsert.append((car.id, dict(
                score=round(raw_score, 4),
                condition_adjusted_score=condition_adjusted_score,
                reason=reason,
                peer_group_size=len(peers),
                peer_avg_price=peer_avg,
                fair_value=fair_value,
                method="median",
                quality_tier=tier,
            )))
        elif stale and car.id in existing_scores:
            to_delete.append(car.id)

    # 5. Apply deletes in a single batch (no per-row autoflush)
    removed = 0
    if to_delete:
        r = await db.execute(
            delete(OutlierScore).where(OutlierScore.car_id.in_(to_delete))
        )
        removed = r.rowcount

    # 6. Apply upserts (updates in-place on tracked ORM objects, adds for new)
    #    Write a DealEvent only for genuinely NEW outliers (not refreshes).
    upserted = len(to_upsert)
    car_map = {c.id: c for c in all_cars}
    for car_id, vals in to_upsert:
        ex = existing_scores.get(car_id)
        if ex:
            for k, v in vals.items():
                setattr(ex, k, v)
        else:
            db.add(OutlierScore(car_id=car_id, **vals))
            car = car_map.get(car_id)
            if car:
                db.add(DealEvent(
                    car_id=car_id,
                    score=vals["score"],
                    quality_tier=vals.get("quality_tier"),
                    brand=car.brand,
                    model=car.model,
                    price=car.price,
                    image_url=car.image_url,
                ))

    await db.commit()
    return {"cars_checked": len(all_cars), "upserted": upserted, "removed": removed}
