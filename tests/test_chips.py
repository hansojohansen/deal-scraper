"""Unit tests for score chip computation (no DB required)."""
from datetime import date, timedelta
from unittest.mock import MagicMock

from backend.scoring.chips import compute_score_chips


def _car(**kwargs):
    defaults = dict(
        has_lien=None,
        eu_next_deadline=None,
        is_norwegian_reg=None,
        seller_type=None,
        features={},
        condition_signals={},
        num_owners=None,
    )
    defaults.update(kwargs)
    c = MagicMock()
    for k, v in defaults.items():
        setattr(c, k, v)
    return c


def _outlier(score: float | None = None):
    o = MagicMock()
    o.score = score
    return o


def labels(chips):
    return [c["label"] for c in chips]


def type_of(chips, label):
    return next(c["type"] for c in chips if c["label"] == label)


# --- Price discount chip ---

def test_no_price_chip_when_no_outlier():
    chips = compute_score_chips(_car(), None)
    assert not any("lokalmedian" in c["label"] for c in chips)


def test_no_price_chip_when_score_below_threshold():
    chips = compute_score_chips(_car(), _outlier(score=-0.05))
    assert not any("lokalmedian" in c["label"] for c in chips)


def test_price_chip_when_score_above_threshold():
    chips = compute_score_chips(_car(), _outlier(score=-0.15))
    assert any("lokalmedian" in c["label"] for c in chips)
    chip = next(c for c in chips if "lokalmedian" in c["label"])
    assert chip["type"] == "green"
    assert "15%" in chip["label"]


# --- Lien chips ---

def test_heftelsefri_chip():
    chips = compute_score_chips(_car(has_lien=False), None)
    assert "Heftelsefri" in labels(chips)
    assert type_of(chips, "Heftelsefri") == "green"


def test_lien_chip_with_amount():
    chips = compute_score_chips(_car(has_lien=True, lien_amount=120_000), None)
    lien_chips = [c for c in chips if "Heftelse" in c["label"]]
    assert lien_chips
    assert lien_chips[0]["type"] == "red"
    assert "120k" in lien_chips[0]["label"]


def test_lien_chip_without_amount():
    chips = compute_score_chips(_car(has_lien=True, lien_amount=None), None)
    assert any(c["label"] == "Heftelse registrert" for c in chips)


def test_no_lien_chip_when_unknown():
    chips = compute_score_chips(_car(has_lien=None), None)
    assert not any("Heftelse" in c["label"] for c in chips)


# --- EU inspection chips ---

def test_eu_ok_chip():
    future = date.today() + timedelta(days=400)
    chips = compute_score_chips(_car(eu_next_deadline=future), None)
    eu = next((c for c in chips if c["label"].startswith("EU ok")), None)
    assert eu is not None
    assert eu["type"] == "green"
    assert str(future.year) in eu["label"]


def test_eu_snart_chip():
    soon = date.today() + timedelta(days=180)
    chips = compute_score_chips(_car(eu_next_deadline=soon), None)
    assert "EU snart" in labels(chips)
    assert type_of(chips, "EU snart") == "neutral"


def test_eu_utlopt_chip():
    past = date.today() - timedelta(days=10)
    chips = compute_score_chips(_car(eu_next_deadline=past), None)
    assert "EU utløpt" in labels(chips)
    assert type_of(chips, "EU utløpt") == "red"


# --- Import chip ---

def test_importert_chip():
    chips = compute_score_chips(_car(is_norwegian_reg=False), None)
    assert "Importert" in labels(chips)
    assert type_of(chips, "Importert") == "red"


def test_no_import_chip_when_norwegian():
    chips = compute_score_chips(_car(is_norwegian_reg=True), None)
    assert "Importert" not in labels(chips)


# --- Seller type chips ---

def test_private_seller_chip():
    chips = compute_score_chips(_car(seller_type="private"), None)
    assert "Privat selger" in labels(chips)
    assert type_of(chips, "Privat selger") == "neutral"


def test_dealer_chip():
    chips = compute_score_chips(_car(seller_type="dealer"), None)
    assert "Forhandler" in labels(chips)


# --- Condition signal chips ---

def test_one_owner_from_num_owners():
    chips = compute_score_chips(_car(num_owners=1), None)
    assert "Én eier" in labels(chips)
    assert type_of(chips, "Én eier") == "green"


def test_service_history_chip():
    chips = compute_score_chips(_car(condition_signals={"has_service_history": True}), None)
    assert "Full servicehistorikk" in labels(chips)
    assert type_of(chips, "Full servicehistorikk") == "green"


def test_accident_history_chip():
    chips = compute_score_chips(_car(condition_signals={"has_accident_history": True}), None)
    assert "Ulykke registrert" in labels(chips)
    assert type_of(chips, "Ulykke registrert") == "red"


def test_rust_chip():
    chips = compute_score_chips(_car(condition_signals={"has_rust": True}), None)
    assert "Rust registrert" in labels(chips)
    assert type_of(chips, "Rust registrert") == "red"


def test_warranty_chip():
    chips = compute_score_chips(_car(condition_signals={"has_warranty": True}), None)
    assert "Garanti" in labels(chips)
    assert type_of(chips, "Garanti") == "green"


# --- Price drop chip ---

def test_price_dropped_chip():
    chips = compute_score_chips(_car(features={"price_dropped_recently": True}), None)
    assert "Prisnedgang nylig" in labels(chips)
    assert type_of(chips, "Prisnedgang nylig") == "green"


def test_no_price_drop_chip_when_not_set():
    chips = compute_score_chips(_car(features={}), None)
    assert "Prisnedgang nylig" not in labels(chips)
