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

## Running the project

```bash
# Install dependencies
uv pip install -e ".[dev]"

# Run DB migrations (requires .env with DATABASE_URL)
alembic upgrade head

# Start backend
uvicorn backend.main:app --reload

# Start frontend
cd frontend && npm install && npm run dev

# Run scraper manually
python -m scraper.main --dry-run     # preview only
python -m scraper.main               # actual run

# Run tests
pytest

# Lint
ruff check .
```

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

## Environment

- Secrets in `.env` (gitignored). Copy `.env.example` to `.env` to get started.
- `DATABASE_URL` must use `postgresql+asyncpg://` prefix for the app; alembic swaps to `psycopg2` automatically
- `GEMINI_API_KEY` is optional — scraper runs without AI enrichment if absent

## Scraping Guidelines

- HTML selectors for finn.no are in `config.yaml` under `scraper.finn.selectors` — change them there, not in `finn.py`
- When `scraper/sources/finn.py` returns 0 results, first check `config.yaml` selectors before editing code
- Always write a `price_history` row when updating a car's price — never update `cars.price` without it
- Rate limit: 1.2s delay between pages; respect robots.txt

## Outlier Detection

- Never flag a car as an outlier if `peer_group_size < 5` — prevents false positives on rare models
- Peer group: same brand+model, year ±2, mileage ±30k km (broadens to brand+model only if group < 5)
- Threshold: Z-score < -1.5 (and IQR < Q1 - 1.5×IQR as secondary signal)

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
