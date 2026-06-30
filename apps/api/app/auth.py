import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from fastapi import Cookie, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_runtime_settings
from app.db import get_session
from app.models import UserSession


SESSION_COOKIE_NAME = "cyberjoker_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
ADMIN_SESSION_COOKIE_NAME = "cyberjoker_admin"


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


@dataclass(frozen=True)
class AdminPrincipal:
    username: str
    role: str
    is_super_admin: bool
    host: str | None


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _admin_secret(settings: Settings) -> bytes:
    secret = settings.admin_secret_key or settings.admin_password
    return secret.encode("utf-8")


def _password_fingerprint(settings: Settings) -> str:
    return hashlib.sha256(settings.admin_password.encode("utf-8")).hexdigest()[:16]


def _sign_admin_payload(payload: str, settings: Settings) -> str:
    return _b64encode(hmac.new(_admin_secret(settings), payload.encode("utf-8"), hashlib.sha256).digest())


def admin_credentials_configured(settings: Settings) -> bool:
    return bool(settings.admin_username and settings.admin_password)


def verify_admin_credentials(username: str, password: str, settings: Settings) -> bool:
    if not admin_credentials_configured(settings):
        return False
    return secrets.compare_digest(username, settings.admin_username) and secrets.compare_digest(
        password,
        settings.admin_password,
    )


def create_admin_session_token(username: str, settings: Settings) -> str:
    now = int(time.time())
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + settings.admin_session_seconds,
        "pwd": _password_fingerprint(settings),
    }
    payload_part = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{payload_part}.{_sign_admin_payload(payload_part, settings)}"


def _decode_admin_session_token(token: str, settings: Settings) -> dict:
    try:
        payload_part, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="admin_session_invalid") from exc

    expected = _sign_admin_payload(payload_part, settings)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="admin_session_invalid")

    try:
        payload = json.loads(_b64decode(payload_part))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="admin_session_invalid") from exc

    if payload.get("sub") != settings.admin_username or payload.get("pwd") != _password_fingerprint(settings):
        raise HTTPException(status_code=401, detail="admin_session_invalid")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="admin_session_expired")
    return payload


def set_admin_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        ADMIN_SESSION_COOKIE_NAME,
        token,
        max_age=settings.admin_session_seconds,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


def clear_admin_session_cookie(response: Response) -> None:
    response.delete_cookie(ADMIN_SESSION_COOKIE_NAME, path="/")


def _normalize_host(value: str | None) -> str:
    if not value:
        return ""
    host = value.strip().lower()
    if host.startswith("[") and "]" in host:
        return host[1:host.index("]")]
    if host.count(":") == 1:
        host = host.split(":", 1)[0]
    return host


def admin_request_host(request: Request) -> str | None:
    if request.client and request.client.host:
        return request.client.host
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return None


def is_super_admin_request(request: Request, settings: Settings) -> bool:
    allowed = {
        _normalize_host(host)
        for host in settings.admin_super_hosts.split(",")
        if _normalize_host(host)
    }
    client_host = _normalize_host(admin_request_host(request))
    return client_host in allowed


def build_admin_principal(username: str, request: Request, settings: Settings) -> AdminPrincipal:
    is_super_admin = is_super_admin_request(request, settings)
    return AdminPrincipal(
        username=username,
        role="super_admin" if is_super_admin else "admin",
        is_super_admin=is_super_admin,
        host=admin_request_host(request),
    )


def get_current_admin(
    request: Request,
    token: str | None = Cookie(default=None, alias=ADMIN_SESSION_COOKIE_NAME),
    settings: Settings = Depends(get_runtime_settings),
) -> AdminPrincipal:
    if not token:
        raise HTTPException(status_code=401, detail="admin_login_required")
    payload = _decode_admin_session_token(token, settings)
    return build_admin_principal(str(payload["sub"]), request, settings)


def require_super_admin(admin: AdminPrincipal = Depends(get_current_admin)) -> AdminPrincipal:
    if not admin.is_super_admin:
        raise HTTPException(status_code=403, detail="super_admin_required")
    return admin
