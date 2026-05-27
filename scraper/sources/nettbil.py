"""
Scraper for nettbil.no/forhandler (dealer listings).
All listings are buy_now. Selectors marked TODO may need adjustment after live testing.
"""
import re
import time

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.nettbil.no/forhandler"
DELAY = 1.5


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    })
    return session


def _parse_price(text: str) -> int | None:
    m = re.search(r"([\d\s\xa0]+)\s*kr", text)
    if m:
        s = re.sub(r"[^\d]", "", m.group(1))
        if s and len(s) >= 4:
            return int(s)
    return None


def _parse_year(text: str) -> int | None:
    m = re.search(r"\b(19[5-9]\d|20[0-2]\d)\b", text)
    return int(m.group(1)) if m else None


def _parse_mileage(text: str) -> int | None:
    m = re.search(r"([\d\s\xa0]+)\s*km", text)
    if m:
        s = re.sub(r"[^\d]", "", m.group(1))
        return int(s) if s else None
    return None


def _normalise(card, base_url: str) -> dict | None:
    # TODO: verify selectors against live nettbil.no HTML after first test run
    link = card.find("a", href=True)
    if not link:
        return None
    href = link["href"]
    url = href if href.startswith("http") else f"https://www.nettbil.no{href}"
    source_id = href.rstrip("/").split("/")[-1]

    texts = [t.strip() for t in card.stripped_strings if t.strip()]
    if not texts:
        return None

    title = texts[0]
    price = next((t for t in texts if "kr" in t), None)
    price_val = _parse_price(price) if price else None

    year = None
    mileage = None
    for t in texts:
        if year is None:
            year = _parse_year(t)
        if mileage is None and "km" in t:
            mileage = _parse_mileage(t)

    parts = title.strip().split(None, 1)
    brand = parts[0] if parts else None
    model = parts[1] if len(parts) > 1 else None

    return {
        "source_id": source_id,
        "url": url,
        "source": "nettbil",
        "title": title,
        "brand": brand,
        "model": model,
        "year": year,
        "mileage": mileage,
        "fuel_type": None,
        "transmission": None,
        "price": price_val,
        "location": None,
        "listing_type": "buy_now",
        "features": {},
    }


def fetch_page(page: int, session: requests.Session) -> list[dict]:
    url = f"{BASE_URL}?page={page}"
    time.sleep(DELAY)
    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
    except requests.RequestException:
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    # TODO: update selector after inspecting live HTML
    cards = soup.select("article, .car-card, [data-testid='car-item'], .listing-item")
    results = []
    for card in cards:
        item = _normalise(card, BASE_URL)
        if item and item["url"] and item["source_id"]:
            results.append(item)
    return results


def fetch_all(session: requests.Session, max_pages: int = 10) -> list[dict]:
    all_items: list[dict] = []
    for page in range(1, max_pages + 1):
        items = fetch_page(page, session)
        if not items:
            break
        all_items.extend(items)
    return all_items
