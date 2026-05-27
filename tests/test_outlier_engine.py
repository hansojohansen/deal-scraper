"""Unit tests for the outlier detection engine (no DB required)."""
from unittest.mock import MagicMock

from engine.outlier import _iqr_is_outlier, _peer_group, _reason, _z_score


def _car(id, brand, model, year, mileage, price):
    c = MagicMock()
    c.id = id
    c.brand = brand
    c.model = model
    c.year = year
    c.mileage = mileage
    c.price = price
    return c


PEERS = [_car(i, "Toyota", "Corolla", 2018, 80_000, p) for i, p in enumerate([
    300_000, 310_000, 295_000, 305_000, 308_000, 302_000,
], start=2)]


def test_peer_group_tight_window():
    target = _car(1, "Toyota", "Corolla", 2018, 80_000, 100_000)
    group = _peer_group(target, [target] + PEERS)
    assert len(group) == len(PEERS)
    assert all(c.id != target.id for c in group)


def test_peer_group_broadens_when_small():
    # Only 2 peers in tight window — should broaden
    sparse = [_car(i, "Toyota", "Corolla", 2010 + i * 5, 200_000 * i, 200_000) for i in range(2)]
    target = _car(99, "Toyota", "Corolla", 2018, 80_000, 150_000)
    group = _peer_group(target, [target] + sparse)
    assert len(group) == len(sparse)


def test_z_score_outlier():
    prices = [c.price for c in PEERS]
    z = _z_score(100_000, prices)
    assert z < -3, f"Expected strong negative z, got {z}"


def test_z_score_normal():
    prices = [c.price for c in PEERS]
    z = _z_score(303_000, prices)
    assert -1 < z < 1


def test_z_score_empty():
    assert _z_score(100_000, []) == 0.0
    assert _z_score(100_000, [200_000]) == 0.0


def test_iqr_is_outlier():
    prices = [300_000, 310_000, 295_000, 305_000, 308_000, 302_000]
    assert _iqr_is_outlier(50_000, prices)
    assert not _iqr_is_outlier(303_000, prices)


def test_reason_format():
    target = _car(1, "Toyota", "Corolla", 2018, 80_000, 100_000)
    prices = [c.price for c in PEERS]
    reason = _reason(target, prices)
    assert "100,000 NOK" in reason
    assert "below" in reason
    assert f"n={len(prices)}" in reason
