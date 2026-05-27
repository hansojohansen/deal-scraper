"""
Scraper orchestrator: COLLECT â†’ FILTER â†’ STORE
ECC pattern: iterative retrieval with cursor state persistence.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml

from scraper.filters import is_relevant
from scraper.sources import finn

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


async def run(dry_run: bool = False, max_pages: int = 10) -> dict:
    """
    Main scrape cycle. Returns summary dict.
    Steps: fetch pages â†’ filter â†’ dedup â†’ upsert DB â†’ save cursor
    """
    config = _load_config()
    finn_config = config["scraper"]["finn"]
    filter_config = config.get("filter", {})

    session = finn.build_session(finn_config)
    cursor = _load_cursor()
    finn_cursor = cursor.get("finn", {})
    last_known_url = finn_cursor.get("last_first_url")

    summary = {
        "started_at": datetime.now(UTC).isoformat(),
        "source": "finn.no",
        "pages_fetched": 0,
        "scraped": 0,
        "filtered_out": 0,
        "new": 0,
        "updated": 0,
        "errors": [],
        "dry_run": dry_run,
    }

    all_items: list[dict] = []

    print(f"[scraper] Starting finn.no scrape â€” max_pages={max_pages}, dry_run={dry_run}")

    for page in range(1, max_pages + 1):
        try:
            items = finn.fetch_page(page, session, finn_config)
            summary["pages_fetched"] += 1

            # ECC iterative retrieval: stop early if we hit known listings
            if page == 1 and items and last_known_url:
                first_url = items[0]["url"] if items else None
                if first_url == last_known_url:
                    print("[scraper] Cursor match on page 1 â€” no new listings since last run")
                    break

            # Apply pre-filter
            for item in items:
                if is_relevant(item, filter_config):
                    all_items.append(item)
                else:
                    summary["filtered_out"] += 1

            summary["scraped"] += len(items)
            print(f"[scraper] Page {page}: {len(items)} listings ({len(all_items)} kept so far)")

            if not items:
                print(f"[scraper] Empty page {page} â€” stopping")
                break

        except Exception as e:
            err = f"Page {page}: {e}"
            summary["errors"].append(err)
            print(f"[scraper] ERROR {err}")
            break

    print(f"[scraper] Fetched {summary['scraped']} listings, {len(all_items)} after filter")

    if dry_run:
        print("[scraper] DRY RUN â€” sample output:")
        for item in all_items[:5]:
            print(f"  {item['brand']} {item['model']} {item['year']} | {item['price']:,} NOK | {item['mileage']} km | {item['url']}")
        summary["dry_run_sample"] = all_items[:5]
        return summary

    # --- Database upsert ---
    from backend.db.crud import cars as cars_crud
    from backend.db.session import session_factory

    async with session_factory() as db:
        seen_urls: set[str] = set()

        for item in all_items:
            try:
                car, is_new = await cars_crud.upsert_car(db, item)
                seen_urls.add(item["url"])
                if is_new:
                    summary["new"] += 1
                else:
                    summary["updated"] += 1
            except Exception as e:
                summary["errors"].append(f"upsert {item['url']}: {e}")

        await db.commit()

    print(f"[scraper] Stored: {summary['new']} new, {summary['updated']} updated")

    # Phase 3: outlier detection
    from engine.outlier import run_detection
    async with session_factory() as db:
        detection = await run_detection(db)
    summary["detection"] = detection
    print(f"[scraper] Detection: {detection['upserted']} outliers flagged, {detection['removed']} removed")

    # Phase 4: alert dispatch
    from agents.alert_agent import run as dispatch_alerts
    dispatch_result = await dispatch_alerts()
    summary["alerts_sent"] = dispatch_result["notifications_sent"]
    print(f"[scraper] Alerts: {dispatch_result['notifications_sent']} notifications sent")

    # Save cursor state
    first_url = all_items[0]["url"] if all_items else last_known_url
    _save_cursor({
        "finn": {
            "last_first_url": first_url,
            "last_run_at": datetime.now(UTC).isoformat(),
            "last_new_count": summary["new"],
        }
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
        # Keep last 100 sessions
        data["sessions"] = data["sessions"][-100:]
        with open(FEEDBACK_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
    except Exception as e:
        print(f"[scraper] Could not update feedback.json: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Finn.no car scraper")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write to DB")
    parser.add_argument("--max-pages", type=int, default=10, help="Max pages to scrape (50 cars/page)")
    args = parser.parse_args()

    result = asyncio.run(run(dry_run=args.dry_run, max_pages=args.max_pages))
    print(f"\n[scraper] Done: {result['new']} new, {result['updated']} updated, {len(result['errors'])} errors")
    if result["errors"]:
        for e in result["errors"]:
            print(f"  ERROR: {e}")
        sys.exit(1)


