import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import User


async def create(db: AsyncSession, email: str, hashed_pw: str) -> User:
    user = User(email=email.lower(), hashed_pw=hashed_pw)
    db.add(user)
    await db.flush()
    return user


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def set_reset_token(
    db: AsyncSession, user: User, token_hash: str, expires_at: datetime
) -> None:
    user.reset_token = token_hash
    user.reset_expires_at = expires_at


async def clear_reset_token(db: AsyncSession, user: User) -> None:
    user.reset_token = None
    user.reset_expires_at = None


async def set_verified(db: AsyncSession, user: User) -> None:
    user.is_verified = True
    user.verify_token = None


async def update_password(db: AsyncSession, user: User, hashed_pw: str) -> None:
    user.hashed_pw = hashed_pw
