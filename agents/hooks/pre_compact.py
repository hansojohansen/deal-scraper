#!/usr/bin/env python3
"""
PreCompact hook — snapshots in-progress state before context compaction.
Registered in .claude/settings.json under hooks.PreToolUse (matcher: compact).
"""
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

CHECKPOINT_FILE = Path(".claude/compact_checkpoint.md")


def main():
    # Read any hook input from stdin (Claude Code passes context)
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    content = f"""# Compact Checkpoint — {now}

## Context preserved before compaction

- Project: deal-scraper (Norwegian car deal finder)
- Stack: FastAPI + SQLAlchemy 2.0 + asyncpg + Supabase + React/Vite
- Phases complete: 0 (DB), 1 (scraper), 2 (API), 3 (outlier detection), 4 (alerts), 5 (frontend)
- Active branch: master

## Key files
- `backend/` — FastAPI app, all routes at /api/v1/
- `scraper/sources/finn.py` — HTML scraper, selectors in config.yaml
- `engine/outlier.py` — Z-score + IQR detection, writes outlier_scores
- `agents/alert_agent.py` — standalone alert dispatch
- `frontend/src/` — React app at localhost:5173

## Known constraints
- DB: Supabase pgbouncer (transaction mode) → statement_cache_size=0 required
- Selectors: always edit config.yaml, not finn.py
- Pagination: cursor-only (WHERE id > $last), never OFFSET
- Errors: always {{error: {{code, message}}}} envelope

## Hook payload
```json
{json.dumps(payload, indent=2)}
```
"""
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_FILE.write_text(content, encoding="utf-8")
    print(f"[deal-scraper] Compact checkpoint written to {CHECKPOINT_FILE}")


if __name__ == "__main__":
    main()
