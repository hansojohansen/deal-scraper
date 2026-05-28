import random
import re
import time
from datetime import date

import requests
import yaml
from bs4 import BeautifulSoup

from scraper.retry import with_retry


def _load_config() -> dict:
    with open("config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)["scraper"]["finn"]


_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
]

_BODY_TYPE_MAP = {
    "sedan": "sedan",
    "suv": "suv",
    "stasjonsvogn": "wagon",
    "coupe": "coupe",
    "coupé": "coupe",
    "cabriolet": "cabriolet",
    "mpv": "mpv",
    "minibuss": "van",
    "pickup": "pickup",
    "kombi": "wagon",
    "flerbruksbil": "mpv",
    "crossover": "suv",
}


def _map_body_type(v: str) -> str:
    return _BODY_TYPE_MAP.get(v.lower().strip(), v.lower().strip())


def _parse_metadata(line: str) -> dict:
    """Parse '2019 ∙ 75 000 km ∙ Hybrid bensin ∙ Automat ∙ 140 kW' into fields."""
    result = {"year": None, "mileage": None, "fuel_type": None, "transmission": None, "horsepower": None}
    if not line:
        return result

    parts = [p.strip() for p in line.split("∙")]
    for i, part in enumerate(parts):
        part_clean = part.replace("\xa0", "").replace(" ", "").strip()

        if i == 0 and re.match(r"^\d{4}$", part_clean):
            result["year"] = int(part_clean)

        elif "km" in part_clean:
            km_str = re.sub(r"[^\d]", "", part_clean.replace("km", ""))
            if km_str:
                result["mileage"] = int(km_str)

        elif re.search(r"\d+\s*kW", part, re.IGNORECASE):
            m = re.search(r"(\d+)\s*kW", part, re.IGNORECASE)
            if m:
                result["horsepower"] = round(int(m.group(1)) * 1.341)

        elif re.search(r"\d+\s*hk", part, re.IGNORECASE):
            m = re.search(r"(\d+)\s*hk", part, re.IGNORECASE)
            if m:
                result["horsepower"] = int(m.group(1))

        elif i >= 2 and result["fuel_type"] is None and "km" not in part_clean:
            result["fuel_type"] = part.strip()

        elif i >= 3 and result["transmission"] is None and "km" not in part_clean:
            result["transmission"] = part.strip()

    return result


def _parse_price(texts: list[str]) -> int | None:
    """Extract price in NOK from the text list. Price precedes 'kr'."""
    for i, t in enumerate(texts):
        if t.strip() == "kr" and i > 0:
            price_str = re.sub(r"[^\d]", "", texts[i - 1])
            if price_str:
                return int(price_str)
    for t in texts:
        m = re.search(r"([\d\s\xa0]+)\s*kr", t)
        if m:
            price_str = re.sub(r"[^\d]", "", m.group(1))
            if price_str and len(price_str) >= 4:
                return int(price_str)
    return None


def _parse_brand_model(title: str) -> tuple[str | None, str | None]:
    """Split 'Toyota RAV4' into ('Toyota', 'RAV4')."""
    if not title:
        return None, None
    parts = title.strip().split(None, 1)
    brand = parts[0] if parts else None
    model = parts[1] if len(parts) > 1 else None
    return brand, model


def _parse_norwegian_date(s: str) -> date | None:
    """Parse 'dd.mm.yyyy' Norwegian date string."""
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s.strip())
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def _normalise(article) -> dict | None:
    """Extract canonical fields from a BeautifulSoup article element."""
    link = article.find("a", class_="sf-search-ad-link")
    if not link:
        return None

    url = link.get("href", "")
    source_id = link.get("id", "")
    if not url or not source_id:
        return None

    if url.startswith("/"):
        url = "https://www.finn.no" + url

    texts = [t for t in article.stripped_strings]

    title = None
    h2 = article.find("h2")
    if h2:
        title = h2.get_text(strip=True)
    elif texts:
        title = texts[0]

    brand, model = _parse_brand_model(title)

    meta_line = None
    for t in texts:
        if "∙" in t and re.search(r"\d{4}", t) and "km" in t:
            meta_line = t
            break

    meta = _parse_metadata(meta_line)
    price = _parse_price(texts)

    location = None
    for t in texts:
        if "∙" in t and not re.search(r"\d{4}", t) and "km" not in t and "kr" not in t:
            location = t.split("∙")[0].strip()
            break

    return {
        "source_id": source_id,
        "url": url,
        "source": "finn.no",
        "title": title,
        "brand": brand,
        "model": model,
        "year": meta["year"],
        "mileage": meta["mileage"],
        "fuel_type": meta["fuel_type"],
        "transmission": meta["transmission"],
        "horsepower": meta["horsepower"],
        "price": price,
        "location": location,
        "listing_type": "buy_now",
        "features": {},
    }


