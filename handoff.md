# Project Handoff — deal-scraper

## Current State (2026-06-12)

**App is code-ready for deploy** — CI passes. Deploy is blocked because GitHub Secrets
(`DEPLOY_HOST`, `DEPLOY_SSH_KEY`) and the production `.env` on the droplet still need
configuring. See Deployment Checklist below.

**Phase 1 (Stabilization & UX Lift) — COMPLETE**
**Phase 2 (B2B Infrastructure) — MOSTLY COMPLETE** — one known bug + two items pending (see below)
**Phase 3 (Ecosystem Expansion) — NOT STARTED**

---

## What's Working

- **Scraper**: Runs every 6h via GitHub Actions cron. finn.no + auksjonen.no sources.
- **Outlier detection**: Windowed median (`engine/outlier.py`). Trim-aware peer sub-group (3rd tier). Bulk pre-loads — no per-car queries in loop.
- **Auth**: Full JWT auth — register, login, forgot/reset password. `bcrypt` directly (no passlib).
- **Detail enrichment**: `--enrich-details` — fetches finn.no detail pages (50/run). Extracts EU dates, reg_number, body_type, drivetrain, num_owners, color, trim_level, seller_type.
- **Gemini enrichment**: `condition_signals` JSONB + now extracts `trim_level` from descriptions.
- **Official APIs**: Statens vegvesen (`first_reg_date`) + Brønnøysundregistrene (`has_lien`, `lien_amount`).
- **Score chips**: `compute_score_chips()` in `backend/scoring/chips.py` — shown on all card surfaces.
- **BargainGauge**: SVG arc gauge on listing cards (replaces plain "−17%" text).
- **Market stats pipeline**: `scraper/market_stats.py` runs after each scrape. Upserts `median_price`, `avg_price`, `avg_dom_days` per brand/model into `market_stats` table.
- **URL-persisted filters**: Listings page filters are in the URL (`?brand=Toyota&model=RAV4`).
- **Watchlist, Compare, Swipe, Alerts, Watchlist pages**: All working.
- **Alerts**: `extra_filters` JSONB for hyper-specific matching (condition signals, strict mileage). `alert_name` display field.
- **User plan tiers**: `users.plan` column — values `free` / `pro` / `dealer`. Exposed in `/api/v1/auth/me`.
- **deal_events table**: Written by `engine/outlier.py` on genuinely new outlier detections. Used by SSE stream.
- **SSE Arbitrage Radar**: `GET /api/v1/b2b/stream` — polls `deal_events` every 30s. Requires `plan=pro/dealer`.
- **`/radar` page**: `ArbitrageRadar.tsx` — live deal feed via EventSource, BargainGauge, watchlist save, upgrade prompt for free users.
- **`/api/v1/b2b/lookup-reg`**: Vegvesen proxy for Trade-In Calculator (frontend component not yet built).

---

## Known Issues / Bugs

