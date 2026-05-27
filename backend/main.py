from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import alerts, cars, health, outliers, stats
from backend.config import settings
from backend.db.session import engine
from backend.exceptions import ApiError, api_error_handler, generic_error_handler


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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)
    app.include_router(health.router)
    app.include_router(cars.router)
    app.include_router(stats.router)
    app.include_router(outliers.router)
    app.include_router(alerts.router)
    return app

app = create_app()
