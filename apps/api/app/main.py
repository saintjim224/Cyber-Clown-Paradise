import asyncio
import json

from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    AdminPrincipal,
    SESSION_COOKIE_NAME,
    admin_credentials_configured,
    build_admin_principal,
    clear_admin_session_cookie,
    create_admin_session_token,
    get_current_admin,
    get_current_user_session,
    require_super_admin,
    set_admin_session_cookie,
    set_session_cookie,
    verify_admin_credentials,
)
from app.config import Settings, get_runtime_settings, get_settings
from app.db import SessionLocal, create_db_schema, get_session
from app.models import UserSession
from app.schemas import (
    AdminDeleteOut,
    AdminChatRoomOut,
    AdminJokerOut,
    AdminLoginCreate,
    AdminSessionOut,
    AdminSystemStatsOut,
    AvatarJobCreate,
    AvatarJobOut,
    BalloonCreate,
    BalloonOut,
    ChatLocationOut,
    ChatLocationPresenceOut,
    ChatMessageCreate,
    ChatMessageOut,
    ChatRoomOut,
    ClownVoteSummaryOut,
    ClownVoteSummaryRequest,
    ClownVoteToggleRequest,
    HealActionCreate,
    HealActionOut,
    HealthOut,
    JokerCreate,
    JokerBriefOut,
    JokerDraftCreate,
    JokerDraftOut,
    JokerOut,
    MatchOut,
    MatchRequest,
    ParkEventOut,
    RelationshipOut,
    ReplayOut,
)
from app.services import (
    AdminService,
    AvatarService,
    BalloonService,
    ChatService,
    ClownVoteService,
    HealService,
    JokerService,
    ReplayService,
    generate_autonomous_event,
    park_jokers,
    recent_events,
)


app = FastAPI(title="CyberJoker Park API", version="0.1.0")


class ChatConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, set[WebSocket]] = {}
        self.socket_jokers: dict[WebSocket, tuple[str, str]] = {}
        self.participants: dict[str, dict[str, dict]] = {}

    async def connect(self, room_id: str, websocket: WebSocket, joker: dict) -> None:
        await websocket.accept()
        self.active.setdefault(room_id, set()).add(websocket)
        joker_id = str(joker["id"])
        self.socket_jokers[websocket] = (room_id, joker_id)
        room_participants = self.participants.setdefault(room_id, {})
        participant = room_participants.setdefault(joker_id, {"joker": joker, "count": 0})
        participant["joker"] = joker
        participant["count"] = int(participant.get("count", 0)) + 1
        if participant["count"] == 1:
            await self.broadcast(room_id, {"type": "user_joined", "joker": joker})

    async def disconnect(self, room_id: str, websocket: WebSocket, announce: bool = True) -> None:
        sockets = self.active.get(room_id)
        if sockets:
            sockets.discard(websocket)
        if sockets is not None and not sockets:
            self.active.pop(room_id, None)
        socket_joker = self.socket_jokers.pop(websocket, None)
        if not socket_joker:
            return
        _, joker_id = socket_joker
        room_participants = self.participants.get(room_id)
        if not room_participants or joker_id not in room_participants:
            return
        participant = room_participants[joker_id]
        participant["count"] = max(0, int(participant.get("count", 0)) - 1)
        if participant["count"] > 0:
            return
        room_participants.pop(joker_id, None)
        if not room_participants:
            self.participants.pop(room_id, None)
        if announce:
            await self.broadcast(room_id, {"type": "user_left", "joker_id": joker_id})

    async def broadcast(self, room_id: str, payload: dict) -> None:
        stale: list[WebSocket] = []
        for websocket in self.active.get(room_id, set()).copy():
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                stale.append(websocket)
        for websocket in stale:
            await self.disconnect(room_id, websocket, announce=False)

    def presence_for_room(self, room_id: str) -> list[dict]:
        return [dict(participant["joker"]) for participant in self.participants.get(room_id, {}).values()]


chat_connections = ChatConnectionManager()


def service_error(exc: ValueError) -> HTTPException:
    detail = str(exc)
    if detail == "no_active_joker":
        return HTTPException(status_code=409, detail=detail)
    if detail in {"cannot_heal_own_balloon", "joker_not_owned", "chat_room_forbidden"}:
        return HTTPException(status_code=403, detail=detail)
    if detail in {"chat_locked", "cannot_chat_self"}:
        return HTTPException(status_code=409, detail=detail)
    if detail == "chat_rate_limited":
        return HTTPException(status_code=429, detail=detail)
    return HTTPException(status_code=404, detail=detail)


def admin_session_out(admin: AdminPrincipal, settings: Settings) -> AdminSessionOut:
    return AdminSessionOut(
        username=admin.username,
        role=admin.role,
        is_super_admin=admin.is_super_admin,
        host=admin.host,
        expires_in_seconds=settings.admin_session_seconds,
    )


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


