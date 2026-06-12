from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.api.routes import alerts, auth, b2b, cars, crm, health, outliers, stats, watchlist
from backend.config import settings
from backend.db.session import engine
from backend.exceptions import ApiError, api_error_handler, generic_error_handler
from backend.limiter import limiter
from backend.middleware.logging import RequestLoggingMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    if len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 characters — set it in .env")
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Deal Scraper API",
        description="Norwegian car deal scraper — historical prices, outlier detection, deal alerts",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response

    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(cars.router)
    app.include_router(stats.router)
    app.include_router(outliers.router)
    app.include_router(alerts.router)
    app.include_router(watchlist.router)
    app.include_router(b2b.router)
    app.include_router(crm.router)
    return app


app = create_app()
