"""Unit tests for the outlier detection engine (no DB required)."""
from unittest.mock import MagicMock

from engine.outlier import _windowed_median, _quality_tier


def _car(id, brand, model, year, mileage, price,
         is_norwegian_reg=None, eu_next_deadline=None):
    c = MagicMock()
    c.id = id
    c.brand = brand
    c.model = model
    c.year = year
    c.mileage = mileage
    c.price = price
    c.is_norwegian_reg = is_norwegian_reg
    c.eu_next_deadline = eu_next_deadline
    return c


PEERS = [_car(i, "Toyota", "Corolla", 2018, 80_000, p) for i, p in enumerate([
    300_000, 310_000, 295_000, 305_000, 308_000, 302_000,
], start=2)]


def test_windowed_median_finds_tight_peers():
    target = _car(1, "Toyota", "Corolla", 2018, 80_000, 200_000)
    result = _windowed_median(target, [target] + PEERS)
    assert result is not None
    peers, fair_value, reason = result
    assert len(peers) == len(PEERS)
    assert 295_000 <= fair_value <= 310_000
    assert "Toyota" in reason
    assert "Corolla" in reason


def test_windowed_median_falls_back_to_loose_window():
    # Only 1 peer in tight window (year differs by 2) — tight fails, loose succeeds
    far_peers = [_car(i, "Toyota", "Corolla", 2015, 80_000, 200_000) for i in range(2, 5)]
    target = _car(1, "Toyota", "Corolla", 2017, 80_000, 100_000)
    result = _windowed_median(target, [target] + far_peers)
    assert result is not None
    _, _, reason = result
    assert "±3" in reason  # loose window used


def test_windowed_median_returns_none_when_no_peers():
    target = _car(1, "BMW", "M3", 2020, 50_000, 500_000)
    others = [_car(i, "Toyota", "Corolla", 2020, 50_000, 300_000) for i in range(2, 10)]
    assert _windowed_median(target, [target] + others) is None


def test_windowed_median_returns_none_when_year_missing():
    target = _car(1, "Toyota", "Corolla", None, 80_000, 200_000)
    assert _windowed_median(target, [target] + PEERS) is None


def test_windowed_median_ignores_peers_without_price():
    no_price = [_car(i, "Toyota", "Corolla", 2018, 80_000, None) for i in range(2, 10)]
    target = _car(1, "Toyota", "Corolla", 2018, 80_000, 100_000)
    assert _windowed_median(target, [target] + no_price) is None


def test_quality_tier_excellent():
    car = _car(1, "Toyota", "Corolla", 2022, 30_000, 200_000,
               is_norwegian_reg=True, eu_next_deadline="2027-01-01")
    assert _quality_tier(car, -0.30) == "excellent"


def test_quality_tier_good():
    car = _car(1, "Toyota", "Corolla", 2022, 30_000, 200_000,
               is_norwegian_reg=True, eu_next_deadline="2027-01-01")
    assert _quality_tier(car, -0.22) == "good"


def test_quality_tier_check_import():
    car = _car(1, "Toyota", "Corolla", 2022, 30_000, 200_000, is_norwegian_reg=False)
    assert _quality_tier(car, -0.30) == "check"


def test_quality_tier_check_no_eu():
    car = _car(1, "Toyota", "Corolla", 2018, 30_000, 200_000,
               is_norwegian_reg=True, eu_next_deadline=None)
    assert _quality_tier(car, -0.30) == "check"


def test_quality_tier_skip_low_price():
    car = _car(1, "Toyota", "Corolla", 2018, 30_000, 10_000)
    assert _quality_tier(car, -0.30) == "skip"


def test_quality_tier_skip_high_mileage():
    car = _car(1, "Toyota", "Corolla", 2018, 500_000, 200_000,
               is_norwegian_reg=True)
    assert _quality_tier(car, -0.30) == "skip"
