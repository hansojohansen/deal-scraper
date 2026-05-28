# Project Handoff — deal-scraper

## Current State (2026-05-28)

**App is live at https://giscademy.com** — fully deployed, HTTPS working, GitHub Actions auto-deploys on every push to `master`.

---

## What's Working

- **Scraper**: Runs every 6h via GitHub Actions cron. Scrapes ~72k finn.no listings per run. Extracts title, brand, model, year, mileage, fuel type, transmission, horsepower, price, location, image URL.
- **Price parsing**: Fixed (commit `2514e03`) — uses `article.get_text(" ")` so "640 000 kr" stays intact across HTML tag boundaries. Previously only ~4.7% of cars had prices; next full scrape will backfill all.
- **Deal detection**: Windowed median algorithm (`engine/outlier.py`). Finds same brand+model peers within ±1yr/±25km (tight) or ±3yr/±50km (loose). Flags cars >20% below peer median. Runs automatically after each scrape, errors are caught and logged.
- **Frontend**: React SPA at `/`. Pages: Listings (infinite scroll + filters), Beste Kjøp (deals with peer comparison), Stats, Alerts.
- **Peer comparison**: Chevron on any deal expands a table of comparable listings sorted by price.
- **Images**: Scraped from listing card `<img>` tags, stored in `cars.image_url`, shown in listings with letter-avatar fallback.
- **Alerts**: Email notifications for new deals matching saved filters.
- **auksjonen.no scraper** (commit `1b729a5`): Fixed. Site is AngularJS client-side rendered so HTML scraping returned nothing. Rewrote to call the site's REST API directly (`GET /api/auctions/search?category=bruktbil`). Returns ~1780 live auction listings per run with title, price, city, auction end time.

---

## Sources

| Source | Status | Notes |
|--------|--------|-------|
| finn.no | Working | ~72k listings/run, full detail enrichment |
| auksjonen.no | Working | ~1780 listings/run via JSON API |
| nettbil.no | Disabled | B2B dealer platform — requires Autosys dealer credentials, prices always blurred, no public API. Stub returns `[]`. |

---

## Architecture

```
Internet → Nginx (80→443 redirect, 443 SSL giscademy.com)
              ├── /        → frontend/dist/ (static React SPA)
              ├── /api/*   → backend:8000 (FastAPI)
              └── /health  → backend:8000/health

GitHub Actions (push to master):
  1. npm ci && npm run build
  2. scp frontend/dist/ → droplet
  3. ssh → git pull → alembic upgrade head → docker compose up -d --build
```

**Droplet**: DigitalOcean Ubuntu 24.04, `/home/deploy/deal-scraper`, `deploy` user runs Docker.

---

## Known Issues / Next Steps

- **Price backfill pending**: Existing cars with `price = NULL` (scraped before the fix) will be backfilled on the next scraper run.
- **auksjonen image URLs**: `image_url` is stored as `NULL` for auksjonen listings — the CDN prefix for the `mainImage` field is not yet confirmed. Check a live API response to find the CDN base URL and add it to `auksjonen.py`'s `_normalise()`.
- **auksjonen mileage**: Not available in the API response — always `NULL`. May be parseable from the title string for some listings (e.g., "2015 Kia Soul EV 118000km").

---

## Useful Commands (on droplet)

```bash
# Run scraper manually
docker compose exec backend python -m scraper.main

# Run detection only (one-liner)
docker compose exec backend python -c "import asyncio,os; from sqlalchemy.ext.asyncio import create_async_engine,AsyncSession; from engine.outlier import run_detection; print(asyncio.run(run_detection(AsyncSession(create_async_engine(os.environ['DATABASE_URL'])))))"

# Check migration state
docker compose exec backend alembic current

# View backend logs
docker compose logs backend --tail=50

# Restart containers
docker compose up -d --build
```

---

## GitHub Secrets Required

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | Droplet IP |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | ed25519 private key matching `/home/deploy/.ssh/authorized_keys` |

---

## DB Migrations

Migrations in `migrations/versions/`. Latest: `009_add_image_url`. Applied automatically on every deploy via `alembic upgrade head`.
