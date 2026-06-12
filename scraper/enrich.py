"""
Gemini Flash enrichment for car listing descriptions.
Extracts structured condition signals from free-text Norwegian descriptions.
Degrades gracefully — returns {} on any API or parse error.
"""
import json
import re

import requests

_EXTRACTION_PROMPT = """Du analyserer en norsk bruktbil-annonse. Trekk ut strukturert informasjon fra beskrivelsen nedenfor.

Svar KUN med gyldig JSON (ingen markdown, ingen forklaring). Eksempel på format:
{
  "trim_level": "Sport",
  "is_one_owner": true,
  "has_service_history": true,
  "has_accident_history": false,
  "has_rust": false,
  "is_smoke_free": true,
  "has_warranty": false,
  "recently_serviced": false,
  "has_new_tires": false,
  "is_imported": false,
  "red_flags": [],
  "green_flags": ["én eier", "full servicehistorikk"]
}

Regler:
- is_one_owner: true hvis "én eier", "1 eier", "første eier" nevnes
- has_service_history: true hvis "servicehistorikk", "serviceheftet", "servicebok" nevnes positivt
- has_accident_history: true hvis "skadet", "kollisjonskadet", "reparert etter uhell", "totalskade" nevnes
- has_rust: true hvis "rust", "rustskade", "korrosjon" nevnes negativt
- is_smoke_free: true hvis "røykfri" nevnes
- has_warranty: true hvis "garanti" nevnes
- recently_serviced: true hvis "nylig service", "service utført", "ny service" nevnes
- has_new_tires: true hvis "nye dekk", "nye hjul", "ny gummi" nevnes
- trim_level: variantnavn (f.eks. "Sport", "Executive", "Premium") hvis nevnt i teksten, ellers null
- is_imported: true hvis "importert", "utenlandsk", "grå import" nevnes
- red_flags: liste med norske strenger for bekymringer (maks 3)
- green_flags: liste med norske strenger for positive trekk (maks 3)

Bruk null for felter du er usikker på, true/false kun når du er sikker.

Beskrivelse:
"""


def enrich_description(description: str, gemini_api_key: str) -> dict:
    """
    Call Gemini Flash to extract condition signals from a Norwegian car listing description.
    Returns a dict with condition signals, or {} if the API is unavailable or returns invalid JSON.
    """
    if not gemini_api_key or not description or len(description) < 30:
        return {}

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={gemini_api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": _EXTRACTION_PROMPT + description[:3000]}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 512,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(url, json=payload, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        # Strip markdown code fences if present
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
        signals = json.loads(text)
        if isinstance(signals, dict):
            return signals
    except Exception:
        pass

    return {}
