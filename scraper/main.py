"""
Scraper orchestrator: COLLECT -> FILTER -> STORE
ECC pattern: iterative retrieval with cursor state persistence.
Supports multiple sources: finn.no, nettbil, auksjonen.

Resilience features:
- Per-batch cursor checkpointing (every BATCH_SIZE pages)
- Concurrent page fetching via asyncio.to_thread (semaphore=CONCURRENCY)
- Skip failed pages (continue) rather than abort
- Retry with exponential backoff per page via fetch_page_resilient
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
BATCH_SIZE = 10    # pages per checkpoint batch
CONCURRENCY = 3    # max concurrent requests within a batch


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


async def _fetch_batch_concurrent(
    pages: list[int], session, config: dict
) -> list[tuple[int, list[dict], str | None]]:
    """Fetch a batch of pages concurrently. Returns list of (page, items, error_or_None)."""
    sem = asyncio.Semaphore(CONCURRENCY)

    async def fetch_one(page: int):
        async with sem:
            try:
                items = await asyncio.to_thread(
                    finn.fetch_page_resilient, page, session, config
                )
                return page, items, None
            except Exception as e:
                return page, [], str(e)

    return list(await asyncio.gather(*[fetch_one(p) for p in pages]))


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
            detail = await asyncio.to_thread(
                finn.fetch_detail, url, session, finn_config["delay_seconds"]
            )
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


async def run(dry_run: bool = False, max_pages: int = 9999, enrich_details: bool = False) -> dict:
    """
    Main scrape cycle. Returns summary dict.
    Finn pages are fetched in batches with per-batch DB commits and cursor checkpoints.
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
        "removed": {},
        "errors": [],
        "dry_run": dry_run,
    }

    if not dry_run:
        from backend.db.crud import cars as cars_crud
        from backend.db.session import session_factory

    # --- FINN ---
    finn_cursor = cursor.get("finn", {})
    resume_page = finn_cursor.get("last_page", 0) + 1

    session = finn.build_session(finn_config)
    finn_total_pages = finn.get_total_pages(session, finn_config)
    finn_actual_pages = min(max_pages, finn_total_pages)
    did_full_finn_scrape = finn_actual_pages >= finn_total_pages

    if resume_page > finn_actual_pages:
        print(f"[scraper] finn: prior run completed (last_page={resume_page - 1}), starting fresh")
        resume_page = 1

    print(
        f"[scraper] finn: {finn_total_pages} total pages, scraping up to {finn_actual_pages}"
        f" (resume from page {resume_page}, full={did_full_finn_scrape})"
    )

    finn_seen_urls: set[str] = set()
    batch_items: list[dict] = []  # kept in scope for dry_run sample

    for batch_start in range(resume_page, finn_actual_pages + 1, BATCH_SIZE):
        batch_pages = list(range(
            batch_start,
            min(batch_start + BATCH_SIZE, finn_actual_pages + 1),
        ))

        if dry_run:
            batch_results = []
            for p in batch_pages:
                try:
                    items = finn.fetch_page_resilient(p, session, finn_config)
                    batch_results.append((p, items, None))
                except Exception as e:
                    batch_results.append((p, [], str(e)))
        else:
            batch_results = await _fetch_batch_concurrent(batch_pages, session, finn_config)

        batch_items = []
        for page_num, items, err in batch_results:
            if err:
                summary["errors"].append(f"finn page {page_num}: {err}")
                print(f"[scraper] WARN finn page {page_num}: {err}")
                continue
            summary["pages_fetched"] += 1
            summary["scraped"] += len(items)
            for item in items:
                finn_seen_urls.add(item["url"])
                if is_relevant(item, filter_config):
                    batch_items.append(item)
                else:
                    summary["filtered_out"] += 1

        if not dry_run and batch_items:
            async with session_factory() as db:
                for item in batch_items:
                    try:
                        car, is_new = await cars_crud.upsert_car(db, item)
                        if is_new:
                            summary["new"] += 1
                        else:
                            summary["updated"] += 1
                    except Exception as e:
                        summary["errors"].append(f"upsert {item.get('url')}: {e}")
                await db.commit()

        # Checkpoint cursor after each batch
        if not dry_run:
            last_page_done = batch_pages[-1]
            cursor["finn"] = {
                "last_page": last_page_done,
                "total_pages": finn_actual_pages,
                "run_started_at": summary["started_at"],
                "last_full_run_at": finn_cursor.get("last_full_run_at"),
            }
            _save_cursor(cursor)
            print(
                f"[scraper] finn: checkpoint page {last_page_done}/{finn_actual_pages}"
                f" | new={summary['new']} updated={summary['updated']}"
            )

    # Mark full run complete in cursor
    if not dry_run and did_full_finn_scrape:
        cursor["finn"] = {
            "last_full_run_at": datetime.now(UTC).isoformat(),
            "total_pages": finn_actual_pages,
        }
        _save_cursor(cursor)

    # --- OTHER SOURCES ---
    all_other_items: list[dict] = []
    for source_key, source_module in [("nettbil", nettbil), ("auksjonen", auksjonen)]:
        source_session = source_module.build_session()
        try:
            items = source_module.fetch_all(source_session, max_pages=max_pages)
            summary["scraped"] += len(items)
            for item in items:
                if is_relevant(item, filter_config):
                    all_other_items.append(item)
                else:
                    summary["filtered_out"] += 1
            print(f"[scraper] {source_key}: {len(items)} listings")
        except Exception as e:
            summary["errors"].append(f"{source_key}: {e}")
            print(f"[scraper] ERROR {source_key}: {e}")

    if not dry_run and all_other_items:
        async with session_factory() as db:
            for item in all_other_items:
                try:
                    car, is_new = await cars_crud.upsert_car(db, item)
                    if is_new:
                        summary["new"] += 1
                    else:
                        summary["updated"] += 1
                except Exception as e:
                    summary["errors"].append(f"upsert {item.get('url')}: {e}")
            await db.commit()

    print(
        f"[scraper] Total: {summary['scraped']} scraped,"
        f" {summary['filtered_out']} filtered, {summary['new']} new, {summary['updated']} updated"
    )

    if dry_run:
        print("[scraper] DRY RUN — sample output (last batch):")
        sample = batch_items[:5]
        for item in sample:
            price = item.get("price") or 0
            mileage = item.get("mileage") or 0
            print(f"  [{item['source']}] {item.get('brand')} {item.get('model')} {item.get('year')} | {price:,} NOK | {mileage} km | {item.get('listing_type')} | {item['url']}")
        summary["dry_run_sample"] = sample
        return summary

    # --- MARK REMOVED (only on full scrapes) ---
    if did_full_finn_scrape:
        async with session_factory() as db:
            count = await cars_crud.mark_unseen_as_removed(db, finn_seen_urls, "finn.no")
            summary["removed"]["finn.no"] = count
            await db.commit()
        print(f"[scraper] Marked removed: {count} finn.no listings")

    # --- ENRICH detail pages ---
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
    parser.add_argument("--max-pages", type=int, default=9999, help="Max pages per source (50 cars/page). Default: all pages.")
    parser.add_argument("--enrich-details", action="store_true", help="Fetch finn.no detail pages for EU/reg/hp data")
    args = parser.parse_args()

    result = asyncio.run(run(dry_run=args.dry_run, max_pages=args.max_pages, enrich_details=args.enrich_details))
    print(f"\n[scraper] Done: {result['new']} new, {result['updated']} updated, {len(result['errors'])} errors")
    if result["errors"]:
        for e in result["errors"]:
            print(f"  ERROR: {e}")
        sys.exit(1)
