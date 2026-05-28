from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.api.routes import alerts, auth, cars, health, outliers, stats
from backend.config import settings
from backend.db.session import engine
from backend.exceptions import ApiError, api_error_handler, generic_error_handler
from backend.middleware.logging import RequestLoggingMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
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
        return response

    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(cars.router)
    app.include_router(stats.router)
    app.include_router(outliers.router)
    app.include_router(alerts.router)
    return app


app = create_app()
