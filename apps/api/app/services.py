import math
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.ai_adapter import JokerAIAdapter
from app.config import Settings
from app.models import (
    AvatarJob,
    ChatMessage,
    ChatRoom,
    ClownVote,
    EmoBalloon,
    HealAction,
    InteractionEvent,
    JokerProfile,
    JokerRelationship,
    MediaAsset,
    ModerationLog,
    UserSession,
    now_utc,
)
from app.safety import clamp_joker_line, moderate_text
from app.schemas import (
    AvatarJobCreate,
    BalloonCreate,
    ChatMessageCreate,
    ClownVoteSummaryItem,
    ClownVoteSummaryOut,
    HealActionCreate,
    JokerCreate,
    JokerDraftCreate,
    JokerDraftOut,
    JokerBriefOut,
    MatchOut,
)

HEALER_ENERGY_DELTA = 1
OWNER_ENERGY_DELTA = 2
AFFINITY_DELTA = 3
CHAT_AFFINITY_UNLOCK_SCORE = 9
CHAT_INTERACTION_UNLOCK_COUNT = 3
CHAT_PRIVATE_MESSAGE_LIMIT = 200
CHAT_LOCATION_MESSAGE_LIMIT = 500
CHAT_LOCATION_TTL_HOURS = 24
CHAT_LOCATION_PRESENCE_MINUTES = 5
CHAT_MESSAGE_LIMIT = CHAT_PRIVATE_MESSAGE_LIMIT
CHAT_MESSAGE_MIN_INTERVAL_SECONDS = 0.5
CHAT_LOCATION_MESSAGE_MIN_INTERVAL_SECONDS = 1.0
CHAT_LOCATIONS = (
    {"id": "academic-plaza", "label": "教学楼广场", "note": "致知、笃行、敬业、勤业一带的学习楼群公共频道。"},
    {"id": "canteen", "label": "食堂", "note": "北苑、西苑、东苑食堂共享的吃饭碰头频道。"},
    {"id": "library", "label": "图书馆", "note": "图书馆和湖畔之间的安静搭话频道。"},
    {"id": "sports-field", "label": "运动场", "note": "南北运动场和北苑操场的加油频道。"},
    {"id": "central-garden", "label": "中心花园", "note": "毓秀湖、罗马广场之间的低压散步频道。"},
    {"id": "clown-theater", "label": "小丑剧场", "note": "生活活动中心附近的演出、回放和热闹集合频道。"},
    {"id": "bus-stop", "label": "校车站", "note": "中门、北门和小北门的来去集合频道。"},
    {"id": "dormitory", "label": "宿舍区", "note": "北苑、西苑、东苑宿舍共享的夜间回访频道。"},
)
CHAT_LOCATION_IDS = {location["id"] for location in CHAT_LOCATIONS}
MAX_PARK_VISIBLE_CLOWNS = 200
MAX_VOTEABLE_CLOWNS = MAX_PARK_VISIBLE_CLOWNS


def _simple_embedding(text: str) -> list[float]:
    buckets = [0.0] * 12
    for idx, char in enumerate(text):
        buckets[(ord(char) + idx) % len(buckets)] += 1.0
    norm = math.sqrt(sum(v * v for v in buckets)) or 1.0
    return [round(v / norm, 5) for v in buckets]


