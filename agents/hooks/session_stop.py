#!/usr/bin/env python3
"""
Stop hook — persists scraper state and run summary for next session.
Registered in .claude/settings.json under hooks.Stop.
Input (stdin): JSON with tool_use info from Claude Code.
"""
import json
from datetime import UTC, datetime
from pathlib import Path

STATE_FILE = Path(".claude/scraper_state.json")
FEEDBACK_FILE = Path("data/feedback.json")


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"vendor_health": {"finn": {}}, "learned_instincts": []}


def _load_last_run() -> dict:
    if not FEEDBACK_FILE.exists():
        return {}
    try:
        data = json.loads(FEEDBACK_FILE.read_text(encoding="utf-8"))
        sessions = data.get("sessions", [])
        return sessions[-1] if sessions else {}
    except Exception:
        return {}


def main():
    state = _load_state()
    last_run = _load_last_run()

    if last_run:
        state["last_run"] = last_run
        # Update vendor health based on last run
        if last_run.get("new", 0) == 0 and last_run.get("updated", 0) == 0 and last_run.get("pages", 0) > 0:
            finn = state["vendor_health"].setdefault("finn", {})
            finn["status"] = "DEGRADED"
            finn["consecutive_zero_pages"] = finn.get("consecutive_zero_pages", 0) + 1
            finn["last_degraded_at"] = datetime.now(UTC).isoformat()
        else:
            state["vendor_health"]["finn"] = {"status": "OK"}

    state["updated_at"] = datetime.now(UTC).isoformat()

    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
