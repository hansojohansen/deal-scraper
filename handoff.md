# Project Handoff — deal-scraper

## Current State (2026-06-13)

**App is code-ready for deploy** — CI passes. Deploy is blocked because GitHub Secrets
(`DEPLOY_HOST`, `DEPLOY_SSH_KEY`) and the production `.env` on the droplet still need
configuring. See Deployment Checklist below.

**Phase 1 (Stabilization & UX Lift) — COMPLETE**
**Phase 2 (B2B Infrastructure) — COMPLETE**
**Phase 3 (Ecosystem Expansion) — COMPLETE**
**Security Hardening — COMPLETE** (migration 017)

---

## What's Working

- **Scraper**: Runs every 6h via GitHub Actions cron. finn.no + auksjonen.no sources.
- **Outlier detection**: Windowed median (`engine/outlier.py`). Trim-aware peer sub-group (3rd tier). Bulk pre-loads — no per-car queries in loop.
- **Auth**: HttpOnly session cookies (migration 017 + `user_sessions` table). Login/register/forgot/reset. `bcrypt` directly (no passlib). Rate-limited.
- **Detail enrichment**: `--enrich-details` — fetches finn.no detail pages (50/run). Extracts EU dates, reg_number, body_type, drivetrain, num_owners, color, trim_level, seller_type.
- **Gemini enrichment**: `condition_signals` JSONB + `trim_level` from descriptions.
- **Official APIs**: Statens vegvesen (`first_reg_date`) + Brønnøysundregistrene (`has_lien`, `lien_amount`).
- **Score chips**: `compute_score_chips()` in `backend/scoring/chips.py` — shown on all card surfaces.
- **BargainGauge**: SVG arc gauge on listing cards.
- **Market stats pipeline**: `scraper/market_stats.py` — upserts `median_price`, `avg_price`, `avg_dom_days` per brand/model after each scrape.
- **URL-persisted filters**: Listings page filters are in the URL (`?brand=Toyota&model=RAV4`).
- **Watchlist, Compare, Swipe, Alerts pages**: All working.
- **Alerts**: `extra_filters` JSONB for hyper-specific matching. `alert_name` display field.
- **User plan tiers**: `users.plan` — `free` / `pro` / `dealer`. Exposed in `/api/v1/auth/me`.
- **deal_events table**: Written by `engine/outlier.py` on genuinely new outlier detections.
- **SSE Arbitrage Radar** (`/radar`): `GET /api/v1/b2b/stream` — polls `deal_events` every 30s. Requires `plan=pro/dealer`. Auth via HttpOnly cookie (`withCredentials: true`) — verified working end-to-end.
- **Trade-In Calculator**: `TradeInCalculator.tsx` modal on CarDetail. Uses `/b2b/lookup-reg` + `/stats/market`.
- **Analytics DOM column**: "Snitt salgstid" in model stats table from `market_stats`.
- **TCO Calculator**: `TCOCalculator.tsx` modal on CarDetail. Client-side only — annual km, financing, fuel, insurance, tolls, depreciation.
- **Compare market rows**: DOM, median price rows from `market_stats` on Compare page.
- **CRM Kanban** (`/crm`): Dealer-only. `crm_leads` table (migration 016), `/api/v1/crm` routes, drag-and-drop Kanban board.
- **Bulk Portfolio Analysis**: `POST /api/v1/b2b/portfolio` — fair_value + recommendation per car (dealer-only, max 50).
- **Security hardening** (migration 017): `user_sessions` table, HttpOnly cookies, rate limiting, CSP/HSTS headers, DB CHECK constraints.

---

## Known Issues / Bugs

### auksjonen mileage
Always `NULL` — auksjonen.no API does not provide mileage.

### Email not configured
`send_reset_email` skips silently if `SMTP_*` env vars are unset. Recommend Resend or Postmark.

### Email verification unimplemented
`users.is_verified` exists but no email is sent on register. Drop the column or implement before launch.

### Condition signals sparse
`--enrich-details` only runs 50 cars/pass. Will fill gradually over scraper runs.

### vite.config.ts proxies to port 8081
`frontend/vite.config.ts` proxies `/api` to `localhost:8081`. Start the backend on 8081 locally, not 8080. (CLAUDE.md still says 8080 — one of them needs updating.)

---

## Phase 2 — COMPLETE

All items shipped:
- `users.plan`, `deal_events`, SSE Arbitrage Radar stream
- SSE auth: `_get_sse_user` in `b2b.py` accepts HttpOnly cookie via `withCredentials: true`
- Trade-In Calculator (`TradeInCalculator.tsx`)
- Analytics DOM column ("Snitt salgstid")

---

## Phase 3 — COMPLETE

All items shipped:
- TCO Calculator (`TCOCalculator.tsx`)
- Compare page market rows
- CRM Kanban (migration 016, `crm_leads`, `/crm` page)
- Bulk Portfolio Analysis (`POST /api/v1/b2b/portfolio`)

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
| 016 | `crm_leads` table |
| 017 | `user_sessions` table, DB CHECK constraints, indexes for security hardening |

**Current head: 017**. Applied automatically on every deploy via `alembic upgrade head`.

---

## API Routes

| Prefix | File | Notes |
|--------|------|-------|
| `/api/v1/auth` | `routes/auth.py` | register, login, logout, forgot/reset-password, me (returns plan) |
| `/api/v1/cars` | `routes/cars.py` | list (24 filter params), brands/models, detail, price-history |
| `/api/v1/outliers` | `routes/outliers.py` | top deals, peers |
| `/api/v1/stats` | `routes/stats.py` | summary, brands, models, sold, market |
| `/api/v1/alerts` | `routes/alerts.py` | CRUD, supports extra_filters |
| `/api/v1/watchlist` | `routes/watchlist.py` | add/remove/list saved cars |
| `/api/v1/b2b` | `routes/b2b.py` | /stream (SSE), /lookup-reg (Vegvesen proxy), /portfolio (bulk analysis) |
| `/api/v1/crm` | `routes/crm.py` | CRUD for crm_leads (dealer-only) |
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
| `/crm` | CRM.tsx | required + plan=dealer |
| `/portfolio` | Portfolio.tsx | required + plan=dealer |
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
# Backend — Vite proxies to port 8081
uvicorn backend.main:app --port 8081 --reload

# Frontend
cd frontend && npm run dev

# Scraper
python -m scraper.main                         # full scrape
python -m scraper.main --enrich-details        # + detail pages (50/run)
python -m scraper.main --cleanup-prices        # remove bad data, re-run detection

# Migrations
alembic upgrade head
alembic current

# Upgrade a user to dealer in dev
# UPDATE users SET plan='dealer' WHERE email='...'
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
