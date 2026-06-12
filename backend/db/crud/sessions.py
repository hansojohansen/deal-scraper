import hashlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import UserSession


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(
    db: AsyncSession, user_id: uuid.UUID, token: str, expires_at: datetime
) -> UserSession:
    session = UserSession(user_id=user_id, token_hash=_hash(token), expires_at=expires_at)
    db.add(session)
    await db.flush()
    return session


async def get_by_token(db: AsyncSession, token: str) -> UserSession | None:
    token_hash = _hash(token)
    result = await db.execute(
        select(UserSession)
        .where(UserSession.token_hash == token_hash)
        .where(UserSession.expires_at > datetime.now(UTC))
    )
    return result.scalar_one_or_none()


async def delete_by_token(db: AsyncSession, token: str) -> None:
    await db.execute(
        delete(UserSession).where(UserSession.token_hash == _hash(token))
    )


async def purge_expired(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        delete(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.expires_at <= datetime.now(UTC),
        )
    )
