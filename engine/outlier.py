"""
OLS regression residual deal detector with Z-score + IQR fallback.

Primary (>=8 peers): log-linear OLS  log(price) ~ age + log(mileage+1) [+ log(hp+1)]
  - Training data filtered to [20%, 500%] of peer median to exclude scams/outliers
  - fair_value = exp(predicted log-price)
Fallback (<8 peers): Z-score + IQR on windowed peer group.
"""
import math
import statistics
from datetime import date
from pathlib import Path

import numpy as np
import yaml
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car, OutlierScore

_cfg = yaml.safe_load(Path("config.yaml").read_text())["outlier"]
Z_THRESHOLD: float = _cfg["z_score_threshold"]
STALE_THRESHOLD: float = _cfg["z_score_remove_threshold"]
MIN_PEERS: int = _cfg["min_peer_group_size"]
MIN_OLS_PEERS: int = _cfg.get("ols_min_peers", 8)
OLS_DEAL_THRESHOLD: float = _cfg.get("ols_deal_threshold", -0.15)
IQR_MULT: float = _cfg["iqr_multiplier"]
YEAR_WINDOW: int = _cfg["year_range"]
MILEAGE_WINDOW: int = _cfg["mileage_range"]
USE_LOG_MODEL: bool = _cfg.get("log_model", True)
TRAIN_LOW_PCT: float = _cfg.get("training_filter_low_pct", 0.20)
TRAIN_HIGH_PCT: float = _cfg.get("training_filter_high_pct", 5.0)
MIN_PRICE_NOK: int = _cfg.get("min_price_nok", 30000)

_CURRENT_YEAR: int = date.today().year


# ---------------------------------------------------------------------------
# Log-linear OLS helpers
# ---------------------------------------------------------------------------

def _ols_peers(car: "Car", all_cars: list["Car"]) -> list["Car"]:
    """All same brand+model cars with non-null price, year, mileage."""
    return [
        c for c in all_cars
        if c.id != car.id
        and c.brand == car.brand
        and c.model == car.model
        and c.price is not None
        and c.year is not None
        and c.mileage is not None
    ]


def _fit_log_ols(peers: list["Car"], include_hp: bool) -> "np.ndarray | None":
    """
    Fit log-linear OLS: log(price) ~ 1 + age_years + log(mileage+1) [+ log(hp+1)].
    Filters training data to [TRAIN_LOW_PCT, TRAIN_HIGH_PCT] of peer median before fitting.
    Returns coefficients or None if rank-deficient or insufficient clean peers.
    """
    prices = [c.price for c in peers]
    median_price = statistics.median(prices)
    lo, hi = TRAIN_LOW_PCT * median_price, TRAIN_HIGH_PCT * median_price
    clean = [c for c in peers if lo < c.price < hi]

    if len(clean) < MIN_OLS_PEERS:
        return None

    features = []
    for c in clean:
        age = float(_CURRENT_YEAR - c.year)
        row = [1.0, age, math.log(c.mileage + 1)]
        if include_hp:
            row.append(math.log(c.horsepower + 1))
        features.append(row)

    X = np.array(features)
    y = np.array([math.log(c.price) for c in clean])
    try:
        coeffs, _, rank, _ = np.linalg.lstsq(X, y, rcond=None)
        if rank < X.shape[1]:
            return None
        return coeffs
    except (np.linalg.LinAlgError, ValueError):
        return None


def _predict_log(car: "Car", coeffs: "np.ndarray", include_hp: bool) -> float:
    """Predict fair value as exp(dot(coeffs, features))."""
    age = float(_CURRENT_YEAR - car.year)
    x = [1.0, age, math.log(car.mileage + 1)]
    if include_hp:
        x.append(math.log(car.horsepower + 1))
    return math.exp(float(np.dot(coeffs, x)))


