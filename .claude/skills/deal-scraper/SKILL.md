---
name: deal-scraper
description: Project instincts for the Norwegian car deal scraper. Invoked automatically when working on this project.
---

## Architecture instincts

- DB connection uses pgbouncer (transaction mode) — always include `statement_cache_size=0` in engine connect_args
- All list endpoints use cursor pagination (`WHERE id > $last ORDER BY id`) — never OFFSET
- All errors return `{"error": {"code": str, "message": str}}` — never plain HTTPException
- Import order for lazy DB imports: always inside the `if not dry_run:` block in scraper

## Scraper instincts

- finn.no selectors live in `config.yaml` under `scraper.finn.selectors` — change there, not in `finn.py`
- When scraper returns 0 results: check selectors in config.yaml first, then check network
- Cursor state is in `scraper/state/cursor.json` (gitignored) — delete to force full re-scrape
- Rate limit: 1.2s delay between pages — do not remove

## Outlier detection instincts

- Never flag as outlier when peer_group_size < 5 (config: min_peer_group_size)
- Peer group broadens from (brand+model+year±2+mileage±30k) to (brand+model only) when < 5 peers
- Both Z-score AND IQR must fire to flag — prevents single-signal false positives
- Reason string format: "287,000 NOK is 38% below peer avg 463,000 NOK (n=12)"

## Alert instincts

- Alert matching uses bulk JOIN query — never match per-car in a loop
- alert_matches deduplicates — same (alert_id, car_id) pair is never notified twice
- push_token and notify_push fields exist on DealAlert but are stub-only until Phase 8

## Frontend instincts

- API proxy: Vite proxies /api/* to localhost:8000 — no CORS issues in dev
- TanStack Query keys: ["cars", filters] for listings, ["outliers"], ["stats"], ["alerts"]
- Infinite scroll uses IntersectionObserver + useInfiniteQuery — do not replace with manual fetch

## GitHub Actions instincts

- Scraper runs every 6h on cron 0 */6 * * *
- feedback.json commits use [skip ci] to prevent infinite loop
- Alembic upgrade runs before each scrape to keep schema current
- DATABASE_URL secret must be the psycopg2 form for Alembic (env.py swaps drivers automatically)
