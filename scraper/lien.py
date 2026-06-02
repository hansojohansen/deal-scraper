"""Brønnøysundregistrene vehicle lien check. Free API, no auth required."""
import requests


def check_lien(reg_number: str) -> dict:
    """
    Check for registered encumbrances (heftelser) on a vehicle.
    Returns {"has_lien": bool, "lien_amount": int | None} or {} on failure.
    """
    if not reg_number:
        return {}

    url = f"https://data.brreg.no/losore/api/kjoretoy/{reg_number.replace(' ', '').upper()}"
    try:
        resp = requests.get(url, timeout=10, headers={"Accept": "application/json"})
        if resp.status_code == 404:
            return {"has_lien": False, "lien_amount": None}
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {}

    try:
        heftelser = data.get("heftelser", [])
        has_lien = len(heftelser) > 0
        lien_amount = None
        if has_lien:
            total = sum(
                int(h.get("belop", 0) or 0)
                for h in heftelser
                if h.get("belop") is not None
            )
            lien_amount = total if total > 0 else None
        return {"has_lien": has_lien, "lien_amount": lien_amount}
    except Exception:
        return {}
