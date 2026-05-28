# Project Handoff — deal-scraper

## Current State (2026-05-28)

**App is offline** — taken down from giscademy.com to complete auth + security hardening locally before redeployment. GitHub Actions auto-deploy still wired up; a push to `master` will redeploy.

---

## What's Working (locally verified)

- **Scraper**: Runs every 6h via GitHub Actions cron. Scrapes ~72k finn.no listings per run.
- **Price parsing**: Uses `article.get_text(" ")` so "640 000 kr" stays intact across HTML tag boundaries.
- **Deal detection**: Windowed median algorithm (`engine/outlier.py`). Flags cars >20% below peer median. Quality tiers: `excellent`, `good`, `check`.
- **Auth system** (NEW — migrations 010, 011 applied): Full JWT auth with register, login, forgot/reset password. Alerts are now user-scoped — users only see their own. All alert endpoints require a Bearer token.
- **Frontend auth UI** (NEW): Login, Register, ForgotPassword, ResetPassword pages (dark theme). ProtectedRoute redirects to `/login`. ErrorBoundary, ErrorState, EmptyState, NotFound components.
- **Security hardening** (NEW): slowapi rate limiting, structured JSON request logging, security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- **Performance indexes** (NEW — migration 011): `idx_cars_status`, `idx_cars_source_status`, `idx_cars_price` (partial), `idx_cars_mileage` (partial).
- **Peer comparison**: Chevron on any deal expands a table of comparable listings.
- **Images**: Scraped from listing card `<img>` tags, stored in `cars.image_url`.
- **Alerts**: Email notifications for new deals matching saved filters (scoped to authenticated user).
- **auksjonen.no scraper**: Calls the site's REST API directly (~1780 live auction listings/run).

---

## Sources

| Source | Status | Notes |
|--------|--------|-------|
| finn.no | Working | ~72k listings/run, full detail enrichment |
| auksjonen.no | Working | ~1780 listings/run via JSON API |
| nettbil.no | Disabled | B2B dealer platform — requires Autosys credentials. Stub returns `[]`. |

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

Port 8000 has a phantom process on the dev machine that survives reboots. Backend runs on **port 8080** locally; `frontend/vite.config.ts` proxies `/api` and `/health` to `http://localhost:8080`. On the server (Docker), backend still binds 8000 internally — no change needed there.

---

## DB Migrations

| Migration | What it does |
|-----------|-------------|
| 001–009 | Base schema, cars, price_history, outlier_scores, deal_alerts, image_url |
| 010 | `users` table + `user_id` FK on `deal_alerts` |
| 011 | Performance indexes on `cars.status`, `cars.source+status`, `cars.price`, `cars.mileage` |

Current head: **011**. Applied automatically on every deploy via `alembic upgrade head`.

---

## Deployment Checklist (before redeploying to giscademy.com)

The production `.env` on the droplet needs two new variables:

```
JWT_SECRET=<strong-random-secret>         # generate: python -c "import secrets; print(secrets.token_hex(32))"
ACCESS_TOKEN_EXPIRE_HOURS=24
```

Set `CORS_ORIGINS=["https://giscademy.com"]` (not localhost) on the server.

Steps:
1. SSH into droplet, update `/home/deploy/deal-scraper/.env` with the above
2. Push to `master` — GitHub Actions will build, scp, pull, migrate, restart

---

## Known Issues / Next Steps

- **Email not configured**: `send_reset_email` skips silently if `SMTP_HOST`/`SMTP_USER` are unset. Forgot-password flow does nothing visible. Add SMTP credentials (e.g. Resend/Mailgun) before production use.
- **Email verification unimplemented**: `users.is_verified` column exists but no verification email is sent on register and no endpoints gate on it. Implement or drop before launch.
- **auksjonen image URLs**: `image_url` is `NULL` for auksjonen listings — CDN prefix for `mainImage` not confirmed. Check a live API response to find the base URL.
- **auksjonen mileage**: Always `NULL` — may be parseable from the title string for some listings.

---

## Useful Commands (on droplet)

```bash
# Run scraper manually
docker compose exec backend python -m scraper.main

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
