import random
import time


def with_retry(fn, *args, max_attempts: int = 3, base_delay: float = 2.0, **kwargs):
    """Call fn(*args, **kwargs) up to max_attempts times with exponential backoff + jitter."""
    for attempt in range(max_attempts):
        try:
            return fn(*args, **kwargs)
        except Exception:
            if attempt == max_attempts - 1:
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)
