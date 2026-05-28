"""
Scraper for auksjonen.no car auctions.
Uses the site's JSON API instead of HTML scraping (the page is AngularJS client-side rendered).
API: GET /api/auctions/search?category=bruktbil&limit=100&offset=N
"""
import re
import time
from datetime import datetime, timezone

import requests

API_URL = "https://www.auksjonen.no/api/auctions/search"
LISTING_BASE = "https://www.auksjonen.no/auksjon"
PAGE_SIZE = 100
DELAY = 1.5

_FUEL_KEYWORDS = {"elektrisk", "hybrid", "diesel", "bensin"}


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7",
        "Accept": "application/json",
    })
    return session


def _parse_year(text: str) -> int | None:
    m = re.search(r"\b(19[5-9]\d|20[0-2]\d)\b", text)
    return int(m.group(1)) if m else None


def _parse_title(title: str) -> tuple[int | None, str | None, str | None]:
    """Return (year, brand, model) parsed from a title like '2018 Toyota Yaris 1.5 Hybrid'."""
    year = _parse_year(title)
    remainder = re.sub(r"\b(19[5-9]\d|20[0-2]\d)\b", "", title).strip()
    parts = remainder.split(None, 1)
    brand = parts[0] if parts else None
    model = parts[1].strip() if len(parts) > 1 else None
    return year, brand, model


def _parse_fuel_type(title: str) -> str | None:
    lower = title.lower()
    for kw in _FUEL_KEYWORDS:
        if kw in lower:
            return kw.capitalize()
    return None


def _normalise(item: dict) -> dict | None:
    title = (item.get("title") or "").strip()
    if not title:
        return None

    current_bid = item.get("currentBidAmount") or 0
    start_price = item.get("startPrice") or 0
    buy_now = item.get("buyNowPrice") or 0

    listing_type_raw = item.get("type", "AUCTION")
    if listing_type_raw == "BUYNOW":
        price = buy_now or current_bid or start_price or None
        listing_type = "buy_now"
    else:
        price = current_bid if current_bid > 0 else (start_price or None)
        listing_type = "auction"

    if not price:
        return None

    price = int(price)

    year, brand, model = _parse_title(title)
    fuel_type = _parse_fuel_type(title)

    object_id = item.get("objectId") or item.get("auctionId")
    source_id = str(item.get("auctionId", object_id))
    url = f"{LISTING_BASE}/{object_id}"

    features: dict = {}
    end_ts = item.get("endTime")
    if end_ts:
        features["auction_end"] = datetime.fromtimestamp(end_ts / 1000, tz=timezone.utc).isoformat()

    return {
        "source_id": source_id,
        "url": url,
        "source": "auksjonen",
        "title": title,
        "brand": brand,
        "model": model,
        "year": year,
        "mileage": None,
        "fuel_type": fuel_type,
        "transmission": None,
        "price": price,
        "location": item.get("city") or None,
        "listing_type": listing_type,
        "features": features,
        "image_url": None,
    }


def fetch_page(page: int, session: requests.Session) -> list[dict]:
    offset = (page - 1) * PAGE_SIZE
    time.sleep(DELAY)
    try:
        resp = session.get(
            API_URL,
            params={"category": "bruktbil", "limit": PAGE_SIZE, "offset": offset},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError):
        return []

    results = []
    for raw in data.get("items", []):
        item = _normalise(raw)
        if item:
            results.append(item)
    return results


def fetch_all(session: requests.Session, max_pages: int = 25) -> list[dict]:
    # The API returns all matching items in a single response regardless of offset,
    # so we only need one request.
    return fetch_page(1, session)
