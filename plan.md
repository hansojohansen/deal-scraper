# Feature Sprint Plan — Watchlist, Score Chips, Compare, Swipe, Official APIs

## Context

Implementing all Tier 1 + Tier 2 features from `deep-research-report.md`:
- Official Norwegian data enrichment (Statens vegvesen + Brønnøysundregistrene)
- Watchlist / Favorites
- Explainable score chips
- Compare view (up to 4 cars)
- Swipe discovery deck
- Monthly cost display + filter

---

## Phase A — DB Migration (013)

**New file**: `migrations/versions/013_add_reg_number_lien_watchlist.py`

Add to `cars` table:
- `reg_number` TEXT — Norwegian registration plate, extracted from finn.no detail page
- `first_reg_date` DATE — first registration date from Statens vegvesen
- `has_lien` BOOLEAN — whether vehicle has registered encumbrances
- `lien_amount` INTEGER — total encumbrance in NOK
- `lien_checked_at` DATETIME

New table `watchlist_items`:
- `id` BIGINT PK
- `user_id` UUID FK users.id CASCADE DELETE
- `car_id` BIGINT FK cars.id CASCADE DELETE
- `created_at` DATETIME server_default now()
- UNIQUE(user_id, car_id)

**Files**: `migrations/versions/013_...py`, `backend/db/models.py`

---

## Phase B — Statens vegvesen Enrichment

API: `GET https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke={reg_number}` (free)

### B1 — Extract reg_number in `fetch_detail()`
**File**: `scraper/sources/finn.py`
Add to existing dt/dd loop: `if "registreringsnummer" in label → result["reg_number"] = value.strip().upper()`

### B2 — New `scraper/vegvesen.py`
`enrich_vegvesen(reg_number: str) -> dict` — fetches first registration date. Returns `{}` on failure.

### B3 — `_enrich_vegvesen()` in `scraper/main.py`
Query: `reg_number IS NOT NULL AND first_reg_date IS NULL AND status='active'`, limit 200/run.

---

## Phase C — Brønnøysundregistrene Lien Check

API: `GET https://data.brreg.no/losore/api/kjoretoy/{reg_number}` (free, no auth)

### New `scraper/lien.py`
`check_lien(reg_number: str) -> dict` — returns `{"has_lien": bool, "lien_amount": int | None}`. Returns `{}` on failure.

### `_enrich_liens()` in `scraper/main.py`
Query: `reg_number IS NOT NULL AND lien_checked_at IS NULL AND status='active'`, limit 300/run.

---

## Phase D — Watchlist API

### D1 — Model
`backend/db/models.py` — Add `WatchlistItem` model, relationship on `User.watchlist`.

### D2 — CRUD
New `backend/db/crud/watchlist.py`:
- `add_item(db, user_id, car_id)`, `remove_item(db, user_id, car_id)`, `get_items(db, user_id)`, `is_saved(db, user_id, car_id)`

### D3 — Routes
New `backend/api/routes/watchlist.py` (prefix `/api/v1/watchlist`, auth required):
- `GET /` → `list[CarSummaryResponse]`
- `POST /` body `{car_id: int}` → 201
- `DELETE /{car_id}` → 204

Wire into `backend/main.py`.

---

## Phase E — Explainable Score Chips

### E1 — `backend/scoring/chips.py` (new)
`compute_score_chips(car, outlier) -> list[{"label": str, "type": "green"|"red"|"neutral"}]`

| Condition | Label | Type |
|-----------|-------|------|
| `outlier.score < -0.08` | "X% under lokalmedian" | green |
| `has_lien == False` | "Heftelsefri" | green |
| `has_lien == True` | "Heftelse registrert" | red |
| `eu_next_deadline` > 1yr | "EU ok til YYYY" | green |
| `eu_next_deadline` < 1yr | "EU snart" | neutral |
| `eu_next_deadline` passed | "EU utløpt" | red |
| `seller_type == "private"` | "Privat selger" | neutral |
| `features.price_dropped_recently` | "Prisnedgang nylig" | green |
| `num_owners == 1` or `condition_signals.is_one_owner` | "Én eier" | green |
| `condition_signals.has_service_history` | "Full servicehistorikk" | green |
| `condition_signals.has_accident_history` | "Uhellsskade" | red |
| `condition_signals.has_rust` | "Rust registrert" | red |
| `condition_signals.has_warranty` | "Garanti" | green |
| `is_norwegian_reg == False` | "Importert" | red |

