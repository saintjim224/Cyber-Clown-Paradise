import math
import secrets
from datetime import datetime, timezone

from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.ai_adapter import JokerAIAdapter
from app.config import Settings
from app.models import AvatarJob, ClownVote, EmoBalloon, HealAction, InteractionEvent, JokerProfile, JokerRelationship, ModerationLog
from app.safety import clamp_joker_line, moderate_text
from app.schemas import (
    AvatarJobCreate,
    BalloonCreate,
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
        relationships = []
        for relationship in relationship_rows:
            other_id = relationship.joker_b_id if relationship.joker_a_id == joker.id else relationship.joker_a_id
            other = other_jokers.get(other_id)
            if not other:
                continue
            relationships.append(
                {
                    "joker": JokerBriefOut.model_validate(other),
                    "affinity_score": relationship.affinity_score,
                    "interaction_count": relationship.interaction_count,
                    "last_action_id": relationship.last_action_id,
                    "updated_at": relationship.updated_at,
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
        return joker, list(balloons), list(actions), list(events), received_replies, sent_replies, relationships


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


async def recent_events(session: AsyncSession, limit: int = 40) -> list[InteractionEvent]:
    result = await session.execute(select(InteractionEvent).order_by(desc(InteractionEvent.created_at)).limit(limit))
    return list(reversed(result.scalars().all()))


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
