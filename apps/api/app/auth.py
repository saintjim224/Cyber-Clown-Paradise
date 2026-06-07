import secrets

from fastapi import Cookie, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import UserSession


SESSION_COOKIE_NAME = "cyberjoker_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365


def _new_session_id() -> str:
    return f"usr_{secrets.token_urlsafe(24)}"


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_id,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


async def get_current_user_session(
    response: Response,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: AsyncSession = Depends(get_session),
) -> UserSession:
    if session_id:
        existing = await db.get(UserSession, session_id)
        if existing:
            set_session_cookie(response, existing.id)
            return existing

    created = UserSession(id=_new_session_id())
    db.add(created)
    await db.commit()
    await db.refresh(created)
    set_session_cookie(response, created.id)
    return created