@app.post("/api/admin/login", response_model=AdminSessionOut)
async def admin_login(
    payload: AdminLoginCreate,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_runtime_settings),
) -> AdminSessionOut:
    if not admin_credentials_configured(settings):
        raise HTTPException(status_code=503, detail="admin_credentials_not_configured")
    if not verify_admin_credentials(payload.username, payload.password, settings):
        raise HTTPException(status_code=401, detail="invalid_admin_credentials")
    token = create_admin_session_token(settings.admin_username, settings)
    set_admin_session_cookie(response, token, settings)
    return admin_session_out(build_admin_principal(settings.admin_username, request, settings), settings)


@app.post("/api/admin/logout")
async def admin_logout(response: Response) -> dict[str, bool]:
    clear_admin_session_cookie(response)
    return {"ok": True}


@app.get("/api/admin/me", response_model=AdminSessionOut)
async def admin_me(
    admin: AdminPrincipal = Depends(get_current_admin),
    settings: Settings = Depends(get_runtime_settings),
) -> AdminSessionOut:
    return admin_session_out(admin, settings)


@app.get("/api/admin/stats", response_model=AdminSystemStatsOut)
async def admin_stats(
    session: AsyncSession = Depends(get_session),
    admin: AdminPrincipal = Depends(get_current_admin),
) -> AdminSystemStatsOut:
    _ = admin
    return AdminSystemStatsOut(**await AdminService(session).system_stats())


@app.get("/api/admin/jokers", response_model=list[AdminJokerOut])
async def admin_jokers(
    limit: int = 200,
    session: AsyncSession = Depends(get_session),
    admin: AdminPrincipal = Depends(get_current_admin),
) -> list[AdminJokerOut]:
    _ = admin
    return [AdminJokerOut.model_validate(item) for item in await AdminService(session).list_jokers(limit)]


@app.delete("/api/admin/jokers/{joker_id}", response_model=AdminDeleteOut)
async def admin_delete_joker(
    joker_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminPrincipal = Depends(require_super_admin),
) -> AdminDeleteOut:
    _ = admin
    try:
        counts = await AdminService(session).delete_joker(joker_id)
    except ValueError as exc:
        raise service_error(exc) from exc
    return AdminDeleteOut(joker_id=joker_id, deleted_counts=counts)


@app.get("/api/admin/chat/rooms", response_model=list[AdminChatRoomOut])
async def admin_chat_rooms(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
    admin: AdminPrincipal = Depends(get_current_admin),
) -> list[AdminChatRoomOut]:
    _ = admin
    return [AdminChatRoomOut.model_validate(item) for item in await AdminService(session).list_location_chat_rooms(limit)]


@app.delete("/api/admin/chat/messages/{message_id}")
async def admin_delete_chat_message(
    message_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminPrincipal = Depends(require_super_admin),
) -> dict[str, int]:
    _ = admin
    try:
        return await AdminService(session).delete_chat_message(message_id)
    except ValueError as exc:
        raise service_error(exc) from exc


