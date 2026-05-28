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
python -m scraper.main --dry-run     # preview only
python -m scraper.main               # actual run

# Run tests
pytest

# Lint
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

## Git Workflow

After every meaningful change, commit and push:
```bash
git add <files>
git commit -m "feat: add finn.no scraper with pagination"
git push
```

Commit prefix conventions:
- `feat:` new feature
- `fix:` bug fix
- `chore:` tooling/config/deps
- `test:` tests only
- `docs:` documentation

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
- Always write a `price_history` row when updating a car's price — never update `cars.price` without it
- Rate limit: 1.2s delay between pages; respect robots.txt

## Outlier Detection

Algorithm: **windowed median** (`engine/outlier.py`) — finds same brand+model peers within ±1yr/±25k km (tight) or ±3yr/±50k km (loose fallback), uses their median as fair value. Minimum 3 peers required.

- Deal threshold: price >20% below peer median (`deal_threshold: -0.20` in `config.yaml`)
- Stale threshold: remove flag when price rises within 5% of median (`stale_threshold: -0.05`)
- Quality tiers: `excellent` (>25% below + Norwegian reg + valid EU), `good` (default deal), `check` (import or missing EU data), `skip` (price <30k NOK or mileage >400k km)
- Detection runs automatically at the end of every scraper run — errors are caught and logged, never silent

## API Design (mobile-ready from day one)

- All list endpoints use **cursor pagination** (`WHERE id > $last` ORDER BY id) — never OFFSET
- All errors return `{"error": {"code": str, "message": str}}` — never HTML
- Every list endpoint has a `limit` param with a maximum cap (100)
- API versioned at `/api/v1/`

## ECC Reference

ECC skills library is at `C:\Users\hanso\ClaudeCode\ECC\skills\`. Key references:
- `data-scraper-agent/SKILL.md` — COLLECT→ENRICH→STORE pattern
- `fastapi-patterns/SKILL.md` — API structure
- `postgres-patterns/SKILL.md` — index strategy
- `continuous-learning-v2/SKILL.md` — instinct scoring
