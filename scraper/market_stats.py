"""
Pre-compute per-model market statistics (median price, avg DOM) from removed listings.
Runs at the end of each scraper cycle and upserts into market_stats table.
"""
import statistics
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import MarketStats


async def compute_market_stats(db: AsyncSession) -> dict:
    """
    Group removed cars by (brand, model, fuel_type) and compute:
      - median_price, avg_price from sale prices
      - avg_dom_days from dom_days field (set when car is marked removed)
    Requires at least 3 samples per group.
    """
    rows_result = await db.execute(text("""
        SELECT brand, model, COALESCE(fuel_type, '') AS fuel_type, price, dom_days
        FROM cars
        WHERE status = 'removed'
          AND brand IS NOT NULL
          AND model IS NOT NULL
          AND price IS NOT NULL
          AND price > 30000
          AND price < 3000000
    """))
    rows = rows_result.fetchall()

    groups: dict[tuple, list[tuple[int, float | None]]] = {}
    for brand, model, fuel_type, price, dom_days in rows:
        key = (brand, model, fuel_type)
        groups.setdefault(key, []).append((price, dom_days))

    upserted = 0
    for (brand, model, fuel_type), entries in groups.items():
        if len(entries) < 3:
            continue
        prices = [e[0] for e in entries]
        doms = [e[1] for e in entries if e[1] is not None and e[1] > 0]

        median_price = int(statistics.median(prices))
        avg_price = int(statistics.mean(prices))
        avg_dom_days = round(statistics.mean(doms), 1) if doms else None

        existing = await db.execute(
            select(MarketStats).where(
                MarketStats.brand == brand,
                MarketStats.model == model,
                MarketStats.fuel_type == fuel_type,
            )
        )
        ms = existing.scalar_one_or_none()
        if ms:
            ms.median_price = median_price
            ms.avg_price = avg_price
            ms.avg_dom_days = avg_dom_days
            ms.sample_count = len(prices)
            ms.computed_at = datetime.now(UTC)
        else:
            db.add(MarketStats(
                brand=brand,
                model=model,
                fuel_type=fuel_type,
                median_price=median_price,
                avg_price=avg_price,
                avg_dom_days=avg_dom_days,
                sample_count=len(prices),
            ))
        upserted += 1

    await db.commit()
    print(f"[market_stats] Computed stats for {upserted} brand/model groups")
    return {"upserted": upserted}
