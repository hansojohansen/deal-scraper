# Project Handoff — deal-scraper

## Current State (2026-06-02)

**App is code-ready for deploy** — CI passes. Deploy fails because GitHub Secrets (`DEPLOY_HOST`, `DEPLOY_SSH_KEY`) need to be configured and the production `.env` on the droplet needs updating before the deploy workflow can SSH in.

---

## What's Working (locally verified)

- **Scraper**: Runs every 6h via GitHub Actions cron. ~5 169 active listings (after cleaning bad data).
- **Price parsing**: Leasing listings (kr/mnd) are now correctly rejected — monthly prices no longer appear as purchase prices.
- **Price cap**: 3M NOK max enforced in `scraper/filters.py` and `config.yaml` (`filter.max_price_nok`). Impossible 30M NOK listings are rejected at ingest and marked removed on cleanup.
- **Deal detection**: Windowed median (`engine/outlier.py`). Bulk pre-loads all data upfront — no per-car DB queries in loop, no statement timeouts on Supabase. `skip` tier cars never get an OutlierScore. 372 real deals currently flagged.
- **Auth system** (migrations 010–011): Full JWT auth — register, login, forgot/reset password. `bcrypt` used directly (not `passlib` — incompatible with bcrypt 5.x).
- **Detail enrichment** (`--enrich-details` flag): Fetches finn.no detail pages for up to 50 cars per run. Extracts description, color, seller_type, drivetrain, num_owners, EU inspection dates, body_type, engine_size_cc.
- **Gemini description analysis** (`scraper/enrich.py`): Parses Norwegian listing descriptions into structured `condition_signals` JSONB: `is_one_owner`, `has_service_history`, `has_accident_history`, `has_rust`, `is_smoke_free`, `has_warranty`, `recently_serviced`, `has_new_tires`, `is_imported` + `green_flags`/`red_flags`. Runs after detail enrichment if `GEMINI_API_KEY` is set.
- **Condition-adjusted deal score**: `condition_adjusted_score` on `OutlierScore` — fair value adjusted ±5–10% based on condition signals. Stored alongside raw score.
- **Frontend filters**: 24 API filter params. UI has: brand/model, year, price, km range (min+max), fuel, transmission, drivetrain, seller type, horsepower range, max owners, listing type, norsk reg / servicehistorikk / ulykkefri checkboxes.
- **Condition badges on cards**: Green (1 eier, servicebok, nylig serv.) and red (ulykke, rust, import) badges from `condition_signals`.
- **Deals page**: Table + card views, sortable columns, tier filter (Topp/God/Sjekk), peer comparison panel. No stale ols/zscore scores — all 372 scores are clean median-based.
- **Alerts**: User-scoped email notifications for deals matching saved filters.
- **auksjonen.no scraper**: ~2 140 listings/run via JSON API.

---

## Sources

| Source | Status | Notes |
|--------|--------|-------|
| finn.no | Working | ~5 169 active listings (post cleanup), full detail enrichment |
| auksjonen.no | Working | ~2 140 listings/run via JSON API |
| nettbil.no | Disabled | B2B dealer platform — requires Autosys credentials. Stub returns `[]`. |

---

## DB Migrations

| Migration | What it does |
|-----------|-------------|
| 001–009 | Base schema, cars, price_history, outlier_scores, deal_alerts, image_url |
| 010 | `users` table + `user_id` FK on `deal_alerts` |
| 011 | Performance indexes on `cars.status`, `cars.source+status`, `cars.price`, `cars.mileage` |
| 012 | `cars`: description, color, seller_type, drivetrain, num_owners, condition_signals (JSONB). `outlier_scores`: condition_adjusted_score |

Current head: **012**. Applied automatically on every deploy via `alembic upgrade head`.

---

## Data Quality Rules

- Cars priced **< 30 000 NOK** are marked `status='removed'` — these are leasing monthly rates misread as purchase prices.
- Cars priced **> 3 000 000 NOK** are marked `status='removed'` — parse errors.
- Leasing cards (containing `kr/mnd` / `leasing` text) set `listing_type='lease'` and are filtered before DB storage.
- Run `python -m scraper.main --cleanup-prices` to re-apply these rules and wipe/re-run outlier detection if bad data accumulates.

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

## Local Dev Port Note

Port 8000 has a phantom process on the dev machine that survives reboots. Backend runs on **port 8080** locally; `frontend/vite.config.ts` proxies `/api` and `/health` to `http://localhost:8080`. On the server (Docker), backend still binds 8000 internally.

---

## Known Issues

- **Email not configured**: `send_reset_email` skips silently if `SMTP_HOST`/`SMTP_USER` are unset. Forgot-password flow does nothing visible. Use Resend or Postmark.
- **Email verification unimplemented**: `users.is_verified` column exists but no verification email is sent on register. Implement or drop before launch.
- **auksjonen image URLs**: `image_url` is `NULL` for auksjonen listings — CDN prefix for `mainImage` not confirmed.
- **auksjonen mileage**: Always `NULL`.
- **Condition signals empty for most cars**: `--enrich-details` only runs 50 cars/pass. Gemini enrichment requires `GEMINI_API_KEY` in `.env`. Will fill in gradually over scraper runs.
- **Auth uses localStorage**: JWT is stored in `localStorage` (OWASP warns against this). Planned upgrade: HttpOnly cookies + BFF pattern.

---

## Next Features (from deep-research-report.md)

Priority order based on the research report (`deep-research-report.md` in repo root):

### Tier 1 — High impact
1. **Statens vegvesen API** — Official technical vehicle data + PKK/EU-control history keyed by reg number. Free API (50k calls/day). Enriches normalization and deal scoring.
2. **Brønnøysundregistrene lien check** — Løsøreregisteret vehicle API (free). "Heftelsefri ✓" badge = huge trust signal. Penalty in deal score if lien found.
3. **Watchlist / Favorites** — `watchlist_items` table + heart button on cards + Watchlist page. Separate from saved searches/alerts.
4. **Explainable score chips** — Replace plain "−17%" badge with reason chips: "8% under lokalmedian", "Heftelsefri", "EU ok til 2026", "Privat selger", "Prisnedgang siste 14 dager".
5. **Compare view** — Side-by-side comparison of up to 4 cars.

### Tier 2 — Medium effort
6. **Swipe discovery deck** — Tinder-style like/pass/save with card prefetching.
7. **Monthly cost filter + display** — Estimated monthly cost on cards (price ÷ 60 months).
8. **Depreciation curve per model** — Use price_history data to show age/mileage chart on car detail page.
9. **Liquidity/demand signal** — Time-to-removal from first_seen_at/last_seen_at. "Høy etterspørsel" badge.

### Tier 3 — Longer term
10. **Auth security upgrade** — Passkeys + Google/Apple OAuth + HttpOnly cookies + BFF pattern. OWASP warns against localStorage for JWT.
11. **OFV commercial data** — Paid dataset with new prices, depreciation curves, equipment specs.

---

## Useful Commands

```bash
# Run scraper manually (no page scraping, just auksjonen + enrich + detect)
python -m scraper.main --enrich-details --max-pages 0

# Full scrape
python -m scraper.main

# Clean up bad-price data and re-run detection
python -m scraper.main --cleanup-prices

# On droplet
docker compose exec backend python -m scraper.main
docker compose exec backend alembic current
docker compose logs backend --tail=50
docker compose up -d --build
```
