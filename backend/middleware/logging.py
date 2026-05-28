"""Structured JSON request logging middleware."""
import json
import logging
import time
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from backend.config import settings

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(message)s",
)
logger = logging.getLogger("api")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        ms = round((time.monotonic() - start) * 1000)

        user_id = getattr(request.state, "user_id", None)

        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "ms": ms,
            "ip": request.client.host if request.client else None,
            "user_id": user_id,
        }
        level = logging.WARNING if response.status_code >= 500 else logging.INFO
        logger.log(level, json.dumps(record))
        return response
