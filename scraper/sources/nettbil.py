"""
nettbil.no is a B2B dealer auction platform that requires dealer credentials
(Autosys access) to view listings. The /forhandler page is a gated landing
page — all prices are blurred and there is no public listings API.

This module is kept as a stub so main.py's source loop doesn't break.
Scraping is disabled until dealer credentials are available.
"""
import requests


def build_session() -> requests.Session:
    return requests.Session()


def fetch_page(page: int, session: requests.Session) -> list[dict]:
    return []


def fetch_all(session: requests.Session, max_pages: int = 10) -> list[dict]:
    print("[nettbil] Skipped: dealer-only platform, no public listings")
    return []
