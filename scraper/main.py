"""
Scraper orchestrator: COLLECT -> FILTER -> STORE
ECC pattern: iterative retrieval with cursor state persistence.
Supports multiple sources: finn.no, nettbil, auksjonen.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml

from scraper.filters import is_relevant
from scraper.sources import auksjonen, finn, nettbil

CURSOR_FILE = Path("scraper/state/cursor.json")
FEEDBACK_FILE = Path("data/feedback.json")


def _load_cursor() -> dict:
    if CURSOR_FILE.exists():
        with open(CURSOR_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_cursor(state: dict) -> None:
    CURSOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CURSOR_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, default=str)


def _load_config() -> dict:
    with open("config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


async def _enrich_finn_details(max_cars: int = 50) -> dict:
    """Fetch detail pages for finn.no cars missing EU inspection data."""
    from sqlalchemy import select, update

    from backend.db.models import Car
    from backend.db.session import session_factory

    config = _load_config()
    finn_config = config["scraper"]["finn"]
    session = finn.build_session(finn_config)

    enriched = 0
    errors = 0

    async with session_factory() as db:
        result = await db.execute(
            select(Car.id, Car.url)
            .where(
                Car.source == "finn.no",
                Car.eu_inspected_at.is_(None),
                Car.status == "active",
            )
            .limit(max_cars)
        )
        rows = result.all()

    for car_id, url in rows:
        try:
            detail = finn.fetch_detail(url, session, delay=finn_config["delay_seconds"])
            if detail:
                async with session_factory() as db:
                    await db.execute(
                        update(Car).where(Car.id == car_id).values(**detail)
                    )
                    await db.commit()
                enriched += 1
        except Exception as e:
            print(f"[enricher] ERROR {url}: {e}")
            errors += 1

    print(f"[enricher] Enriched {enriched} cars, {errors} errors")
    return {"enriched": enriched, "errors": errors}


async def run(dry_run: bool = False, max_pages: int = 10, enrich_details: bool = False) -> dict:
    """
    Main scrape cycle. Returns summary dict.
    Steps: fetch pages -> filter -> dedup -> upsert DB -> save cursor
    """
    config = _load_config()
    finn_config = config["scraper"]["finn"]
    filter_config = config.get("filter", {})

    cursor = _load_cursor()
    summary = {
        "started_at": datetime.now(UTC).isoformat(),
        "pages_fetched": 0,
        "scraped": 0,
        "filtered_out": 0,
        "new": 0,
        "updated": 0,
        "errors": [],
        "dry_run": dry_run,
    }

    # --- COLLECT from all sources ---
    sources = [
        ("finn", finn_config, finn),
        ("nettbil", {}, nettbil),
        ("auksjonen", {}, auksjonen),
    ]

    all_items: list[dict] = []

    for source_key, source_config, source_module in sources:
        source_cursor = cursor.get(source_key, {})
        last_known_url = source_cursor.get("last_first_url")
        print(f"[scraper] Scraping {source_key} — max_pages={max_pages}, dry_run={dry_run}")

        if source_key == "finn":
            session = finn.build_session(finn_config)
            for page in range(1, max_pages + 1):
                try:
                    items = finn.fetch_page(page, session, finn_config)
                    summary["pages_fetched"] += 1

                    if page == 1 and items and last_known_url:
                        if items[0]["url"] == last_known_url:
                            print(f"[scraper] {source_key}: cursor match — no new listings")
                            break

                    for item in items:
                        if is_relevant(item, filter_config):
                            all_items.append(item)
                        else:
                            summary["filtered_out"] += 1

                    summary["scraped"] += len(items)
                    if not items:
                        break
                except Exception as e:
                    summary["errors"].append(f"{source_key} page {page}: {e}")
                    print(f"[scraper] ERROR {source_key} page {page}: {e}")
                    break
        else:
            # nettbil and auksjonen use their own session and fetch_all
            source_session = source_module.build_session()
            try:
                items = source_module.fetch_all(source_session, max_pages=max_pages)
                summary["pages_fetched"] += max(1, len(items) // 20)
                summary["scraped"] += len(items)
                for item in items:
                    if is_relevant(item, filter_config):
                        all_items.append(item)
                    else:
                        summary["filtered_out"] += 1
                print(f"[scraper] {source_key}: {len(items)} listings")
            except Exception as e:
                summary["errors"].append(f"{source_key}: {e}")
                print(f"[scraper] ERROR {source_key}: {e}")

    print(f"[scraper] Total: {summary['scraped']} scraped, {len(all_items)} after filter")

    if dry_run:
        print("[scraper] DRY RUN — sample output:")
        for item in all_items[:5]:
            price = item.get("price") or 0
            mileage = item.get("mileage") or 0
            print(f"  [{item['source']}] {item.get('brand')} {item.get('model')} {item.get('year')} | {price:,} NOK | {mileage} km | {item['listing_type']} | {item['url']}")
        summary["dry_run_sample"] = all_items[:5]
        return summary

    # --- STORE ---
    from backend.db.crud import cars as cars_crud
    from backend.db.session import session_factory

    async with session_factory() as db:
        for item in all_items:
            try:
                car, is_new = await cars_crud.upsert_car(db, item)
                if is_new:
                    summary["new"] += 1
                else:
                    summary["updated"] += 1
            except Exception as e:
                summary["errors"].append(f"upsert {item['url']}: {e}")

        await db.commit()

    print(f"[scraper] Stored: {summary['new']} new, {summary['updated']} updated")

    # --- ENRICH detail pages (finn only) ---
    if enrich_details:
        enrich_result = await _enrich_finn_details(max_cars=50)
        summary["enriched"] = enrich_result

    # --- DETECT outliers ---
    from engine.outlier import run_detection
    async with session_factory() as db:
        detection = await run_detection(db)
    summary["detection"] = detection
    print(f"[scraper] Detection: {detection['upserted']} outliers flagged, {detection['removed']} removed")

    # --- DISPATCH alerts ---
    from agents.alert_agent import run as dispatch_alerts
    dispatch_result = await dispatch_alerts()
    summary["alerts_sent"] = dispatch_result["notifications_sent"]
    print(f"[scraper] Alerts: {dispatch_result['notifications_sent']} notifications sent")

    # Save cursor (finn only for now — others don't have stable ordering)
    finn_items = [i for i in all_items if i["source"] == "finn.no"]
    first_finn_url = finn_items[0]["url"] if finn_items else cursor.get("finn", {}).get("last_first_url")
    _save_cursor({
        **cursor,
        "finn": {
            "last_first_url": first_finn_url,
            "last_run_at": datetime.now(UTC).isoformat(),
            "last_new_count": summary["new"],
        },
    })

    _update_feedback(summary)
    return summary


def _update_feedback(summary: dict) -> None:
    """Append run summary to data/feedback.json for continuous learning."""
    try:
        with open(FEEDBACK_FILE, encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("sessions", []).append({
            "at": summary["started_at"],
            "new": summary["new"],
            "updated": summary["updated"],
            "pages": summary["pages_fetched"],
            "errors": len(summary["errors"]),
        })
        data["sessions"] = data["sessions"][-100:]
        with open(FEEDBACK_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
    except Exception as e:
        print(f"[scraper] Could not update feedback.json: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Car scraper — finn.no, nettbil, auksjonen")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write to DB")
    parser.add_argument("--max-pages", type=int, default=10, help="Max pages per source (50 cars/page)")
    parser.add_argument("--enrich-details", action="store_true", help="Fetch finn.no detail pages for EU/reg data")
    args = parser.parse_args()

    result = asyncio.run(run(dry_run=args.dry_run, max_pages=args.max_pages, enrich_details=args.enrich_details))
    print(f"\n[scraper] Done: {result['new']} new, {result['updated']} updated, {len(result['errors'])} errors")
    if result["errors"]:
        for e in result["errors"]:
            print(f"  ERROR: {e}")
        sys.exit(1)
