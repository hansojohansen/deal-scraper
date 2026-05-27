from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,
    connect_args={"statement_cache_size": 0},
)

session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
