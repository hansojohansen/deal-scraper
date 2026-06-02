"""Explainable score chip computation. Each chip: label (Norwegian) + type (green|red|neutral)."""
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.db.models import Car, OutlierScore


def compute_score_chips(car: "Car", outlier: "OutlierScore | None") -> list[dict[str, Any]]:
    chips: list[dict[str, Any]] = []
    today = date.today()

    if outlier and outlier.score is not None:
        pct = round(abs(outlier.score) * 100)
        if pct >= 8:
            chips.append({"label": f"{pct}% under lokalmedian", "type": "green"})

    if car.has_lien is False:
        chips.append({"label": "Heftelsefri", "type": "green"})
    elif car.has_lien is True:
        label = "Heftelse registrert"
        if car.lien_amount:
            label += f" ({car.lien_amount // 1000}k kr)"
        chips.append({"label": label, "type": "red"})

    if car.eu_next_deadline:
        dl = car.eu_next_deadline
        if dl < today:
            chips.append({"label": "EU utløpt", "type": "red"})
        elif dl < today + timedelta(days=365):
            chips.append({"label": "EU snart", "type": "neutral"})
        else:
            chips.append({"label": f"EU ok til {dl.year}", "type": "green"})

    if car.is_norwegian_reg is False:
        chips.append({"label": "Importert", "type": "red"})

    if car.seller_type == "private":
        chips.append({"label": "Privat selger", "type": "neutral"})
    elif car.seller_type == "dealer":
        chips.append({"label": "Forhandler", "type": "neutral"})

    if car.features and car.features.get("price_dropped_recently"):
        chips.append({"label": "Prisnedgang nylig", "type": "green"})

    signals = car.condition_signals or {}
    if car.num_owners == 1 or signals.get("is_one_owner") is True:
        chips.append({"label": "Én eier", "type": "green"})
    if signals.get("has_service_history") is True:
        chips.append({"label": "Full servicehistorikk", "type": "green"})
    if signals.get("recently_serviced") is True:
        chips.append({"label": "Nylig servert", "type": "green"})
    if signals.get("has_warranty") is True:
        chips.append({"label": "Garanti", "type": "green"})
    if signals.get("has_new_tires") is True:
        chips.append({"label": "Nye dekk", "type": "green"})
    if signals.get("has_accident_history") is True:
        chips.append({"label": "Ulykke registrert", "type": "red"})
    if signals.get("has_rust") is True:
        chips.append({"label": "Rust registrert", "type": "red"})

    return chips
