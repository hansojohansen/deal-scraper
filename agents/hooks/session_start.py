#!/usr/bin/env python3
"""
SessionStart hook — loads scraper state and prints context for Claude to inject.
Registered in .claude/settings.json under hooks.SessionStart.
"""
import json
from pathlib import Path

STATE_FILE = Path(".claude/scraper_state.json")


def main():
    if not STATE_FILE.exists():
        print("[deal-scraper] No prior scraper state found — fresh session.")
        return

    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[deal-scraper] Could not read scraper state: {e}")
        return

    last = state.get("last_run", {})
    vendor = state.get("vendor_health", {})
    instincts = state.get("learned_instincts", [])

    lines = ["[deal-scraper] Session context from last run:"]

    if last:
        lines.append(f"  Last run: {last.get('at', '?')} | "
                     f"new={last.get('new', 0)} updated={last.get('updated', 0)} "
                     f"pages={last.get('pages', 0)} errors={last.get('errors', 0)}")

    finn_health = vendor.get("finn", {})
    if finn_health.get("status") == "DEGRADED":
        consecutive = finn_health.get("consecutive_zero_pages", 0)
        lines.append(f"  WARNING: finn.no returned 0 results {consecutive}x in a row — "
                     "check config.yaml selectors before running scraper.")

    for instinct in instincts[-5:]:  # inject last 5 learned instincts
        lines.append(f"  Instinct [{instinct.get('confidence', '?')}]: {instinct.get('text', '')}")

    print("\n".join(lines))


if __name__ == "__main__":
    main()