@app.get("/api/chat/locations", response_model=list[ChatLocationOut])
async def chat_locations(
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> list[ChatLocationOut]:
    _ = user_session
    return [ChatLocationOut.model_validate(item) for item in ChatService(session).list_locations()]


@app.post("/api/chat/private/{other_joker_id}", response_model=ChatRoomOut)
async def open_private_chat_room(
    other_joker_id: str,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> ChatRoomOut:
    try:
        return ChatRoomOut.model_validate(
            await ChatService(session).get_or_create_private_room(user_session.id, other_joker_id)
        )
    except ValueError as exc:
        raise service_error(exc) from exc


@app.post("/api/chat/location/{location_id}", response_model=ChatRoomOut)
async def open_location_chat_room(
    location_id: str,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> ChatRoomOut:
    try:
        return ChatRoomOut.model_validate(
            await ChatService(session).get_or_create_location_room(user_session.id, location_id)
        )
    except ValueError as exc:
        raise service_error(exc) from exc


@app.get("/api/chat/location/{location_id}/presence", response_model=ChatLocationPresenceOut)
async def location_chat_presence(
    location_id: str,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> ChatLocationPresenceOut:
    service = ChatService(session)
    try:
        room = await service.get_or_create_location_room(user_session.id, location_id)
        presence = await service.location_presence(
            user_session.id,
            location_id,
            chat_connections.presence_for_room(room["id"]),
        )
    except ValueError as exc:
        raise service_error(exc) from exc
    return ChatLocationPresenceOut.model_validate(presence)


@app.get("/api/chat/private-unlocks", response_model=list[RelationshipOut])
async def private_chat_unlocks(
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> list[RelationshipOut]:
    try:
        return [
            RelationshipOut.model_validate(item)
            for item in await ChatService(session).private_unlocks(user_session.id)
        ]
    except ValueError as exc:
        raise service_error(exc) from exc


@app.get("/api/chat/rooms/{room_id}/messages", response_model=list[ChatMessageOut])
async def chat_room_messages(
    room_id: str,
    limit: int | None = None,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> list[ChatMessageOut]:
    try:
        messages = await ChatService(session).list_messages(room_id, user_session.id, limit)
    except ValueError as exc:
        raise service_error(exc) from exc
    return [ChatMessageOut.model_validate(message) for message in messages]


@app.post("/api/chat/rooms/{room_id}/messages", response_model=ChatMessageOut)
async def create_chat_room_message(
    room_id: str,
    payload: ChatMessageCreate,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> ChatMessageOut:
    service = ChatService(session)
    try:
        message = await service.create_message(room_id, user_session.id, payload)
    except ValueError as exc:
        raise service_error(exc) from exc
    dumped = ChatMessageOut.model_validate(await service.message_out(message)).model_dump(mode="json")
    await chat_connections.broadcast(room_id, {"type": "chat_message", "message": dumped})
    return ChatMessageOut.model_validate(dumped)


@app.websocket("/ws/chat/{room_id}")
async def chat_room_socket(websocket: WebSocket, room_id: str) -> None:
    session_id = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        await websocket.close(code=1008)
        return

    async with SessionLocal() as session:
        try:
            _, current = await ChatService(session).room_for_participant(room_id, session_id)
            joker = JokerBriefOut.model_validate(current).model_dump(mode="json")
        except ValueError:
            await websocket.close(code=1008)
            return

    await chat_connections.connect(room_id, websocket, joker)
    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except (ValueError, TypeError):
                await websocket.send_json({"type": "error", "detail": "invalid_json"})
                continue
            if not isinstance(payload, dict):
                await websocket.send_json({"type": "error", "detail": "invalid_json"})
                continue
            content = str(payload.get("content", "")).strip()
            if not content:
                continue
            async with SessionLocal() as session:
                service = ChatService(session)
                try:
                    message = await service.create_message(
                        room_id,
                        session_id,
                        ChatMessageCreate(content=content),
                    )
                except ValueError as exc:
                    await websocket.send_json({"type": "error", "detail": str(exc) or "chat_message_rejected"})
                    continue
                dumped = ChatMessageOut.model_validate(await service.message_out(message)).model_dump(mode="json")
            await chat_connections.broadcast(room_id, {"type": "chat_message", "message": dumped})
    except WebSocketDisconnect:
        await chat_connections.disconnect(room_id, websocket)


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
        return await HealService(session, settings).find_match(
            user_session.id,
            payload.action_type,
            payload.target_owner_id,
        )
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
        (
            joker,
            balloons,
            actions,
            events,
            received_replies,
            sent_replies,
            relationships,
            public_footprints,
        ) = await ReplayService(session).get_by_token(token)
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
        received_replies=received_replies,
        sent_replies=sent_replies,
        relationships=relationships,
        public_footprints=public_footprints,
        energy_score=joker.energy_score,
        headline=headline,
        share_text=share_text,
    )


@app.get("/api/park/events", response_model=list[ParkEventOut])
async def park_events(session: AsyncSession = Depends(get_session)) -> list[ParkEventOut]:
    return [ParkEventOut.model_validate(event) for event in await recent_events(session)]


@app.get("/api/park/jokers", response_model=list[JokerOut])
async def park_joker_roster(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> list[JokerOut]:
    return [JokerOut.model_validate(joker) for joker in await JokerService(session, settings).park_jokers()]


@app.get("/api/park/balloons", response_model=list[BalloonOut])
async def park_balloons(session: AsyncSession = Depends(get_session)) -> list[BalloonOut]:
    return [BalloonOut.model_validate(balloon) for balloon in await BalloonService(session).pending_balloons()]


@app.post("/api/park/clown-votes/summary", response_model=ClownVoteSummaryOut)
async def clown_vote_summary(
    payload: ClownVoteSummaryRequest,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> ClownVoteSummaryOut:
    return await ClownVoteService(session).summary(user_session.id, payload.clown_ids)


@app.post("/api/park/clown-votes/toggle", response_model=ClownVoteSummaryOut)
async def toggle_clown_vote(
    payload: ClownVoteToggleRequest,
    session: AsyncSession = Depends(get_session),
    user_session: UserSession = Depends(get_current_user_session),
) -> ClownVoteSummaryOut:
    try:
        return await ClownVoteService(session).toggle(user_session.id, payload.clown_id, payload.current_clown_ids)
    except ValueError as exc:
        raise service_error(exc) from exc


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
