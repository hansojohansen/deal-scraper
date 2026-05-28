"""Input sanitization utilities for user-supplied string fields."""
import re


def sanitize_str(value: str | None, max_len: int = 200) -> str | None:
    """Strip whitespace, remove HTML tags, truncate to max_len. Returns None if empty after sanitizing."""
    if value is None:
        return None
    value = value.strip()
    value = re.sub(r"<[^>]+>", "", value)
    value = value[:max_len].strip()
    return value or None
