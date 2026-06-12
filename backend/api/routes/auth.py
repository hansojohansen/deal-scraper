import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.crud import sessions as sessions_crud
from backend.db.crud import users as users_crud
from backend.dependencies import get_current_user, get_db
from backend.limiter import limiter
from backend.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)
from backend.security import (
    create_access_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    verify_password,
    verify_reset_token,
)
from notifications.email import send_reset_email

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_COOKIE_NAME = "session"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.access_token_expire_hours * 3600,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=_COOKIE_NAME, path="/")


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("10/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await users_crud.get_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = await users_crud.create(db, body.email, hash_password(body.password))
    await db.commit()
    await db.refresh(user)
    return UserResponse(user_id=str(user.id), email=user.email, is_verified=user.is_verified)


@router.post("/login", response_model=UserResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await users_crud.get_by_email(db, body.email)
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user.id))
    expires_at = datetime.now(UTC) + timedelta(hours=settings.access_token_expire_hours)

    await sessions_crud.purge_expired(db, user.id)
    await sessions_crud.create_session(db, user.id, token, expires_at)
    await db.commit()

    _set_session_cookie(response, token)
    return UserResponse(
        user_id=str(user.id),
        email=user.email,
        is_verified=user.is_verified,
        plan=user.plan,
    )


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(_COOKIE_NAME)
    if token:
        await sessions_crud.delete_by_token(db, token)
        await db.commit()
    _clear_session_cookie(response)


@router.post("/forgot-password", status_code=200)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request, body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    user = await users_crud.get_by_email(db, body.email)
    if user:
        raw = generate_reset_token()
        expires = datetime.now(UTC) + timedelta(minutes=settings.password_reset_expire_minutes)
        await users_crud.set_reset_token(db, user, hash_reset_token(raw), expires)
        await db.commit()
        try:
            await send_reset_email(user.email, raw)
        except Exception:
            pass
    return {}


@router.post("/reset-password", status_code=200)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await users_crud.get_by_email(db, body.email)
    if not user or not user.reset_token or not user.reset_expires_at:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if datetime.now(UTC) > user.reset_expires_at:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if not verify_reset_token(body.token, user.reset_token):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    await users_crud.update_password(db, user, hash_password(body.new_password))
    await users_crud.clear_reset_token(db, user)
    await db.commit()
    return {}


@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)):
    return UserResponse(
        user_id=str(current_user.id),
        email=current_user.email,
        is_verified=current_user.is_verified,
        plan=getattr(current_user, "plan", "free"),
    )
