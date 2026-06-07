import asyncio
import json

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_session, set_session_cookie
from app.config import Settings, get_settings
from app.db import create_db_schema, get_session
from app.models import UserSession
from app.schemas import (
    AvatarJobCreate,
    AvatarJobOut,
    BalloonCreate,
    BalloonOut,
    HealActionCreate,
    HealActionOut,
    HealthOut,
    JokerCreate,
    JokerDraftCreate,
    JokerDraftOut,
    JokerOut,
    MatchOut,
    MatchRequest,
    ParkEventOut,
    ReplayOut,
)
from app.services import (
    AvatarService,
    BalloonService,
    HealService,
    JokerService,
    ReplayService,
    generate_autonomous_event,
    recent_events,
)


app = FastAPI(title="CyberJoker Park API", version="0.1.0")


def service_error(exc: ValueError) -> HTTPException:
    detail = str(exc)
    if detail == "no_active_joker":
        return HTTPException(status_code=409, detail=detail)
    if detail in {"cannot_heal_own_balloon", "joker_not_owned"}:
        return HTTPException(status_code=403, detail=detail)
    return HTTPException(status_code=404, detail=detail)


@app.on_event("startup")
async def startup() -> None:
    await create_db_schema()


settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthOut)
async def health(settings: Settings = Depends(get_settings)) -> HealthOut:
    return HealthOut(ok=True, service="cyberjoker-api", env=settings.app_env)


@app.post("/api/joker-drafts", response_model=JokerDraftOut)
async def create_joker_draft(
    payload: JokerDraftCreate,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> JokerDraftOut:
    return await JokerService(session, settings).create_draft(payload)


@app.post("/api/jokers", response_model=JokerOut)
async def create_joker(
    payload: JokerCreate,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user_session: UserSession = Depends(get_current_user_session),
) -> JokerOut:
    return await JokerService(session, settings).create_joker(payload, user_session.id)


@app.get("/api/jokers/me", response_model=JokerOut)
async def get_my_joker(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user_session: UserSession = Depends(get_current_user_session),
) -> JokerOut:
    try:
        return await JokerService(session, settings).current_joker(user_session.id)
    except ValueError as exc:
        raise service_error(exc) from exc


@app.post("/api/jokers/enter/{token}", response_model=JokerOut)
async def enter_with_joker_token(
    token: str,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> JokerOut:
    try:
        joker = await JokerService(session, settings).enter_with_token(token)
    except ValueError as exc:
        raise service_error(exc) from exc
    set_session_cookie(response, joker.owner_session_id)
    return joker


@app.post("/api/balloons", response_model=BalloonOut)
async def create_balloon(
    payload: BalloonCreate,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> BalloonOut:
    try:
        return await BalloonService(session).create_balloon(payload, user_session.id)
    except ValueError as exc:
        raise service_error(exc) from exc


@app.post("/api/heal/match", response_model=MatchOut)
async def match_balloon(
    payload: MatchRequest,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user_session: UserSession = Depends(get_current_user_session),
) -> MatchOut:
    try:
        return await HealService(session, settings).find_match(user_session.id, payload.action_type)
    except ValueError as exc:
        raise service_error(exc) from exc


@app.post("/api/heal/actions", response_model=HealActionOut)
async def submit_action(
    payload: HealActionCreate,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user_session: UserSession = Depends(get_current_user_session),
) -> HealActionOut:
    try:
        return await HealService(session, settings).submit_action(payload, user_session.id)
    except ValueError as exc:
        raise service_error(exc) from exc


@app.get("/api/replay/{token}", response_model=ReplayOut)
async def replay(token: str, session: AsyncSession = Depends(get_session)) -> ReplayOut:
    try:
        joker, balloons, actions, events = await ReplayService(session).get_by_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    healed_count = len([balloon for balloon in balloons if balloon.status == "healed"])
    headline = (
        f"{joker.nickname or joker.id} 的小丑已经替你社交了 {len(events)} 次，"
        f"点亮 {healed_count} 颗情绪气球。"
    )
    share_text = f"我的 {joker.mbti} 小丑刚从赛博乐园打卡回来：{joker.verdict}"
    return ReplayOut(
        joker=JokerOut.model_validate(joker),
        balloons=[BalloonOut.model_validate(item) for item in balloons],
        actions=[HealActionOut.model_validate(item) for item in actions],
        events=[ParkEventOut.model_validate(item) for item in events],
        headline=headline,
        share_text=share_text,
    )


@app.get("/api/park/events", response_model=list[ParkEventOut])
async def park_events(session: AsyncSession = Depends(get_session)) -> list[ParkEventOut]:
    return [ParkEventOut.model_validate(event) for event in await recent_events(session)]


@app.get("/api/park/stream")
async def park_stream(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    async def stream():
        last_id = None
        while True:
            event = await generate_autonomous_event(session, settings)
            if event and event.id != last_id:
                last_id = event.id
                payload = ParkEventOut.model_validate(event).model_dump(mode="json")
                yield f"event: park-event\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(max(5, min(settings.autonomy_tick_seconds, 90)))

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/api/avatar-jobs", response_model=AvatarJobOut)
async def create_avatar_job(
    payload: AvatarJobCreate,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> AvatarJobOut:
    try:
        return await AvatarService(session).create_job(payload, user_session.id)
    except ValueError as exc:
        raise service_error(exc) from exc


@app.get("/api/jobs/{job_id}", response_model=AvatarJobOut)
async def get_avatar_job(job_id: str, session: AsyncSession = Depends(get_session)) -> AvatarJobOut:
    from app.models import AvatarJob

    job = await session.get(AvatarJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    return job
