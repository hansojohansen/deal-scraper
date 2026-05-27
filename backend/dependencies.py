from typing import AsyncGenerator

from fastapi import Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session


class CursorPagination:
    def __init__(
        self,
        cursor: int | None = Query(None, description="Last seen car ID for cursor pagination"),
        limit: int = Query(20, ge=1, le=100),
    ):
        self.cursor = cursor
        self.limit = limit
