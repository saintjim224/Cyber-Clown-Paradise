from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def json_type():
    return JSON().with_variant(JSONB, "postgresql")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )


class JokerProfile(Base, TimestampMixin):
    __tablename__ = "joker_profiles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("jkr"))
    nickname: Mapped[str | None] = mapped_column(String(32), nullable=True)
    mbti: Mapped[str] = mapped_column(String(4), index=True)
    constellation: Mapped[str] = mapped_column(String(16), index=True)
    social_energy: Mapped[str] = mapped_column(String(1), index=True)
    consent_media: Mapped[bool] = mapped_column(Boolean, default=False)
    persona: Mapped[str] = mapped_column(Text)
    verdict: Mapped[str] = mapped_column(Text)
    qr_token: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    style_tokens: Mapped[dict] = mapped_column(MutableDict.as_mutable(json_type()))
    embedding: Mapped[list | None] = mapped_column(MutableList.as_mutable(json_type()), nullable=True)
    soul_seed: Mapped[str | None] = mapped_column(Text, nullable=True)
    soul_profile: Mapped[dict | None] = mapped_column(MutableDict.as_mutable(json_type()), nullable=True)
    avatar_recipe: Mapped[dict | None] = mapped_column(MutableDict.as_mutable(json_type()), nullable=True)
    face_descriptor: Mapped[dict | None] = mapped_column(MutableDict.as_mutable(json_type()), nullable=True)
    avatar_status: Mapped[str] = mapped_column(String(24), default="recipe_ready")

    balloons: Mapped[list["EmoBalloon"]] = relationship(
        back_populates="owner",
        foreign_keys="EmoBalloon.owner_id",
    )
    actions: Mapped[list["HealAction"]] = relationship(back_populates="healer")


class EmoBalloon(Base, TimestampMixin):
    __tablename__ = "emo_balloons"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("bal"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("joker_profiles.id"), index=True)
    emo_text: Mapped[str] = mapped_column(Text)
    safe_summary: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    healed_by_id: Mapped[str | None] = mapped_column(ForeignKey("joker_profiles.id"), nullable=True)
    embedding: Mapped[list | None] = mapped_column(MutableList.as_mutable(json_type()), nullable=True)
    tags: Mapped[dict] = mapped_column(MutableDict.as_mutable(json_type()), default=dict)

    owner: Mapped[JokerProfile] = relationship(back_populates="balloons", foreign_keys=[owner_id])


class HealAction(Base, TimestampMixin):
    __tablename__ = "heal_actions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("act"))
    healer_id: Mapped[str] = mapped_column(ForeignKey("joker_profiles.id"), index=True)
    balloon_id: Mapped[str] = mapped_column(ForeignKey("emo_balloons.id"), index=True)
    action_type: Mapped[str] = mapped_column(String(24))
    cheer_text: Mapped[str] = mapped_column(Text)
    match_score: Mapped[float] = mapped_column(Float, default=0.0)
    match_reason: Mapped[str] = mapped_column(Text)
    media_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"), nullable=True)

    healer: Mapped[JokerProfile] = relationship(back_populates="actions")


class InteractionEvent(Base, TimestampMixin):
    __tablename__ = "interaction_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("evt"))
    scene_session_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    actor_id: Mapped[str] = mapped_column(String(32), index=True)
    target_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    action_type: Mapped[str] = mapped_column(String(24))
    dialogue: Mapped[str] = mapped_column(Text)
    animation_clip: Mapped[str] = mapped_column(String(32))
    mood_delta: Mapped[int] = mapped_column(Integer, default=0)
    position_path: Mapped[list] = mapped_column(MutableList.as_mutable(json_type()), default=list)
    source: Mapped[str] = mapped_column(String(24), default="user")


class AvatarJob(Base, TimestampMixin):
    __tablename__ = "avatar_jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("avj"))
    joker_id: Mapped[str] = mapped_column(ForeignKey("joker_profiles.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    input_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"), nullable=True)
    output_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"), nullable=True)
    fallback_asset_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(32), default="recipe-render")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_descriptor: Mapped[dict | None] = mapped_column(MutableDict.as_mutable(json_type()), nullable=True)
    result_recipe: Mapped[dict | None] = mapped_column(MutableDict.as_mutable(json_type()), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)


class MediaAsset(Base, TimestampMixin):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("med"))
    joker_id: Mapped[str | None] = mapped_column(ForeignKey("joker_profiles.id"), nullable=True, index=True)
    asset_type: Mapped[str] = mapped_column(String(24))
    storage_key: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(80))
    public_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_scope: Mapped[str] = mapped_column(String(32), default="explicit")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ModerationLog(Base, TimestampMixin):
    __tablename__ = "moderation_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("mod"))
    joker_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    input_kind: Mapped[str] = mapped_column(String(24))
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    categories: Mapped[dict] = mapped_column(MutableDict.as_mutable(json_type()), default=dict)
    action_taken: Mapped[str] = mapped_column(String(32), default="allow")
