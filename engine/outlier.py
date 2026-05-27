"""
OLS regression residual deal detector with Z-score + IQR fallback.

Primary (>=8 peers): OLS price ~ year + mileage [+ horsepower] per brand+model.
Fallback (<8 peers): Z-score + IQR on windowed peer group (original logic).
"""
import statistics
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


# ---------------------------------------------------------------------------
# OLS helpers
# ---------------------------------------------------------------------------

def _ols_peers(car: "Car", all_cars: list["Car"]) -> list["Car"]:
    """All same brand+model cars with non-null price, year, mileage (no windowing)."""
    return [
        c for c in all_cars
        if c.id != car.id
        and c.brand == car.brand
        and c.model == car.model
        and c.price is not None
        and c.year is not None
        and c.mileage is not None
    ]


def _fit_ols(peers: list["Car"], include_hp: bool) -> "np.ndarray | None":
    """Fit OLS: price ~ 1 + year + mileage [+ horsepower]. Returns coefficients or None."""
    features = [
        [1.0, float(c.year), float(c.mileage)] + ([float(c.horsepower)] if include_hp else [])
        for c in peers
    ]
    X = np.array(features)
    y = np.array([float(c.price) for c in peers])
    try:
        coeffs, _, rank, _ = np.linalg.lstsq(X, y, rcond=None)
        if rank < X.shape[1]:
            return None
        return coeffs
    except (np.linalg.LinAlgError, ValueError):
        return None


def _predict(car: "Car", coeffs: "np.ndarray", include_hp: bool) -> float:
    x = [1.0, float(car.year), float(car.mileage)]
    if include_hp:
        x.append(float(car.horsepower))
    return float(np.dot(coeffs, x))


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
    coeffs = _fit_ols(working_peers, include_hp)
    if coeffs is None and include_hp:
        coeffs = _fit_ols(ols_peers, False)
        include_hp = False
        working_peers = ols_peers
    if coeffs is None:
        return None

    fair_value = _predict(car, coeffs, include_hp)
    if fair_value <= 0:
        return None

    score = (car.price - fair_value) / fair_value
    hp_note = " +hp" if include_hp else ""
    reason = (
        f"{car.price:,} NOK vs fair value {int(fair_value):,} NOK "
        f"({score * 100:+.1f}%, OLS n={len(working_peers)}{hp_note})"
    )
    return score, fair_value, reason


# ---------------------------------------------------------------------------
# Z-score + IQR fallback (original logic, unchanged)
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
            iqr_flag = _iqr_is_outlier(car.price, peer_prices)
            is_deal = score < Z_THRESHOLD and iqr_flag
            fair_value = None
            reason = _reason(car, peer_prices)
            peer_avg = int(statistics.mean(peer_prices))
            peer_size = len(z_peers)
            method = "zscore"
            stale = score >= STALE_THRESHOLD

        if is_deal:
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