import uuid
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import session_factory
from backend.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    """
    Auth resolution order:
    1. HttpOnly cookie 'session'  — browser clients (validated against user_sessions table)
    2. Authorization: Bearer      — CLI / programmatic callers (JWT-only, no session table)

    SameSite=Strict on the cookie means no CSRF token is needed for cookie auth.
    """
    from backend.db.crud import sessions as sessions_crud
    from backend.db.crud import users as users_crud

    cookie_token = request.cookies.get("session")

    if cookie_token:
        user_id_str = decode_access_token(cookie_token)
        # Verify the session is still active (not revoked on logout)
        session = await sessions_crud.get_by_token(db, cookie_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired or revoked")
    elif credentials:
        # Bearer token path — for CLI / programmatic API use; no session table check
        user_id_str = decode_access_token(credentials.credentials)
    else:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await users_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_current_user(request, credentials, db)
    except HTTPException:
        return None


class CursorPagination:
    def __init__(
        self,
        cursor: int | None = Query(None, description="Last seen car ID for cursor pagination"),
        limit: int = Query(20, ge=1, le=100),
    ):
        self.cursor = cursor
        self.limit = limit
