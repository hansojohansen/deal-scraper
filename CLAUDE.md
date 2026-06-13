# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Norwegian car deal scraper — scrapes finn.no, tracks historical prices, detects price outliers, and sends deal alerts. API-first architecture to support iOS/Android in the future.

GitHub: https://github.com/hansojohansen/deal-scraper

## Stack

- **Backend**: Python 3.12, FastAPI (async), SQLAlchemy 2.0 async, asyncpg
- **Database**: Supabase (hosted PostgreSQL) — connection string in `.env`
- **Scraping**: requests + BeautifulSoup (finn.no only)
- **AI Enrichment**: Gemini Flash free tier (optional — degrades gracefully if `GEMINI_API_KEY` not set)
- **Frontend**: React + Vite + TanStack Query + Tailwind CSS + Recharts
- **Scheduling**: GitHub Actions cron (every 6h)
- **Dependencies**: managed with `uv`; venv at `.venv/`
- **Deployment**: Docker Compose on DigitalOcean droplet (Ubuntu 24.04); Nginx reverse proxy with Let's Encrypt HTTPS

## Running the project

```bash
# Install dependencies
uv pip install -e ".[dev]"

# Run DB migrations (requires .env with DATABASE_URL)
alembic upgrade head

# Start backend — use port 8081 locally (Vite proxies /api to 8081)
uvicorn backend.main:app --port 8081 --reload

# Start frontend (Vite proxies /api to localhost:8081)
cd frontend && npm install && npm run dev

# Run scraper manually
python -m scraper.main --dry-run               # preview only, no DB writes
python -m scraper.main                         # full scrape
python -m scraper.main --enrich-details        # scrape + fetch detail pages (50/run)
python -m scraper.main --cleanup-prices        # mark bad-price cars removed, wipe stale scores, re-detect

# Run tests
pytest

# Lint (CI runs this — must pass before deploy)
ruff check .

# Trigger deploy manually (requires workflow_dispatch in deploy.yml)
gh workflow run deploy.yml --ref master
```

## B2B Plan Tiers

`users.plan` column — values `free` / `pro` / `dealer` (default `free`).
- Exposed in `GET /api/v1/auth/me` response and `AuthContext` user object.
- `GET /api/v1/b2b/stream` (SSE Arbitrage Radar) requires `plan=pro` or `plan=dealer`.
- To upgrade a user in dev: `UPDATE users SET plan='dealer' WHERE email='...'`

**SSE Auth**: EventSource cannot send custom headers. The `/radar` page uses `withCredentials: true` — the HttpOnly session cookie is sent automatically. The `_get_sse_user` dependency in `b2b.py` also accepts `?token=` query param and Bearer header as fallback.

---

## Auth System

Full session-cookie auth (migration 017). Key files:

- `backend/security.py` — `hash_password`, `verify_password`, `create_access_token`, `decode_access_token`. Uses `bcrypt` directly — **do not use `passlib`**, incompatible with bcrypt 5.x.
- `backend/api/routes/auth.py` — `/api/v1/auth/{register,login,logout,forgot-password,reset-password,me}`
- `backend/db/crud/users.py` — async CRUD for `users` table
- `backend/db/crud/sessions.py` — async CRUD for `user_sessions` table
- `backend/dependencies.py` — `get_current_user`, `get_current_user_optional`
- `frontend/src/contexts/AuthContext.tsx` — session via HttpOnly cookie; `credentials: "include"` on all requests
- `frontend/src/components/ProtectedRoute.tsx` — redirects to `/login` with `state.next` if unauthenticated

Alerts require auth. Users see only their own alerts (filtered by `user_id`).

## Git Workflow

After every meaningful change, commit and push:
```bash
git add <files>
git commit -m "feat: description"
git push
```

Commit prefix conventions: `feat:` `fix:` `chore:` `test:` `docs:`

## Deployment

Push to `master` triggers GitHub Actions auto-deploy (`.github/workflows/deploy.yml`):
1. Builds frontend (`npm ci && npm run build`) in CI
2. SCPs `frontend/dist/` to droplet at `/home/deploy/deal-scraper/frontend/`
3. SSHes to droplet: `git pull` → `alembic upgrade head` → `docker compose up -d --build`