def _cosine(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right:
        return 0.0
    return sum(a * b for a, b in zip(left, right))


def _normalized_clown_ids(clown_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for raw_id in clown_ids:
        clown_id = raw_id.strip()[:96]
        if not clown_id or clown_id in seen:
            continue
        seen.add(clown_id)
        normalized.append(clown_id)
        if len(normalized) >= MAX_VOTEABLE_CLOWNS:
            break
    return normalized


class JokerService:
    def __init__(self, session: AsyncSession, settings: Settings):
        self.session = session
        self.ai = JokerAIAdapter(settings)

    async def current_joker(self, owner_session_id: str) -> JokerProfile:
        result = await self.session.execute(
            select(JokerProfile).where(JokerProfile.owner_session_id == owner_session_id)
        )
        joker = result.scalar_one_or_none()
        if not joker:
            raise ValueError("no_active_joker")
        return joker

    async def enter_with_token(self, token: str) -> JokerProfile:
        result = await self.session.execute(select(JokerProfile).where(JokerProfile.qr_token == token))
        joker = result.scalar_one_or_none()
        if not joker or not joker.owner_session_id:
            raise ValueError("token_not_found")
        return joker

    async def park_jokers(self, limit: int = MAX_PARK_VISIBLE_CLOWNS) -> list[JokerProfile]:
        bounded_limit = max(1, min(limit, MAX_PARK_VISIBLE_CLOWNS))
        result = await self.session.execute(
            select(JokerProfile)
            .where(JokerProfile.owner_session_id.is_not(None))
            .order_by(desc(JokerProfile.updated_at), desc(JokerProfile.created_at))
            .limit(bounded_limit)
        )
        return list(result.scalars().all())

    async def create_draft(self, payload: JokerDraftCreate) -> JokerDraftOut:
        moderation = moderate_text(payload.soul_seed)
        self.session.add(
            ModerationLog(
                joker_id=None,
                input_kind="soul_seed",
                flagged=moderation.flagged,
                categories=moderation.categories,
                action_taken=moderation.action_taken,
            )
        )
        seed = moderation.cleaned_text
        if moderation.action_taken == "block":
            seed = "这段输入需要先降噪，小丑保留善意，不保留危险内容。"
        generated = await self.ai.generate_soul_draft(
            payload.mbti.upper(),
            payload.constellation,
            payload.social_energy,
            seed,
            payload.face_descriptor.model_dump() if payload.face_descriptor else None,
        )
        await self.session.commit()
        return JokerDraftOut.model_validate(generated)

    async def create_joker(self, payload: JokerCreate, owner_session_id: str) -> JokerProfile:
        result = await self.session.execute(
            select(JokerProfile).where(JokerProfile.owner_session_id == owner_session_id)
        )
        joker = result.scalar_one_or_none()
        if joker:
            return joker

        face_descriptor = payload.face_descriptor.model_dump() if payload.face_descriptor else None
        if payload.soul_profile and payload.avatar_recipe:
            generated = {
                "soul_profile": payload.soul_profile.model_dump(),
                "persona": payload.soul_profile.core_personality,
                "verdict": clamp_joker_line(payload.verdict or payload.soul_profile.catchphrase),
                "style_tokens": payload.style_tokens.model_dump()
                if payload.style_tokens
                else {
                    "palette": payload.avatar_recipe.palette,
                    "material": payload.avatar_recipe.material,
                    "motion": payload.avatar_recipe.motion_style,
                    "aura": f"{payload.constellation}-{payload.mbti.upper()}-neon",
                },
                "avatar_recipe": payload.avatar_recipe.model_dump(),
            }
        else:
            seed = payload.soul_seed or "我还没写灵魂设定，先让小丑自己开场。"
            generated = await self.ai.generate_soul_draft(
                payload.mbti.upper(),
                payload.constellation,
                payload.social_energy,
                seed,
                face_descriptor,
            )
        values = {
            "nickname": payload.nickname,
            "mbti": payload.mbti.upper(),
            "constellation": payload.constellation,
            "social_energy": payload.social_energy,
            "desired_poi_id": payload.desired_poi_id,
            "consent_media": payload.consent_media,
            "persona": generated["persona"],
            "verdict": generated["verdict"],
            "style_tokens": generated["style_tokens"],
            "soul_seed": payload.soul_seed,
            "soul_profile": generated.get("soul_profile"),
            "avatar_recipe": generated.get("avatar_recipe"),
            "face_descriptor": face_descriptor,
            "avatar_status": "recipe_ready",
            "embedding": _simple_embedding(
                f"{payload.mbti} {payload.constellation} {generated['persona']} {payload.soul_seed or ''}"
            ),
        }
        joker = JokerProfile(
            owner_session_id=owner_session_id,
            qr_token=secrets.token_urlsafe(18),
            **values,
        )
        self.session.add(joker)
        await self.session.commit()
        await self.session.refresh(joker)
        return joker


class BalloonService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _current_joker(self, owner_session_id: str) -> JokerProfile:
        result = await self.session.execute(
            select(JokerProfile).where(JokerProfile.owner_session_id == owner_session_id)
        )
        joker = result.scalar_one_or_none()
        if not joker:
            raise ValueError("no_active_joker")
        return joker

    async def create_balloon(self, payload: BalloonCreate, owner_session_id: str) -> EmoBalloon:
        joker = await self._current_joker(owner_session_id)
        moderation = moderate_text(payload.emo_text)
        self.session.add(
            ModerationLog(
                joker_id=joker.id,
                input_kind="balloon",
                flagged=moderation.flagged,
                categories=moderation.categories,
                action_taken=moderation.action_taken,
            )
        )
        if moderation.action_taken == "block":
            safe_summary = "这颗气球需要人工看护，先放进静音保险箱。"
            status = "needs_review"
        else:
            safe_summary = moderation.cleaned_text[:120]
            status = "pending"
        balloon = EmoBalloon(
            owner_id=joker.id,
            emo_text=payload.emo_text,
            safe_summary=safe_summary,
            status=status,
            embedding=_simple_embedding(safe_summary),
            tags={"energy": "low", "created_from": "web"},
        )
        self.session.add(balloon)
        await self.session.commit()
        await self.session.refresh(balloon)
        return balloon

    async def pending_balloons(self, limit: int = 40) -> list[EmoBalloon]:
        bounded_limit = max(1, min(limit, 80))
        result = await self.session.execute(
            select(EmoBalloon)
            .where(EmoBalloon.status == "pending")
            .order_by(desc(EmoBalloon.created_at))
            .limit(bounded_limit)
        )
        return list(reversed(result.scalars().all()))


class HealService:
    def __init__(self, session: AsyncSession, settings: Settings):
        self.session = session
        self.ai = JokerAIAdapter(settings)

    async def _current_joker(self, owner_session_id: str) -> JokerProfile:
        result = await self.session.execute(
            select(JokerProfile).where(JokerProfile.owner_session_id == owner_session_id)
        )
        joker = result.scalar_one_or_none()
        if not joker:
            raise ValueError("no_active_joker")
        return joker

    async def find_match(self, owner_session_id: str, action_type: str, target_owner_id: str | None = None) -> MatchOut:
        healer = await self._current_joker(owner_session_id)
        if not healer:
            raise ValueError("healer_not_found")
        target_owner: JokerProfile | None = None
        if target_owner_id:
            target_owner = await self.session.get(JokerProfile, target_owner_id)
            if not target_owner:
                raise ValueError("target_joker_not_found")
            if target_owner.id == healer.id:
                raise ValueError("cannot_heal_own_balloon")
        query = (
            select(EmoBalloon, JokerProfile)
            .join(JokerProfile, EmoBalloon.owner_id == JokerProfile.id)
            .where(EmoBalloon.status == "pending")
            .where(EmoBalloon.owner_id != healer.id)
        )
        if target_owner:
            query = query.where(EmoBalloon.owner_id == target_owner.id)
        result = await self.session.execute(
            query.order_by(EmoBalloon.created_at)
        )
        candidates = result.all()
        if not candidates:
            if target_owner:
                raise ValueError("no_pending_balloon_for_target")
            raise ValueError("no_pending_balloon")

        best: tuple[float, EmoBalloon, JokerProfile, str] | None = None
        for balloon, owner in candidates:
            semantic = _cosine(healer.embedding, balloon.embedding)
            energy_bonus = 0.22 if healer.social_energy == "E" and owner.social_energy == "I" else 0.08
            mbti_bonus = 0.15 if healer.mbti[0] != owner.mbti[0] else 0.04
            constellation_bonus = 0.08 if healer.constellation != owner.constellation else 0.03
            score = semantic * 0.55 + energy_bonus + mbti_bonus + constellation_bonus
            reason = (
                f"{healer.mbti}/{healer.constellation} 和 "
                f"{owner.mbti}/{owner.constellation} 有互补张力，适合用 {action_type} 把低电量拉起来。"
            )
            if best is None or score > best[0]:
                best = (score, balloon, owner, reason)

        assert best is not None
        score, balloon, owner, reason = best
        return MatchOut(
            balloon_id=balloon.id,
            owner_id=owner.id,
            balloon_summary=balloon.safe_summary,
            owner=JokerBriefOut.model_validate(owner),
            score=round(score, 4),
            reason=reason,
            suggested_action=action_type,
            prompt=f"对着镜头做一个 {action_type}，再留一句不超过 40 字的转运话。",
        )

    async def _relationship_for(self, left_id: str, right_id: str) -> JokerRelationship:
        joker_a_id, joker_b_id = sorted([left_id, right_id])
        result = await self.session.execute(
            select(JokerRelationship).where(
                JokerRelationship.joker_a_id == joker_a_id,
                JokerRelationship.joker_b_id == joker_b_id,
            )
        )
        relationship = result.scalar_one_or_none()
        if relationship:
            return relationship
        relationship = JokerRelationship(joker_a_id=joker_a_id, joker_b_id=joker_b_id)
        self.session.add(relationship)
        return relationship

    async def submit_action(self, payload: HealActionCreate, owner_session_id: str) -> HealAction:
        healer = await self._current_joker(owner_session_id)
        balloon = await self.session.get(EmoBalloon, payload.balloon_id)
        if not balloon or balloon.status != "pending":
            raise ValueError("balloon_not_found")
        if balloon.owner_id == healer.id:
            raise ValueError("cannot_heal_own_balloon")
        owner = await self.session.get(JokerProfile, balloon.owner_id)
        if not owner:
            raise ValueError("balloon_owner_not_found")
        match = await self.find_match(owner_session_id, payload.action_type)
        if match.balloon_id != payload.balloon_id:
            semantic = _cosine(healer.embedding, balloon.embedding)
            energy_bonus = 0.22 if healer.social_energy == "E" and owner.social_energy == "I" else 0.08
            mbti_bonus = 0.15 if healer.mbti[0] != owner.mbti[0] else 0.04
            constellation_bonus = 0.08 if healer.constellation != owner.constellation else 0.03
            score = round(semantic * 0.55 + energy_bonus + mbti_bonus + constellation_bonus, 4)
            reason = (
                f"{healer.mbti}/{healer.constellation} 和 "
                f"{owner.mbti}/{owner.constellation} 有互补张力，适合用 {payload.action_type} 把低电量拉起来。"
            )
        else:
            score = match.score
            reason = match.reason
        moderation = moderate_text(payload.cheer_text)
        self.session.add(
            ModerationLog(
                joker_id=healer.id,
                input_kind="heal_action",
                flagged=moderation.flagged,
                categories=moderation.categories,
                action_taken=moderation.action_taken,
            )
        )
        cheer = clamp_joker_line(moderation.cleaned_text)
        if moderation.action_taken == "block":
            cheer = "这句先交给安全员看一眼，小丑已经把善意保留下来了。"
        action = HealAction(
            healer_id=healer.id,
            recipient_id=owner.id,
            balloon_id=payload.balloon_id,
            action_type=payload.action_type,
            cheer_text=cheer,
            match_score=score,
            match_reason=reason,
            energy_delta_healer=HEALER_ENERGY_DELTA,
            energy_delta_owner=OWNER_ENERGY_DELTA,
            affinity_delta=AFFINITY_DELTA,
            media_asset_id=payload.media_asset_id,
        )
        balloon.status = "healed"
        balloon.healed_by_id = healer.id
        healer.energy_score = (healer.energy_score or 0) + HEALER_ENERGY_DELTA
        owner.energy_score = (owner.energy_score or 0) + OWNER_ENERGY_DELTA
        event = await self.ai.generate_event(healer.id, balloon.safe_summary, payload.action_type)
        self.session.add(action)
        await self.session.flush()
        relationship = await self._relationship_for(healer.id, owner.id)
        relationship.affinity_score = (relationship.affinity_score or 0) + AFFINITY_DELTA
        relationship.interaction_count = (relationship.interaction_count or 0) + 1
        relationship.last_action_id = action.id
        if ChatService(self.session).relationship_chat_unlocked(relationship):
            await ChatService(self.session).ensure_private_room_for_pair(healer.id, owner.id)
        self.session.add(
            InteractionEvent(
                actor_id=healer.id,
                target_id=balloon.owner_id,
                action_type=payload.action_type,
                dialogue=cheer,
                animation_clip=event["animation_clip"],
                mood_delta=event["mood_delta"],
                position_path=event["position_path"],
                source="user",
            )
        )
        await self.session.commit()
        await self.session.refresh(action)
        return action


class ClownVoteService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def summary(self, owner_session_id: str, clown_ids: list[str]) -> ClownVoteSummaryOut:
        visible_ids = _normalized_clown_ids(clown_ids)
        current_vote = await self.session.get(ClownVote, owner_session_id)
        if not visible_ids:
            return ClownVoteSummaryOut(items=[], voted_clown_id=current_vote.clown_id if current_vote else None)

        rows = await self.session.execute(
            select(ClownVote.clown_id, func.count(ClownVote.voter_session_id))
            .where(ClownVote.clown_id.in_(visible_ids))
            .group_by(ClownVote.clown_id)
        )
        counts = {clown_id: int(count) for clown_id, count in rows.all()}
        return ClownVoteSummaryOut(
            items=[
                ClownVoteSummaryItem(clown_id=clown_id, votes=counts.get(clown_id, 0))
                for clown_id in visible_ids
            ],
            voted_clown_id=current_vote.clown_id if current_vote else None,
        )

    async def toggle(self, owner_session_id: str, clown_id: str, current_clown_ids: list[str]) -> ClownVoteSummaryOut:
        normalized_id = clown_id.strip()[:96]
        if not normalized_id:
            raise ValueError("clown_id_required")

        current_vote = await self.session.get(ClownVote, owner_session_id)
        if current_vote and current_vote.clown_id == normalized_id:
            await self.session.delete(current_vote)
        elif current_vote:
            current_vote.clown_id = normalized_id
        else:
            self.session.add(ClownVote(voter_session_id=owner_session_id, clown_id=normalized_id))

        await self.session.commit()
        visible_ids = _normalized_clown_ids([*current_clown_ids, normalized_id])
        return await self.summary(owner_session_id, visible_ids)


class ReplayService:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _reply_record(
        self,
        action: HealAction,
        balloon: EmoBalloon,
        responder: JokerProfile,
        recipient: JokerProfile,
    ) -> dict:
        return {
            "id": action.id,
            "balloon_id": balloon.id,
            "balloon_summary": balloon.safe_summary,
            "responder": JokerBriefOut.model_validate(responder),
            "recipient": JokerBriefOut.model_validate(recipient),
            "action_type": action.action_type,
            "cheer_text": action.cheer_text,
            "match_score": action.match_score,
            "match_reason": action.match_reason,
            "energy_delta_healer": action.energy_delta_healer,
            "energy_delta_owner": action.energy_delta_owner,
            "affinity_delta": action.affinity_delta,
            "created_at": action.created_at,
        }

    async def get_by_token(self, token: str):
        result = await self.session.execute(select(JokerProfile).where(JokerProfile.qr_token == token))
        joker = result.scalar_one_or_none()
        if not joker:
            raise ValueError("token_not_found")
        balloons = (
            await self.session.execute(select(EmoBalloon).where(EmoBalloon.owner_id == joker.id).order_by(EmoBalloon.created_at))
        ).scalars().all()
        actions = (
            await self.session.execute(
                select(HealAction)
                .join(EmoBalloon, HealAction.balloon_id == EmoBalloon.id)
                .where((HealAction.healer_id == joker.id) | (EmoBalloon.owner_id == joker.id))
                .order_by(HealAction.created_at)
            )
        ).scalars().all()
        responder = aliased(JokerProfile)
        recipient = aliased(JokerProfile)
        received_rows = (
            await self.session.execute(
                select(HealAction, EmoBalloon, responder, recipient)
                .join(EmoBalloon, HealAction.balloon_id == EmoBalloon.id)
                .join(responder, HealAction.healer_id == responder.id)
                .join(recipient, HealAction.recipient_id == recipient.id)
                .where(HealAction.recipient_id == joker.id)
                .order_by(desc(HealAction.created_at))
            )
        ).all()
        sent_rows = (
            await self.session.execute(
                select(HealAction, EmoBalloon, responder, recipient)
                .join(EmoBalloon, HealAction.balloon_id == EmoBalloon.id)
                .join(responder, HealAction.healer_id == responder.id)
                .join(recipient, HealAction.recipient_id == recipient.id)
                .where(HealAction.healer_id == joker.id)
                .order_by(desc(HealAction.created_at))
            )
        ).all()
        events = (
            await self.session.execute(
                select(InteractionEvent)
                .where((InteractionEvent.actor_id == joker.id) | (InteractionEvent.target_id == joker.id))
                .order_by(InteractionEvent.created_at)
            )
        ).scalars().all()
        relationship_rows = (
            await self.session.execute(
                select(JokerRelationship)
                .where(
                    or_(
                        JokerRelationship.joker_a_id == joker.id,
                        JokerRelationship.joker_b_id == joker.id,
                    )
                )
                .order_by(desc(JokerRelationship.updated_at))
            )
        ).scalars().all()
        other_ids = {
            relationship.joker_b_id if relationship.joker_a_id == joker.id else relationship.joker_a_id
            for relationship in relationship_rows
        }
        other_jokers: dict[str, JokerProfile] = {}
        if other_ids:
            others = (
                await self.session.execute(select(JokerProfile).where(JokerProfile.id.in_(other_ids)))
            ).scalars().all()
            other_jokers = {item.id: item for item in others}
        chat_rooms_by_peer: dict[str, ChatRoom] = {}
        if other_ids:
            room_rows = (
                await self.session.execute(
                    select(ChatRoom).where(
                        ChatRoom.room_type == "private",
                        or_(
                            (ChatRoom.joker_a_id == joker.id) & (ChatRoom.joker_b_id.in_(other_ids)),
                            (ChatRoom.joker_b_id == joker.id) & (ChatRoom.joker_a_id.in_(other_ids)),
                        ),
                    )
                )
            ).scalars().all()
            for room in room_rows:
                peer_id = room.joker_b_id if room.joker_a_id == joker.id else room.joker_a_id
                if peer_id:
                    chat_rooms_by_peer[peer_id] = room
        relationships = []
        for relationship in relationship_rows:
            other_id = relationship.joker_b_id if relationship.joker_a_id == joker.id else relationship.joker_a_id
            other = other_jokers.get(other_id)
            if not other:
                continue
            chat_unlocked = (
                (relationship.affinity_score or 0) >= CHAT_AFFINITY_UNLOCK_SCORE
                and (relationship.interaction_count or 0) >= CHAT_INTERACTION_UNLOCK_COUNT
            )
            relationships.append(
                {
                    "joker": JokerBriefOut.model_validate(other),
                    "affinity_score": relationship.affinity_score,
                    "interaction_count": relationship.interaction_count,
                    "last_action_id": relationship.last_action_id,
                    "updated_at": relationship.updated_at,
                    "chat_unlocked": chat_unlocked,
                    "chat_room_id": chat_rooms_by_peer.get(other_id).id if other_id in chat_rooms_by_peer else None,
                }
            )
        received_replies = [
            self._reply_record(action, balloon, row_responder, row_recipient)
            for action, balloon, row_responder, row_recipient in received_rows
        ]
        sent_replies = [
            self._reply_record(action, balloon, row_responder, row_recipient)
            for action, balloon, row_responder, row_recipient in sent_rows
        ]
        location_labels = {location["id"]: location["label"] for location in CHAT_LOCATIONS}
        public_footprint_rows = (
            await self.session.execute(
                select(ChatMessage, ChatRoom)
                .join(ChatRoom, ChatMessage.room_id == ChatRoom.id)
                .where(ChatRoom.room_type == "location", ChatMessage.sender_id == joker.id)
                .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
                .limit(10)
            )
        ).all()
        public_footprints = [
            {
                "id": message.id,
                "room_id": message.room_id,
                "location_id": room.location_id or "",
                "location_label": location_labels.get(room.location_id or "", room.location_id or "公共池"),
                "content_safe": message.content_safe,
                "created_at": message.created_at,
            }
            for message, room in public_footprint_rows
        ]
        return (
            joker,
            list(balloons),
            list(actions),
            list(events),
            received_replies,
            sent_replies,
            relationships,
            public_footprints,
        )


class AvatarService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_job(self, payload: AvatarJobCreate, owner_session_id: str) -> AvatarJob:
        joker = await self.session.get(JokerProfile, payload.joker_id)
        if not joker or joker.owner_session_id != owner_session_id:
            raise ValueError("joker_not_owned")
        job = AvatarJob(
            joker_id=payload.joker_id,
            input_asset_id=payload.input_asset_id,
            fallback_asset_url=payload.image_url,
            provider="recipe-render",
            input_descriptor=payload.input_descriptor.model_dump() if payload.input_descriptor else None,
            result_recipe=payload.avatar_recipe.model_dump()
            if payload.avatar_recipe
            else joker.avatar_recipe if joker else None,
            progress=0,
            status="queued",
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        return job

    async def process_one(self) -> AvatarJob | None:
        result = await self.session.execute(
            select(AvatarJob).where(AvatarJob.status == "queued").order_by(AvatarJob.created_at).limit(1)
        )
        job = result.scalar_one_or_none()
        if not job:
            return None
        job.status = "fallback_ready"
        job.progress = 100
        job.error_message = "Using native Q-version recipe render; external image-to-3D service is optional."
        await self.session.commit()
        await self.session.refresh(job)
        return job


class ChatService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def current_joker(self, owner_session_id: str) -> JokerProfile:
        result = await self.session.execute(
            select(JokerProfile).where(JokerProfile.owner_session_id == owner_session_id)
        )
        joker = result.scalar_one_or_none()
        if not joker:
            raise ValueError("no_active_joker")
        return joker

    def _private_pair(self, left_id: str, right_id: str) -> tuple[str, str]:
        first, second = sorted([left_id, right_id])
        return first, second

    async def _relationship_for_pair(self, left_id: str, right_id: str) -> JokerRelationship | None:
        joker_a_id, joker_b_id = self._private_pair(left_id, right_id)
        result = await self.session.execute(
            select(JokerRelationship).where(
                JokerRelationship.joker_a_id == joker_a_id,
                JokerRelationship.joker_b_id == joker_b_id,
            )
        )
        return result.scalar_one_or_none()

    def relationship_chat_unlocked(self, relationship: JokerRelationship | None) -> bool:
        if not relationship:
            return False
        return (
            (relationship.affinity_score or 0) >= CHAT_AFFINITY_UNLOCK_SCORE
            and (relationship.interaction_count or 0) >= CHAT_INTERACTION_UNLOCK_COUNT
        )

    async def _peer_for_room(self, room: ChatRoom, current_joker_id: str) -> JokerProfile | None:
        if room.room_type != "private":
            return None
        peer_id = room.joker_b_id if room.joker_a_id == current_joker_id else room.joker_a_id
        if not peer_id:
            return None
        return await self.session.get(JokerProfile, peer_id)

    async def _room_out(self, room: ChatRoom, current_joker_id: str) -> dict:
        peer = await self._peer_for_room(room, current_joker_id)
        return {
            "id": room.id,
            "room_type": room.room_type,
            "joker_a_id": room.joker_a_id,
            "joker_b_id": room.joker_b_id,
            "location_id": room.location_id,
            "created_at": room.created_at,
            "last_message_at": room.last_message_at,
            "peer": JokerBriefOut.model_validate(peer) if peer else None,
        }

    async def _message_out(self, message: ChatMessage, sender: JokerProfile | None = None) -> dict:
        sender = sender or await self.session.get(JokerProfile, message.sender_id)
        return {
            "id": message.id,
            "room_id": message.room_id,
            "sender_id": message.sender_id,
            "sender": JokerBriefOut.model_validate(sender) if sender else None,
            "content_safe": message.content_safe,
            "created_at": message.created_at,
        }

    async def message_out(self, message: ChatMessage) -> dict:
        return await self._message_out(message)

    def list_locations(self) -> list[dict[str, str]]:
        return [dict(location) for location in CHAT_LOCATIONS]

    async def get_or_create_private_room(self, owner_session_id: str, other_joker_id: str) -> dict:
        current = await self.current_joker(owner_session_id)
        if current.id == other_joker_id:
            raise ValueError("cannot_chat_self")
        other = await self.session.get(JokerProfile, other_joker_id)
        if not other:
            raise ValueError("joker_not_found")
        relationship = await self._relationship_for_pair(current.id, other.id)
        if not self.relationship_chat_unlocked(relationship):
            raise ValueError("chat_locked")

        room = await self.ensure_private_room_for_pair(current.id, other.id)
        await self.session.commit()
        await self.session.refresh(room)
        return await self._room_out(room, current.id)

    async def ensure_private_room_for_pair(self, left_id: str, right_id: str) -> ChatRoom:
        joker_a_id, joker_b_id = self._private_pair(left_id, right_id)
        result = await self.session.execute(
            select(ChatRoom).where(
                ChatRoom.room_type == "private",
                ChatRoom.joker_a_id == joker_a_id,
                ChatRoom.joker_b_id == joker_b_id,
            )
        )
        room = result.scalar_one_or_none()
        if not room:
            room = ChatRoom(room_type="private", joker_a_id=joker_a_id, joker_b_id=joker_b_id)
            self.session.add(room)
            await self.session.flush()
        return room

    async def get_or_create_location_room(self, owner_session_id: str, location_id: str) -> dict:
        current = await self.current_joker(owner_session_id)
        if location_id not in CHAT_LOCATION_IDS:
            raise ValueError("chat_location_not_found")
        result = await self.session.execute(
            select(ChatRoom).where(
                ChatRoom.room_type == "location",
                ChatRoom.location_id == location_id,
            )
        )
        room = result.scalar_one_or_none()
        if not room:
            room = ChatRoom(room_type="location", location_id=location_id)
            self.session.add(room)
            await self.session.commit()
            await self.session.refresh(room)
        return await self._room_out(room, current.id)

    async def location_presence(
        self,
        owner_session_id: str,
        location_id: str,
        online_jokers: list[dict] | None = None,
    ) -> dict:
        await self.current_joker(owner_session_id)
        if location_id not in CHAT_LOCATION_IDS:
            raise ValueError("chat_location_not_found")

        result = await self.session.execute(
            select(ChatRoom).where(
                ChatRoom.room_type == "location",
                ChatRoom.location_id == location_id,
            )
        )
        room = result.scalar_one_or_none()
        if not room:
            return {
                "location_id": location_id,
                "room_id": None,
                "active_count": 0,
                "active_jokers": [],
            }

        active_by_id = {item["id"]: item for item in online_jokers or [] if item.get("id")}
        cutoff = now_utc() - timedelta(minutes=CHAT_LOCATION_PRESENCE_MINUTES)
        recent_sender_ids = list(
            (
                await self.session.execute(
                    select(ChatMessage.sender_id)
                    .where(ChatMessage.room_id == room.id, ChatMessage.created_at >= cutoff)
                    .distinct()
                )
            ).scalars()
        )
        missing_ids = [sender_id for sender_id in recent_sender_ids if sender_id not in active_by_id]
        if missing_ids:
            senders = (
                await self.session.execute(select(JokerProfile).where(JokerProfile.id.in_(missing_ids)))
            ).scalars().all()
            for sender in senders:
                active_by_id[sender.id] = JokerBriefOut.model_validate(sender).model_dump(mode="json")

        return {
            "location_id": location_id,
            "room_id": room.id,
            "active_count": len(active_by_id),
            "active_jokers": list(active_by_id.values()),
        }

    async def private_unlocks(self, owner_session_id: str) -> list[dict]:
        current = await self.current_joker(owner_session_id)
        rows = (
            await self.session.execute(
                select(JokerRelationship).where(
                    or_(
                        JokerRelationship.joker_a_id == current.id,
                        JokerRelationship.joker_b_id == current.id,
                    )
                )
            )
        ).scalars().all()
        peer_ids = {
            row.joker_b_id if row.joker_a_id == current.id else row.joker_a_id
            for row in rows
            if self.relationship_chat_unlocked(row)
        }
        if not peer_ids:
            return []
        peers = (
            await self.session.execute(select(JokerProfile).where(JokerProfile.id.in_(peer_ids)))
        ).scalars().all()
        peers_by_id = {peer.id: peer for peer in peers}
        rooms = (
            await self.session.execute(
                select(ChatRoom).where(
                    ChatRoom.room_type == "private",
                    or_(
                        (ChatRoom.joker_a_id == current.id) & (ChatRoom.joker_b_id.in_(peer_ids)),
                        (ChatRoom.joker_b_id == current.id) & (ChatRoom.joker_a_id.in_(peer_ids)),
                    ),
                )
            )
        ).scalars().all()
        rooms_by_peer: dict[str, ChatRoom] = {}
        for room in rooms:
            peer_id = room.joker_b_id if room.joker_a_id == current.id else room.joker_a_id
            if peer_id:
                rooms_by_peer[peer_id] = room

        result = []
        for row in rows:
            peer_id = row.joker_b_id if row.joker_a_id == current.id else row.joker_a_id
            peer = peers_by_id.get(peer_id)
            if not peer or not self.relationship_chat_unlocked(row):
                continue
            result.append(
                {
                    "joker": JokerBriefOut.model_validate(peer),
                    "affinity_score": row.affinity_score,
                    "interaction_count": row.interaction_count,
                    "last_action_id": row.last_action_id,
                    "updated_at": row.updated_at,
                    "chat_unlocked": True,
                    "chat_room_id": rooms_by_peer.get(peer_id).id if peer_id in rooms_by_peer else None,
                }
            )
        return result

    async def room_for_participant(self, room_id: str, owner_session_id: str) -> tuple[ChatRoom, JokerProfile]:
        current = await self.current_joker(owner_session_id)
        room = await self.session.get(ChatRoom, room_id)
        if not room:
            raise ValueError("chat_room_not_found")
        if room.room_type == "private" and current.id not in {room.joker_a_id, room.joker_b_id}:
            raise ValueError("chat_room_forbidden")
        return room, current

    def _message_limit_for_room(self, room: ChatRoom) -> int:
        return CHAT_LOCATION_MESSAGE_LIMIT if room.room_type == "location" else CHAT_PRIVATE_MESSAGE_LIMIT

    def _message_interval_for_room(self, room: ChatRoom) -> float:
        return CHAT_LOCATION_MESSAGE_MIN_INTERVAL_SECONDS if room.room_type == "location" else CHAT_MESSAGE_MIN_INTERVAL_SECONDS

    async def _cleanup_expired_messages(self, room: ChatRoom, now: datetime) -> None:
        if room.room_type != "location":
            return
        cutoff = now - timedelta(hours=CHAT_LOCATION_TTL_HOURS)
        await self.session.execute(
            delete(ChatMessage).where(
                ChatMessage.room_id == room.id,
                ChatMessage.created_at < cutoff,
            )
        )

    async def list_messages(self, room_id: str, owner_session_id: str, limit: int | None = None) -> list[dict]:
        room, _ = await self.room_for_participant(room_id, owner_session_id)
        await self._cleanup_expired_messages(room, now_utc())
        if room.room_type == "location":
            await self.session.commit()
        max_limit = self._message_limit_for_room(room)
        message_limit = max_limit if limit is None else max(1, min(limit, max_limit))
        result = await self.session.execute(
            select(ChatMessage)
            .where(ChatMessage.room_id == room_id)
            .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
            .limit(message_limit)
        )
        messages = list(reversed(result.scalars().all()))
        sender_ids = {message.sender_id for message in messages}
        senders_by_id: dict[str, JokerProfile] = {}
        if sender_ids:
            senders = (
                await self.session.execute(select(JokerProfile).where(JokerProfile.id.in_(sender_ids)))
            ).scalars().all()
            senders_by_id = {sender.id: sender for sender in senders}
        return [await self._message_out(message, senders_by_id.get(message.sender_id)) for message in messages]

    async def _enforce_message_rate_limit(self, room: ChatRoom, sender_id: str, now: datetime) -> None:
        interval_seconds = self._message_interval_for_room(room)
        if interval_seconds <= 0:
            return
        result = await self.session.execute(
            select(ChatMessage.created_at)
            .where(ChatMessage.room_id == room.id, ChatMessage.sender_id == sender_id)
            .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
            .limit(1)
        )
        latest = result.scalar_one_or_none()
        if not latest:
            return
        if latest.tzinfo is None:
            latest = latest.replace(tzinfo=timezone.utc)
        if (now - latest).total_seconds() < interval_seconds:
            raise ValueError("chat_rate_limited")

    async def create_message(self, room_id: str, owner_session_id: str, payload: ChatMessageCreate) -> ChatMessage:
        room, sender = await self.room_for_participant(room_id, owner_session_id)
        created_at = now_utc()
        await self._cleanup_expired_messages(room, created_at)
        await self._enforce_message_rate_limit(room, sender.id, created_at)
        moderation = moderate_text(payload.content)
        self.session.add(
            ModerationLog(
                joker_id=sender.id,
                input_kind="chat_message",
                flagged=moderation.flagged,
                categories=moderation.categories,
                action_taken=moderation.action_taken,
            )
        )
        content_safe = moderation.cleaned_text[:500]
        if moderation.action_taken == "block":
            content_safe = "这条消息需要先冷静一下，系统已经替你拦住了。"
        message = ChatMessage(
            room_id=room.id,
            sender_id=sender.id,
            content=payload.content,
            content_safe=content_safe,
            created_at=created_at,
        )
        room.last_message_at = created_at
        self.session.add(message)
        await self.session.flush()

        old_ids = list(
            (
                await self.session.execute(
                    select(ChatMessage.id)
                    .where(ChatMessage.room_id == room.id)
                    .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
                    .offset(self._message_limit_for_room(room))
                )
            ).scalars()
        )
        if old_ids:
            await self.session.execute(delete(ChatMessage).where(ChatMessage.id.in_(old_ids)))

        await self.session.commit()
        await self.session.refresh(message)
        return message

    async def cleanup_stale_location_rooms(self, days: int = 7) -> int:
        cutoff = now_utc() - timedelta(days=max(1, days))
        empty_room_ids = list(
            (
                await self.session.execute(
                    select(ChatRoom.id)
                    .where(ChatRoom.room_type == "location")
                    .where(~select(ChatMessage.id).where(ChatMessage.room_id == ChatRoom.id).exists())
                    .where(
                        or_(
                            ChatRoom.last_message_at < cutoff,
                            (ChatRoom.last_message_at.is_(None)) & (ChatRoom.created_at < cutoff),
                        )
                    )
                )
            ).scalars()
        )
        if not empty_room_ids:
            return 0
        deleted = await self.session.execute(delete(ChatRoom).where(ChatRoom.id.in_(empty_room_ids)))
        await self.session.commit()
        return max(int(deleted.rowcount or 0), 0)


class AdminService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _count(self, model, *criteria) -> int:
        statement = select(func.count()).select_from(model)
        if criteria:
            statement = statement.where(*criteria)
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def system_stats(self) -> dict[str, int]:
        return {
            "joker_count": await self._count(JokerProfile),
            "user_session_count": await self._count(UserSession),
            "balloon_count": await self._count(EmoBalloon),
            "pending_balloon_count": await self._count(EmoBalloon, EmoBalloon.status == "pending"),
            "healed_balloon_count": await self._count(EmoBalloon, EmoBalloon.status == "healed"),
            "heal_action_count": await self._count(HealAction),
            "event_count": await self._count(InteractionEvent),
            "avatar_job_count": await self._count(AvatarJob),
            "media_asset_count": await self._count(MediaAsset),
            "moderation_log_count": await self._count(ModerationLog),
            "chat_room_count": await self._count(ChatRoom),
            "chat_message_count": await self._count(ChatMessage),
        }

    async def list_jokers(self, limit: int = 200) -> list[dict]:
        result = await self.session.execute(
            select(JokerProfile).order_by(desc(JokerProfile.updated_at)).limit(max(1, min(limit, 500)))
        )
        jokers = result.scalars().all()
        rows = []
        for joker in jokers:
            rows.append(
                {
                    "id": joker.id,
                    "owner_session_id": joker.owner_session_id,
                    "nickname": joker.nickname,
                    "mbti": joker.mbti,
                    "constellation": joker.constellation,
                    "social_energy": joker.social_energy,
                    "persona": joker.persona,
                    "verdict": joker.verdict,
                    "qr_token": joker.qr_token,
                    "avatar_status": joker.avatar_status,
                    "energy_score": joker.energy_score or 0,
                    "created_at": joker.created_at,
                    "updated_at": joker.updated_at,
                    "balloon_count": await self._count(EmoBalloon, EmoBalloon.owner_id == joker.id),
                    "action_count": await self._count(
                        HealAction,
                        or_(HealAction.healer_id == joker.id, HealAction.recipient_id == joker.id),
                    ),
                    "event_count": await self._count(
                        InteractionEvent,
                        or_(InteractionEvent.actor_id == joker.id, InteractionEvent.target_id == joker.id),
                    ),
                }
            )
        return rows

    async def _chat_message_out(self, message: ChatMessage, sender: JokerProfile | None = None) -> dict:
        sender = sender or await self.session.get(JokerProfile, message.sender_id)
        return {
            "id": message.id,
            "room_id": message.room_id,
            "sender_id": message.sender_id,
            "sender": JokerBriefOut.model_validate(sender) if sender else None,
            "content_safe": message.content_safe,
            "created_at": message.created_at,
        }

    async def list_location_chat_rooms(self, limit: int = 50, message_limit: int = 5) -> list[dict]:
        rooms = (
            await self.session.execute(
                select(ChatRoom)
                .where(ChatRoom.room_type == "location")
                .order_by(desc(ChatRoom.last_message_at), desc(ChatRoom.created_at))
                .limit(max(1, min(limit, 100)))
            )
        ).scalars().all()
        rows = []
        for room in rooms:
            messages = list(
                reversed(
                    (
                        await self.session.execute(
                            select(ChatMessage)
                            .where(ChatMessage.room_id == room.id)
                            .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
                            .limit(max(1, min(message_limit, 20)))
                        )
                    ).scalars().all()
                )
            )
            sender_ids = {message.sender_id for message in messages}
            senders_by_id: dict[str, JokerProfile] = {}
            if sender_ids:
                senders = (
                    await self.session.execute(select(JokerProfile).where(JokerProfile.id.in_(sender_ids)))
                ).scalars().all()
                senders_by_id = {sender.id: sender for sender in senders}
            rows.append(
                {
                    "id": room.id,
                    "room_type": room.room_type,
                    "location_id": room.location_id,
                    "joker_a_id": room.joker_a_id,
                    "joker_b_id": room.joker_b_id,
                    "created_at": room.created_at,
                    "last_message_at": room.last_message_at,
                    "message_count": await self._count(ChatMessage, ChatMessage.room_id == room.id),
                    "recent_messages": [
                        await self._chat_message_out(message, senders_by_id.get(message.sender_id))
                        for message in messages
                    ],
                }
            )
        return rows

    async def delete_chat_message(self, message_id: str) -> dict[str, int]:
        message = await self.session.get(ChatMessage, message_id)
        if not message:
            raise ValueError("chat_message_not_found")
        room = await self.session.get(ChatRoom, message.room_id)
        await self.session.delete(message)
        await self.session.flush()
        if room:
            latest = (
                await self.session.execute(
                    select(ChatMessage.created_at)
                    .where(ChatMessage.room_id == room.id)
                    .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
                    .limit(1)
                )
            ).scalar_one_or_none()
            room.last_message_at = latest
        await self.session.commit()
        return {"chat_messages": 1}

    async def _delete_count(self, model, *criteria) -> int:
        result = await self.session.execute(delete(model).where(*criteria))
        return max(int(result.rowcount or 0), 0)

    async def delete_joker(self, joker_id: str) -> dict[str, int]:
        joker = await self.session.get(JokerProfile, joker_id)
        if not joker:
            raise ValueError("joker_not_found")

        owned_balloon_ids = list(
            (
                await self.session.execute(
                    select(EmoBalloon.id).where(EmoBalloon.owner_id == joker_id)
                )
            ).scalars()
        )

        action_criteria = [HealAction.healer_id == joker_id, HealAction.recipient_id == joker_id]
        if owned_balloon_ids:
            action_criteria.append(HealAction.balloon_id.in_(owned_balloon_ids))
        related_action_ids = list(
            (await self.session.execute(select(HealAction.id).where(or_(*action_criteria)))).scalars()
        )
        related_room_ids = list(
            (
                await self.session.execute(
                    select(ChatRoom.id).where(
                        or_(ChatRoom.joker_a_id == joker_id, ChatRoom.joker_b_id == joker_id)
                    )
                )
            ).scalars()
        )

        counts: dict[str, int] = {}
        if related_room_ids:
            counts["chat_messages"] = await self._delete_count(
                ChatMessage,
                or_(ChatMessage.room_id.in_(related_room_ids), ChatMessage.sender_id == joker_id),
            )
            counts["chat_rooms"] = await self._delete_count(ChatRoom, ChatRoom.id.in_(related_room_ids))
        else:
            counts["chat_messages"] = await self._delete_count(ChatMessage, ChatMessage.sender_id == joker_id)
            counts["chat_rooms"] = 0
        relationship_criteria = [
            JokerRelationship.joker_a_id == joker_id,
            JokerRelationship.joker_b_id == joker_id,
        ]
        if related_action_ids:
            relationship_criteria.append(JokerRelationship.last_action_id.in_(related_action_ids))
        counts["relationships"] = await self._delete_count(JokerRelationship, or_(*relationship_criteria))
        counts["events"] = await self._delete_count(
            InteractionEvent,
            or_(InteractionEvent.actor_id == joker_id, InteractionEvent.target_id == joker_id),
        )
        counts["heal_actions"] = await self._delete_count(HealAction, or_(*action_criteria))
        counts["avatar_jobs"] = await self._delete_count(AvatarJob, AvatarJob.joker_id == joker_id)
        counts["media_assets"] = await self._delete_count(MediaAsset, MediaAsset.joker_id == joker_id)
        counts["moderation_logs"] = await self._delete_count(ModerationLog, ModerationLog.joker_id == joker_id)

        unlinked = await self.session.execute(
            update(EmoBalloon)
            .where(EmoBalloon.healed_by_id == joker_id, EmoBalloon.owner_id != joker_id)
            .values(healed_by_id=None, status="pending")
        )
        counts["unlinked_balloons"] = max(int(unlinked.rowcount or 0), 0)

        if owned_balloon_ids:
            counts["balloons"] = await self._delete_count(EmoBalloon, EmoBalloon.id.in_(owned_balloon_ids))
        else:
            counts["balloons"] = 0

        counts["jokers"] = await self._delete_count(JokerProfile, JokerProfile.id == joker_id)
        await self.session.commit()
        return counts


async def recent_events(session: AsyncSession, limit: int = 40) -> list[InteractionEvent]:
    result = await session.execute(select(InteractionEvent).order_by(desc(InteractionEvent.created_at)).limit(limit))
    return list(reversed(result.scalars().all()))


async def park_jokers(session: AsyncSession, limit: int = 60) -> list[JokerProfile]:
    result = await session.execute(select(JokerProfile).order_by(desc(JokerProfile.updated_at)).limit(limit))
    return list(result.scalars().all())


async def generate_autonomous_event(session: AsyncSession, settings: Settings) -> InteractionEvent | None:
    result = await session.execute(select(JokerProfile).order_by(JokerProfile.created_at).limit(12))
    jokers = result.scalars().all()
    if not jokers:
        return None
    balloon_result = await session.execute(
        select(EmoBalloon).where(EmoBalloon.status == "pending").order_by(EmoBalloon.created_at).limit(1)
    )
    balloon = balloon_result.scalar_one_or_none()
    actor = jokers[int(datetime.now(timezone.utc).timestamp()) % len(jokers)]
    target_id = balloon.owner_id if balloon else None
    target_summary = balloon.safe_summary if balloon else "乐园里有人电量偏低"
    generated = await JokerAIAdapter(settings).generate_event(actor.nickname or actor.id, target_summary, "cheer")
    event = InteractionEvent(
        actor_id=actor.id,
        target_id=target_id,
        action_type="cheer",
        dialogue=generated["dialogue"],
        animation_clip=generated["animation_clip"],
        mood_delta=generated["mood_delta"],
        position_path=generated["position_path"],
        source="autonomy",
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event