### E2 — Wire into API responses
Add `score_chips: list[dict] = []` to `CarSummaryResponse` in `backend/schemas/car.py`.
Populate in `backend/api/routes/cars.py` and `backend/api/routes/outliers.py`.

---

## Phase F — Compare View

No new backend endpoint. Uses existing `GET /api/v1/cars/{car_id}`.

### `frontend/src/components/CompareTray.tsx` (new)
Floating bottom tray, up to 4 cars, "Sammenlign" button → `/compare?ids=1,2,3`.

### `frontend/src/pages/Compare.tsx` (new)
Reads IDs from URL, fetches each car, renders side-by-side table.
Rows: Merke/modell, År, Km, Pris, Månedskostnad, Drivstoff, Girkasse, Drivlinje, Hestekrefter, Motor, Farge, Selgertype, EU-kontroll, Heftelse, Tilstand-chips.

Update: `App.tsx` (add `/compare`), `Listings.tsx` (add compare "+" to CarCard), `client.ts` (add `getCar(id)`).

---

## Phase G — Swipe Deck

**New file**: `frontend/src/pages/Swipe.tsx`

Uses existing `api.getOutliers(100)` — no new backend.

- Card stack: 3 visible, drag to like/pass
- Save → `api.addToWatchlist(car_id)`, Undo restores last card
- Card: image, title, year/km/fuel, score chips, deal bar, price + monthly cost

Add "Oppdag" to nav in `App.tsx`.

---

## Phase H — Monthly Cost

Formula: `Math.round(price / 60)` (5-year rough estimate, frontend only)

- **CarCard** (`Listings.tsx`): `~X kr/mnd` below price
- **Outliers table**: monthly cost column
- **Compare page**: monthly cost row
- **Filter**: `monthly_cost_max` in `CarFilters` + backend `Car.price <= monthly_cost_max * 60`

---

## All Files

| File | Change |
|------|--------|
| `migrations/versions/013_...py` | New |
| `backend/db/models.py` | New Car fields + WatchlistItem model |
| `backend/schemas/car.py` | score_chips field |
| `scraper/sources/finn.py` | extract reg_number in fetch_detail() |
| `scraper/vegvesen.py` | New |
| `scraper/lien.py` | New |
| `scraper/main.py` | _enrich_vegvesen(), _enrich_liens() |
| `backend/scoring/__init__.py` | New (empty) |
| `backend/scoring/chips.py` | New — compute_score_chips() |
| `backend/db/crud/watchlist.py` | New |
| `backend/api/routes/watchlist.py` | New |
| `backend/api/routes/cars.py` | monthly_cost_max + score_chips |
| `backend/api/routes/outliers.py` | score_chips |
| `backend/main.py` | Wire watchlist router |
| `frontend/src/api/client.ts` | WatchlistItem, score_chips, getCar(), watchlist calls, monthly_cost_max |
| `frontend/src/pages/Listings.tsx` | Heart + compare buttons, monthly cost, score chips |
| `frontend/src/pages/Outliers.tsx` | Score chips, monthly cost column |
| `frontend/src/components/CompareTray.tsx` | New |
| `frontend/src/pages/Compare.tsx` | New |
| `frontend/src/pages/Watchlist.tsx` | New |
| `frontend/src/pages/Swipe.tsx` | New |
| `frontend/src/App.tsx` | New routes + nav |

---

## Verification

1. `alembic upgrade head` → confirm new columns + watchlist_items table
2. `--enrich-details` → reg_number populates
3. `_enrich_liens()` → has_lien stores True/False
4. Watchlist: POST → 201, GET → car listed, DELETE → 204
5. `GET /api/v1/cars?limit=5` → score_chips present on each car
6. `/listings` → heart toggle, compare button, monthly cost, chips visible
7. Compare tray → `/compare?ids=X,Y` shows side-by-side table
8. `/swipe` → card deck, swipe works, save adds to watchlist
9. `monthly_cost_max=5000` filter → only cars ≤ 300k returned