Can also be triggered manually: `gh workflow run deploy.yml --ref master`

**Droplet**: DigitalOcean Ubuntu 24.04. App lives at `/home/deploy/deal-scraper`. The `deploy` user runs Docker.

**Required GitHub Secrets**: `DEPLOY_HOST` (droplet IP), `DEPLOY_USER` (`deploy`), `DEPLOY_SSH_KEY` (ed25519 private key — must match a public key in `/home/deploy/.ssh/authorized_keys`).

**Deploy blocker**: The droplet was unreachable as of 2026-06-13 — `ssh-keyscan` times out. Verify the droplet is running in DigitalOcean and that `DEPLOY_HOST` secret has the correct IP before retrying.

**SSL**: Let's Encrypt certs at `/etc/letsencrypt/live/<domain>/`. Update `nginx/nginx.conf` with the real domain name when issuing the cert.

**Architecture**:
```
Internet → Nginx (80→443 redirect, 443 SSL)
              ├── /        → frontend/dist/ (static React SPA)
              ├── /api/*   → backend:8000 (FastAPI)
              └── /health  → backend:8000/health
```

**Production `.env` on droplet** must include:
```
JWT_SECRET=<generate: python3 -c "import secrets; print(secrets.token_hex(32))">
ACCESS_TOKEN_EXPIRE_HOURS=24
CORS_ORIGINS=["https://giscademy.com"]
```

## Environment