def fetch_page(page: int, session: requests.Session, config: dict) -> list[dict]:
    """Fetch one page from finn.no and return normalised listing dicts."""
    url = f"https://www.finn.no/mobility/search/car?page={page}"
    time.sleep(config["delay_seconds"] * random.uniform(0.7, 1.3))

    resp = session.get(url, timeout=15)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    articles = soup.find_all("article", class_="sf-search-ad")

    results = []
    for article in articles:
        item = _normalise(article)
        if item:
            results.append(item)

    return results


def fetch_detail(url: str, session: requests.Session, delay: float = 1.2) -> dict:
    """
    Fetch a finn.no listing detail page and extract EU inspection dates,
    Norwegian registration status, horsepower, body type, and engine size.
    Returns a partial dict with only the fields that were found.
    """
    time.sleep(delay)
    result: dict = {}
    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
    except requests.RequestException:
        return result

    soup = BeautifulSoup(resp.text, "lxml")

    dt_elements = soup.find_all("dt")
    for dt in dt_elements:
        label = dt.get_text(strip=True).lower()
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        value = dd.get_text(strip=True)

        if "sist eu-godkjent" in label or "eu-godkjent" in label:
            parsed = _parse_norwegian_date(value)
            if parsed:
                result["eu_inspected_at"] = parsed

        elif "neste frist for eu-kontroll" in label or "eu-kontroll" in label:
            parsed = _parse_norwegian_date(value)
            if parsed:
                result["eu_next_deadline"] = parsed

        elif "registrert i norge" in label:
            result["is_norwegian_reg"] = value.lower() not in ("nei", "no", "false")

        elif "ikke norsk bil" in label or "importert" in label:
            result["is_norwegian_reg"] = False

        elif "effekt" in label:
            kw_m = re.search(r"(\d+)\s*kW", value, re.IGNORECASE)
            hk_m = re.search(r"(\d+)\s*hk", value, re.IGNORECASE)
            if kw_m:
                result["horsepower"] = round(int(kw_m.group(1)) * 1.341)
            elif hk_m:
                result["horsepower"] = int(hk_m.group(1))

        elif "karosseri" in label or "biltype" in label:
            result["body_type"] = _map_body_type(value)

        elif "sylindervolum" in label or "motor" in label and "ccm" in value.lower():
            cc_str = re.sub(r"[^\d]", "", value)
            if cc_str:
                result["engine_size_cc"] = int(cc_str)

    return result


def get_total_pages(session: requests.Session, config: dict) -> int:
    """Fetch page 1 and extract total listing count to compute page count."""
    resp = session.get("https://www.finn.no/mobility/search/car?page=1", timeout=15)
    soup = BeautifulSoup(resp.text, "lxml")

    for tag in soup.find_all("span"):
        text = tag.get_text(strip=True)
        m = re.search(r"([\d\s\xa0]+)\s*treff", text)
        if m:
            total_str = re.sub(r"[^\d]", "", m.group(1))
            if total_str:
                total = int(total_str)
                return max(1, (total + 49) // 50)

    return 100  # fallback


def fetch_page_resilient(page: int, session: requests.Session, config: dict) -> list[dict]:
    """fetch_page with automatic retry and exponential backoff."""
    return with_retry(fetch_page, page, session, config, max_attempts=3, base_delay=2.0)


def build_session(config: dict) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Referer": "https://www.finn.no/",
    })
    return session