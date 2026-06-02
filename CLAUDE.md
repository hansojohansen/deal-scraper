# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Norwegian car deal scraper — scrapes finn.no, tracks historical prices, detects price outliers, and sends deal alerts. API-first architecture to support iOS/Android in the future.

GitHub: https://github.com/hansojohansen/deal-scraper

## Stack

- **Backend**: Python 3.12, FastAPI (async), SQLAlchemy 2.0 async, asyncpg
- **Database**: Supabase (hosted PostgreSQL) — connection string in `.env`
- **Scraping**: requests + BeautifulSoup, Playwright for JS-rendered pages
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

# Start backend — use port 8080 locally (port 8000 has a stuck phantom process on the dev machine)
uvicorn backend.main:app --port 8080 --reload

# Start frontend (Vite proxies /api to localhost:8080)
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
```

## Auth System

Full JWT auth is implemented. Key files:

- `backend/security.py` — `hash_password`, `verify_password`, `create_access_token`, `decode_access_token`, `generate_reset_token`, `hash_reset_token`, `verify_reset_token`. Uses `bcrypt` package directly — **do not use `passlib`**, it is incompatible with bcrypt 5.x (its `detect_wrap_bug()` test sends a >72-byte password which bcrypt 5.x rejects with ValueError).
- `backend/api/routes/auth.py` — `/api/v1/auth/{register,login,forgot-password,reset-password,me}`
- `backend/db/crud/users.py` — async CRUD for `users` table
- `backend/dependencies.py` — `get_current_user`, `get_current_user_optional` (HTTPBearer)
- `frontend/src/contexts/AuthContext.tsx` — JWT stored in `localStorage`; auto-injects `Authorization: Bearer` header
- `frontend/src/components/ProtectedRoute.tsx` — redirects to `/login` with `state.next` if unauthenticated

Alerts require auth. Users see only their own alerts (filtered by `user_id`).

**Known auth limitation**: JWT in `localStorage` is discouraged by OWASP. Planned upgrade: HttpOnly cookies + BFF pattern + passkeys/Google OAuth.

## Git Workflow

After every meaningful change, commit and push:
```bash
git add <files>
git commit -m "feat: add finn.no scraper with pagination"
git push
```

Commit prefix conventions: `feat:` `fix:` `chore:` `test:` `docs:`

## Deployment

Push to `master` triggers GitHub Actions auto-deploy:
1. Builds frontend (`npm ci && npm run build`) in CI
2. SCPs `frontend/dist/` to droplet at `/home/deploy/deal-scraper/frontend/`
3. SSHes to droplet: `git pull` → `alembic upgrade head` → `docker compose up -d --build`

**Droplet**: DigitalOcean Ubuntu 24.04. App lives at `/home/deploy/deal-scraper`. The `deploy` user runs Docker.

**Required GitHub Secrets**: `DEPLOY_HOST` (droplet IP), `DEPLOY_USER` (`deploy`), `DEPLOY_SSH_KEY` (ed25519 private key — must match a public key in `/home/deploy/.ssh/authorized_keys`).

**SSL**: Let's Encrypt certs at `/etc/letsencrypt/live/<domain>/`. Update `nginx/nginx.conf` with the real domain name when issuing the cert.

**Architecture**:
```
Internet → Nginx (80→443 redirect, 443 SSL)
              ├── /        → frontend/dist/ (static React SPA)
              ├── /api/*   → backend:8000 (FastAPI)
              └── /health  → backend:8000/health
```

**Before redeploying** — add to production `.env`:
```
JWT_SECRET=<strong-random-secret>
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

- HTML selectors for finn.no are in `config.yaml` under `scraper.finn.selectors` — change them there, not in `finn.py`
- When `scraper/sources/finn.py` returns 0 results, first check `config.yaml` selectors before editing code
- Price parsing uses `article.get_text(" ", strip=True)` so "640 000 kr" stays as one string across HTML tag boundaries. If finn.no redesigns and prices break, set `selectors.price` in `config.yaml` to a CSS selector string — no code change needed.
- **Leasing detection**: `_parse_price()` returns `None` for cards containing `kr/mnd` / `leasing`. `_normalise()` sets `listing_type='lease'`. `is_relevant()` drops lease listings before DB storage.
- **Price cap**: `config.yaml` → `filter.max_price_nok: 3000000`. `is_relevant()` rejects above this. Cars scraped before the cap: run `--cleanup-prices`.
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

- Deal threshold: price >20% below peer median (`deal_threshold: -0.20` in `config.yaml`)
- Stale threshold: remove flag when price rises within 5% of median (`stale_threshold: -0.05`)
- Quality tiers: `excellent` (>25% below + Norwegian reg + valid EU), `good` (default deal), `check` (import or missing EU data), `skip` (price <30k NOK, >400k km, >3M NOK, or `listing_type='lease'`)
- **`skip` tier cars do NOT get an OutlierScore** — they never appear in the deals view
- `condition_adjusted_score` adjusts fair value ±5–10% based on `condition_signals` (service history, accident history, rust, owner count)
- Detection pre-loads all cars + existing scores + recent price history in 3 bulk queries — no per-car DB queries in loop, avoids Supabase statement timeouts
- Detection runs automatically at the end of every scraper run

## Data Quality

Run `python -m scraper.main --cleanup-prices` whenever bad data accumulates:
1. Marks active cars with `price < 30 000` as removed (leasing monthly rates)
2. Marks active cars with `price > 3 000 000` as removed (parse errors)
3. Wipes ALL `outlier_scores` (clears stale scores from old algorithm versions)
4. Re-runs full outlier detection on the clean dataset

## API Design (mobile-ready from day one)

- All list endpoints use **cursor pagination** (`WHERE id > $last` ORDER BY id) — never OFFSET
- All errors return `{"error": {"code": str, "message": str}}` — never HTML
- Every list endpoint has a `limit` param with a maximum cap (100)
- API versioned at `/api/v1/`
- `/api/v1/cars` accepts 24 filter params — see `backend/api/routes/cars.py`

## Product Direction (from deep-research-report.md)

The research report (`deep-research-report.md` in repo root) describes the ideal Norwegian car deals product. Key directions:

- **Official data first**: Statens vegvesen API (free, 50k calls/day) for technical data + PKK history. Brønnøysundregistrene Løsøreregisteret (free) for lien checks. These are the next major enrichment layer.
- **Explainable scoring**: Every deal card should show reason chips ("8% under lokalmedian", "Heftelsefri", "EU ok til 2026") not just a percentage.
- **Watchlist separate from alerts**: `watchlist_items` table for saving specific listings; `deal_alerts` for saved searches with notifications.
- **Target deal score weights**: 40% price vs fair value, 15% vehicle quality/risk, 15% liquidity, 10% spec desirability, 10% seller trust, 10% freshness/momentum.
- **Swipe UX**: Additive discovery surface on top of search — not a replacement.
- **FINN legal posture**: robots.txt and ToS prohibit systematic scraping. Current scraping works but treat official/partner API access as the long-term direction.

## ECC Reference

ECC skills library is at `C:\Users\hanso\ClaudeCode\ECC\skills\`. Key references:
- `data-scraper-agent/SKILL.md` — COLLECT→ENRICH→STORE pattern
- `fastapi-patterns/SKILL.md` — API structure
- `postgres-patterns/SKILL.md` — index strategy
- `continuous-learning-v2/SKILL.md` — instinct scoring