- Secrets in `.env` (gitignored). Copy `.env.example` to `.env` to get started.
- `DATABASE_URL` must use `postgresql+asyncpg://` prefix for the app; alembic swaps to `psycopg2` automatically
- `GEMINI_API_KEY` is optional — scraper runs without AI enrichment if absent
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` — optional; forgot-password silently skips email if unset
- Never commit `.env` — production secrets stay on the server only

## Scraping Guidelines

- Source: **finn.no only** (auksjonen.no removed 2026-06-13)
- HTML selectors for finn.no are in `config.yaml` under `scraper.finn.selectors` — change them there, not in `finn.py`
- When `scraper/sources/finn.py` returns 0 results, first check `config.yaml` selectors before editing code
- Price parsing uses `article.get_text(" ", strip=True)` so "640 000 kr" stays as one string across HTML tag boundaries.
- **Leasing detection**: `_parse_price()` returns `None` for cards containing `kr/mnd` / `leasing`. `_normalise()` sets `listing_type='lease'`. `is_relevant()` drops lease listings before DB storage.
- **Parts-car detection**: `_is_parts_car()` matches "delbil"/"selges som deler" patterns. `is_relevant()` drops `listing_type='parts'`.
- **Price cap**: `config.yaml` → `filter.max_price_nok: 3000000`. `is_relevant()` rejects above this.
- Always write a `price_history` row when updating a car's price — never update `cars.price` without it
- Rate limit: 1.2s delay between pages; respect robots.txt

## Detail Enrichment

`scraper/sources/finn.py` `fetch_detail()` fetches individual listing pages and extracts:
- EU inspection dates (`eu_inspected_at`, `eu_next_deadline`)
- Norwegian registration status (`is_norwegian_reg`)
- `horsepower`, `body_type`, `engine_size_cc`
- `description` (up to 5000 chars)
- `color`, `seller_type` (private/dealer), `drivetrain` (fwd/rwd/awd/4wd), `num_owners`

`scraper/enrich.py` sends the description to Gemini Flash and stores structured `condition_signals` JSONB on the car.

Run with `--enrich-details` to process 50 un-enriched cars per invocation.

## Outlier Detection

Algorithm: **windowed median** (`engine/outlier.py`) — finds same brand+model peers within ±1yr/±25k km (tight) or ±3yr/±50k km (loose fallback), uses their median as fair value. Minimum 3 peers required.

- **Trim-aware sub-group**: after finding tight-window peers, if car has `trim_level` and ≥3 peers share it, uses that sub-group for a more accurate fair value.
- Deal threshold: price >20% below peer median (`deal_threshold: -0.20` in `config.yaml`)
- Stale threshold: remove flag when price rises within 5% of median (`stale_threshold: -0.05`)
- Quality tiers: `excellent` (>25% below + Norwegian reg + valid EU), `good` (default deal), `check` (import or missing EU data), `skip` (price <30k NOK, >400k km, >3M NOK, or `listing_type='lease'`)
- **`skip` tier cars do NOT get an OutlierScore** — they never appear in the deals view
- `condition_adjusted_score` adjusts fair value ±5–10% based on `condition_signals`
- Detection pre-loads all cars + existing scores + recent price history in 3 bulk queries — no per-car DB queries in loop
- Detection runs automatically at the end of every scraper run
- **`deal_events` table**: written for genuinely *new* outliers only (not refreshes). Powers the SSE Arbitrage Radar stream.

## Data Quality

Run `python -m scraper.main --cleanup-prices` whenever bad data accumulates:
1. Marks active cars with `price < 30 000` as removed (leasing monthly rates)
2. Marks active cars with `price > 3 000 000` as removed (parse errors)
3. Wipes ALL `outlier_scores` (clears stale scores from old algorithm versions)
4. Re-runs full outlier detection on the clean dataset

## Market Stats Pipeline

`scraper/market_stats.py` — `compute_market_stats(db)` runs after each scraper cycle. Groups `status='removed'` cars by `(brand, model, fuel_type)`, computes `median_price`, `avg_price`, `avg_dom_days` (from `dom_days`), upserts into `market_stats` table (min 3 samples). Endpoint: `GET /api/v1/stats/market?brand=X&model=Y`.

`dom_days` is set on cars when `mark_unseen_as_removed()` runs — computed as `EXTRACT(epoch FROM (NOW() - first_seen_at)) / 86400`.

---

## API Design (mobile-ready from day one)

- All list endpoints use **cursor pagination** (`WHERE id > $last` ORDER BY id) — never OFFSET
- All errors return `{"error": {"code": str, "message": str}}` — never HTML
- Every list endpoint has a `limit` param with a maximum cap (100)
- API versioned at `/api/v1/`
- `/api/v1/cars` accepts 24 filter params — see `backend/api/routes/cars.py`

## Feature Status — ALL COMPLETE

### Phase 1 (migration 014)
`trim_level`, `dom_days`, `market_stats`, `alert_name`/`extra_filters`, BargainGauge, URL-persisted filters, React.memo/useMemo optimisations.

### Phase 2 (migration 015)
`users.plan`, `deal_events`, SSE Arbitrage Radar, SSE HttpOnly cookie auth, Trade-In Calculator, Analytics DOM column.

### Phase 3 (migration 016)
TCO Calculator, Compare market rows, CRM Kanban, Bulk Portfolio Analysis.

### Security Hardening (migration 017)
`user_sessions`, HttpOnly cookies, rate limiting, CSP/HSTS headers, DB CHECK constraints.

### UI Overhaul (2026-06-13)
Listings page redesigned to classifieds/marketplace style (horizontal cards, white background). TypeScript build errors fixed. auksjonen.no removed.

---

## Product Direction (from deep-research-report.md)

- **Official data first**: Statens vegvesen API (free, 50k calls/day) for technical data + PKK history. Brønnøysundregistrene Løsøreregisteret (free) for lien checks.
- **Explainable scoring**: Every deal card should show reason chips ("8% under lokalmedian", "Heftelsefri", "EU ok til 2026").
- **Watchlist separate from alerts**: `watchlist_items` for specific listings; `deal_alerts` for saved searches with notifications.
- **Target deal score weights**: 40% price vs fair value, 15% vehicle quality/risk, 15% liquidity, 10% spec desirability, 10% seller trust, 10% freshness/momentum.
- **FINN legal posture**: robots.txt and ToS prohibit systematic scraping. Current scraping works but treat official/partner API access as the long-term direction.

## ECC Reference

ECC skills library is at `C:\Users\hanso\ClaudeCode\ECC\skills\`. Key references:
- `data-scraper-agent/SKILL.md` — COLLECT→ENRICH→STORE pattern
- `fastapi-patterns/SKILL.md` — API structure
- `postgres-patterns/SKILL.md` — index strategy
- `continuous-learning-v2/SKILL.md` — instinct scoring
