"""Statens vegvesen vehicle data enrichment. Free API, no key required."""
import re
from datetime import date

import requests


def enrich_vegvesen(reg_number: str) -> dict:
    """
    Fetch technical vehicle data from Statens vegvesen.
    Returns dict with first_reg_date, or {} on any failure.
    """
    if not reg_number:
        return {}

    url = (
        "https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering"
        f"/enkeltoppslag/kjoretoydata?kjennemerke={reg_number.replace(' ', '')}"
    )
    try:
        resp = requests.get(url, timeout=10, headers={"Accept": "application/json"})
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {}

    result = {}
    try:
        godkjenning = data.get("kjoretoydataListe", [{}])[0].get("godkjenning", {})
        forste = godkjenning.get("forstegangsregistrering", {})
        dato_str = forste.get("registrertForstegangNorgeDato") or forste.get("forstegangRegistrertDato")
        if dato_str:
            dato_str = dato_str.strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", dato_str):
                y, m, d_ = dato_str.split("-")
                result["first_reg_date"] = date(int(y), int(m), int(d_))
            elif re.match(r"^\d{8}$", dato_str):
                result["first_reg_date"] = date(int(dato_str[:4]), int(dato_str[4:6]), int(dato_str[6:]))
    except Exception:
        pass

    return result