def _ols_score(
    car: "Car", ols_peers: list["Car"]
) -> "tuple[float, float, str] | None":
    """
    Returns (score, fair_value, reason) where score = (actual - fair) / fair.
    Negative score = priced below fair value (good deal).
    Returns None if OLS not possible.
    """
    if len(ols_peers) < MIN_OLS_PEERS:
        return None
    if car.year is None or car.mileage is None:
        return None

    hp_peers = [p for p in ols_peers if p.horsepower is not None]
    include_hp = car.horsepower is not None and len(hp_peers) >= MIN_OLS_PEERS

    working_peers = hp_peers if include_hp else ols_peers
    coeffs = _fit_log_ols(working_peers, include_hp)
    if coeffs is None and include_hp:
        coeffs = _fit_log_ols(ols_peers, False)
        include_hp = False
        working_peers = ols_peers
    if coeffs is None:
        return None

    fair_value = _predict_log(car, coeffs, include_hp)
    if fair_value <= 0:
        return None

    peer_prices = [c.price for c in working_peers]
    if not (min(peer_prices) * 0.2 <= fair_value <= max(peer_prices) * 3.0):
        return None

    score = (car.price - fair_value) / fair_value
    hp_note = " +hp" if include_hp else ""
    reason = (
        f"{car.price:,} NOK vs fair value {int(fair_value):,} NOK "
        f"({score * 100:+.1f}%, OLS n={len(working_peers)}{hp_note})"
    )
    return score, fair_value, reason


# ---------------------------------------------------------------------------
# Z-score + IQR fallback
# ---------------------------------------------------------------------------

def _peer_group(car: "Car", candidates: list["Car"]) -> list["Car"]:
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


def _reason(car: "Car", peer_prices: list[int]) -> str:
    mean = int(statistics.mean(peer_prices))
    pct = int(abs((car.price - mean) / mean * 100)) if mean else 0
    direction = "below" if car.price < mean else "above"
    return f"{car.price:,} NOK is {pct}% {direction} peer avg {mean:,} NOK (n={len(peer_prices)})"


# ---------------------------------------------------------------------------
# Quality tier
# ---------------------------------------------------------------------------

def _quality_tier(car: "Car", score: float, method: str) -> str:
    """
    Classify deal quality beyond the raw score.
    skip      — likely salvage/scam/missing data, don't surface to users
    check     — genuine deal but buyer should verify (import, no EU data)
    excellent — best deals with Norwegian reg and current EU inspection
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
    if method == "ols" and score < -0.25:
        return "excellent"
    return "good"


# ---------------------------------------------------------------------------
# Main detection loop
# ---------------------------------------------------------------------------

async def run_detection(db: AsyncSession) -> dict:
    result = await db.execute(
        select(Car).where(Car.status == "active", Car.price.is_not(None))
    )
    all_cars: list[Car] = list(result.scalars())

    upserted = 0
    removed = 0

    for car in all_cars:
        ols_peers = _ols_peers(car, all_cars)
        ols_result = _ols_score(car, ols_peers)

        if ols_result is not None:
            score, fair_value, reason = ols_result
            is_deal = score < OLS_DEAL_THRESHOLD
            peer_avg = int(statistics.mean(c.price for c in ols_peers))
            peer_size = len(ols_peers)
            method = "ols"
            stale = score >= 0.0
        else:
            z_peers = _peer_group(car, all_cars)
            if len(z_peers) < MIN_PEERS:
                continue
            peer_prices = [c.price for c in z_peers]
            score = _z_score(car.price, peer_prices)
            is_deal = score < Z_THRESHOLD
            fair_value = None
            reason = _reason(car, peer_prices)
            peer_avg = int(statistics.mean(peer_prices))
            peer_size = len(z_peers)
            method = "zscore"
            stale = score >= STALE_THRESHOLD

        if is_deal:
            tier = _quality_tier(car, score, method)
            existing = await db.execute(
                select(OutlierScore).where(OutlierScore.car_id == car.id)
            )
            ex = existing.scalar_one_or_none()
            vals = dict(
                score=round(score, 4),
                reason=reason,
                peer_group_size=peer_size,
                peer_avg_price=peer_avg,
                fair_value=int(fair_value) if fair_value is not None else None,
                method=method,
                quality_tier=tier,
            )
            if ex:
                for k, v in vals.items():
                    setattr(ex, k, v)
            else:
                db.add(OutlierScore(car_id=car.id, **vals))
            upserted += 1
        elif stale:
            r = await db.execute(delete(OutlierScore).where(OutlierScore.car_id == car.id))
            removed += r.rowcount

    await db.commit()
    return {"cars_checked": len(all_cars), "upserted": upserted, "removed": removed}
