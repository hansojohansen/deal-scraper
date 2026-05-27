"""
Pure-Python aggregation helpers used by tests and the scraper summary report.
The API routes query the DB directly for live data; these helpers work on
in-memory Car/PriceHistory lists for unit testing and batch reporting.
"""
import statistics
from collections import defaultdict
from datetime import UTC, datetime, timedelta

_KM_BUCKETS = [
    ("0-30k",     0,      30_000),
    ("30k-60k",   30_000, 60_000),
    ("60k-100k",  60_000, 100_000),
    ("100k-150k", 100_000, 150_000),
    ("150k+",     150_000, None),
]


def price_by_km_buckets(cars) -> list[dict]:
    groups: dict[str, list[int]] = {label: [] for label, *_ in _KM_BUCKETS}
    for car in cars:
        if car.price is None or car.mileage is None:
            continue
        for label, lo, hi in _KM_BUCKETS:
            if hi is None or car.mileage < hi:
                if car.mileage >= lo:
                    groups[label].append(car.price)
                    break
    return [
        {"label": label, "avg_price": int(statistics.mean(prices)), "count": len(prices)}
        for label, prices in groups.items()
        if prices
    ]


def price_trend_30d(price_history_rows) -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=30)
    daily: dict[str, list[int]] = defaultdict(list)
    for row in price_history_rows:
        ts = row.recorded_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        if ts >= cutoff:
            daily[ts.date().isoformat()].append(row.price)
    return [
        {"date": day, "avg_price": int(statistics.mean(prices))}
        for day, prices in sorted(daily.items())
        if prices
    ]
