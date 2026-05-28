"""JWT creation/decoding and password hashing utilities."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.access_token_expire_hours)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str:
    """Return user_id string from a valid JWT, or raise HTTP 401."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def generate_reset_token() -> str:
    """Return a cryptographically secure raw token (sent to user via email)."""
    return secrets.token_urlsafe(32)


def hash_reset_token(raw: str) -> str:
    """Store bcrypt hash of the raw token, never the raw token itself."""
    return _pwd_context.hash(raw)


def verify_reset_token(raw: str, hashed: str) -> bool:
    return _pwd_context.verify(raw, hashed)