### SSE Auth Bug (must fix before Phase 2 is complete)
`ArbitrageRadar.tsx` passes the JWT as `?token=TOKEN` in the EventSource URL (browsers can't set headers on EventSource). But `backend/api/routes/b2b.py` uses `get_current_user` which only reads the `Authorization` header — it never reads the `?token=` query param.

**Fix**: Update the `/stream` endpoint to accept token from query param:
```python
# In b2b.py stream_deals(), replace get_current_user dependency with:
async def get_user_from_token_or_header(
    token: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    raw = token or (credentials.credentials if credentials else None)
    if not raw:
        raise HTTPException(401, "Not authenticated")
    user_id_str = decode_access_token(raw)
    user = await users_crud.get_by_id(db, uuid.UUID(user_id_str))
    if not user:
        raise HTTPException(401, "User not found")
    return user
```
Add this helper to `b2b.py` (imports: `uuid`, `Query`, `HTTPBearer`, `decode_access_token`, `users_crud`).

### auksjonen mileage
Always `NULL` — auksjonen.no API does not provide mileage.

### Email not configured
`send_reset_email` skips silently if `SMTP_*` env vars are unset. Recommend Resend or Postmark.

### Email verification unimplemented
`users.is_verified` exists but no email is sent on register. Drop the column or implement before launch.

### Condition signals sparse
`--enrich-details` only runs 50 cars/pass. Will fill gradually over scraper runs.

### Auth uses localStorage
JWT in localStorage (OWASP discourages). Planned: HttpOnly cookies + BFF pattern.

---

## Phase 2 — Remaining Items

These were planned but not yet implemented:

1. **SSE Auth Bug fix** (see above — must fix for `/radar` to work)
2. **Trade-In Calculator** (`frontend/src/components/TradeInCalculator.tsx`) — modal on CarDetail and Dashboard. Uses `GET /api/v1/b2b/lookup-reg` (already built) + `GET /api/v1/stats/market` to compute trade-in/retail estimate.
3. **Analytics DOM column** — Add "Snitt salgstid" column to the model stats table in `Analytics.tsx` using `getMarketStats(brand)` (already in `client.ts`).

---

## Phase 3 — Not Started

From `okay-lets-make-some-eventual-eclipse.md`:

1. **TCO Calculator** (`frontend/src/components/TCOCalculator.tsx`) — modal on CarDetail. No backend. Inputs: annual km, ZIP prefix, financing toggle. Outputs: monthly financing + fuel + insurance + tolls + depreciation.
2. **Compare page market rows** — Add DOM, TCO, median price rows sourced from `market_stats`.
3. **Migration 016 + CRM Kanban** — `crm_leads` table, `/api/v1/crm` routes, `/crm` Kanban page (dealer-only).
4. **Bulk Portfolio Analysis** — `POST /api/v1/b2b/portfolio` returns fair_value + recommendation per car (dealer-only).

---

## DB Migrations

| Migration | What it does |
|-----------|-------------|
| 001–009 | Base schema, cars, price_history, outlier_scores, deal_alerts, image_url |
| 010 | `users` table + `user_id` FK on `deal_alerts` |
| 011 | Performance indexes |
| 012 | `cars`: description, color, seller_type, drivetrain, num_owners, condition_signals. `outlier_scores`: condition_adjusted_score |
| 013 | `cars`: reg_number, first_reg_date, has_lien, lien_amount, lien_checked_at. `watchlist_items` table |
| 014 | `cars`: trim_level, dom_days. `deal_alerts`: alert_name, extra_filters JSONB. `market_stats` table. 3 composite indexes |
| 015 | `users`: plan (default 'free'). `deal_events` table |

**Current head: 015**. Applied automatically on every deploy via `alembic upgrade head`.

---

## API Routes

| Prefix | File | Notes |
|--------|------|-------|
| `/api/v1/auth` | `routes/auth.py` | register, login, forgot/reset-password, me (returns plan) |
| `/api/v1/cars` | `routes/cars.py` | list (24 filter params), brands/models, detail, price-history |
| `/api/v1/outliers` | `routes/outliers.py` | top deals, peers |
| `/api/v1/stats` | `routes/stats.py` | summary, brands, models, sold, **market** (new) |
| `/api/v1/alerts` | `routes/alerts.py` | CRUD, supports extra_filters |
| `/api/v1/watchlist` | `routes/watchlist.py` | add/remove/list saved cars |
| `/api/v1/b2b` | `routes/b2b.py` | /stream (SSE), /lookup-reg (Vegvesen proxy) |
| `/health` | `routes/health.py` | health check |

---

## Frontend Pages & Routes

| Route | File | Auth |
|-------|------|------|
| `/` | Dashboard.tsx | public |
| `/listings` | Listings.tsx | public — filters in URL |
| `/outliers` | Outliers.tsx | public |
| `/analytics` | Analytics.tsx | public |
| `/swipe` | Swipe.tsx | public |
| `/compare` | Compare.tsx | public |
| `/cars/:id` | CarDetail.tsx | public |
| `/alerts` | Alerts.tsx | required |
| `/watchlist` | Watchlist.tsx | required |
| `/radar` | ArbitrageRadar.tsx | required + plan=pro/dealer |
| `/login`, `/register`, etc. | auth pages | public |

---

## Deployment Checklist (before redeploying to giscademy.com)

**GitHub Secrets** (Settings → Secrets → Actions):
- `DEPLOY_HOST` — droplet public IP
- `DEPLOY_USER` — `deploy`
- `DEPLOY_SSH_KEY` — ed25519 private key matching `/home/deploy/.ssh/authorized_keys`

**Production `.env` on droplet** — SSH in and add:
```
JWT_SECRET=<generate: python3 -c "import secrets; print(secrets.token_hex(32))">
ACCESS_TOKEN_EXPIRE_HOURS=24
CORS_ORIGINS=["https://giscademy.com"]
```

Then push to `master` — GitHub Actions builds frontend, scps dist, pulls, migrates, restarts.

---

## Local Dev

```bash
# Backend (port 8080 — port 8000 has a stuck phantom process on this machine)
uvicorn backend.main:app --port 8080 --reload

# Frontend (Vite proxies /api → localhost:8080)
cd frontend && npm run dev

# Scraper
python -m scraper.main                         # full scrape
python -m scraper.main --enrich-details        # + detail pages (50/run)
python -m scraper.main --cleanup-prices        # remove bad data, re-run detection

# Migrations
alembic upgrade head
alembic current
```

---

## Architecture

```
Internet → Nginx (80→443, SSL giscademy.com)
              ├── /        → frontend/dist/ (React SPA)
              ├── /api/*   → backend:8000 (FastAPI)
              └── /health  → backend:8000/health

GitHub Actions (push to master):
  1. npm ci && npm run build
  2. scp frontend/dist/ → droplet
  3. ssh → git pull → alembic upgrade head → docker compose up -d --build
```
