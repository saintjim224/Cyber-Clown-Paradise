from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StyleTokens(BaseModel):
    palette: dict[str, str]
    material: str
    motion: str
    aura: str


class FaceDescriptor(BaseModel):
    face_roundness: float = Field(default=0.5, ge=0, le=1)
    eye_spacing: float = Field(default=0.5, ge=0, le=1)
    eye_size: float = Field(default=0.5, ge=0, le=1)
    brow_lift: float = Field(default=0.5, ge=0, le=1)
    smile_curve: float = Field(default=0.5, ge=0, le=1)
    mouth_width: float = Field(default=0.5, ge=0, le=1)
    cheek_fullness: float = Field(default=0.5, ge=0, le=1)
    nose_scale: float = Field(default=0.5, ge=0, le=1)
    head_tilt: float = Field(default=0.5, ge=0, le=1)
    confidence: float = Field(default=0.0, ge=0, le=1)
    capture_quality: str = Field(default="fallback", pattern="^(good|ok|low|fallback)$")


class SoulProfile(BaseModel):
    core_personality: str = Field(min_length=1, max_length=180)
    behavior_rules: list[str] = Field(default_factory=list, max_length=5)
    sample_lines: list[str] = Field(default_factory=list, max_length=5)
    social_boundaries: list[str] = Field(default_factory=list, max_length=5)
    catchphrase: str = Field(min_length=1, max_length=80)


class ClownSpriteAction(BaseModel):
    start: int = Field(ge=0)
    frames: int = Field(ge=1)
    fps: float = Field(gt=0)


class AvatarRecipe(BaseModel):
    art_version: str = "native-clown-v1"
    palette: dict[str, str]
    head_scale: float = Field(default=1.0, ge=0.82, le=1.24)
    body_scale: float = Field(default=1.0, ge=0.86, le=1.16)
    eye_spacing: float = Field(default=0.5, ge=0, le=1)
    eye_size: float = Field(default=0.5, ge=0, le=1)
    nose_scale: float = Field(default=0.5, ge=0, le=1)
    cheek_scale: float = Field(default=0.5, ge=0, le=1)
    mouth_width: float = Field(default=0.5, ge=0, le=1)
    hat_height: float = Field(default=0.5, ge=0, le=1)
    hat_tilt: float = Field(default=0.5, ge=0, le=1)
    motion_style: str = "gentle-float"
    material: str = "soft-vinyl"
    asset_id: str | None = None
    asset_pool: str | None = Field(default=None, pattern="^[IE]$")
    preview_url: str | None = None
    sprite_url: str | None = None
    frame_size: int | None = Field(default=None, gt=0)
    actions: dict[str, ClownSpriteAction] | None = None


class JokerDraftCreate(BaseModel):
    mbti: str = Field(min_length=4, max_length=4)
    constellation: str = Field(min_length=1, max_length=16)
    social_energy: str = Field(pattern="^[IE]$")
    soul_seed: str = Field(min_length=1, max_length=700)
    face_descriptor: FaceDescriptor | None = None


class JokerDraftOut(BaseModel):
    soul_profile: SoulProfile
    verdict: str
    persona: str
    style_tokens: StyleTokens
    avatar_recipe: AvatarRecipe


class JokerCreate(BaseModel):
    nickname: str | None = Field(default=None, max_length=32)
    mbti: str = Field(min_length=4, max_length=4)
    constellation: str = Field(min_length=1, max_length=16)
    social_energy: str = Field(pattern="^[IE]$")
    consent_media: bool = False
    soul_seed: str | None = Field(default=None, max_length=700)
    soul_profile: SoulProfile | None = None
    avatar_recipe: AvatarRecipe | None = None
    style_tokens: StyleTokens | None = None
    verdict: str | None = Field(default=None, max_length=220)
    face_descriptor: FaceDescriptor | None = None


class JokerOut(BaseModel):
    id: str
    nickname: str | None
    mbti: str
    constellation: str
    social_energy: str
    persona: str
    verdict: str
    qr_token: str
    style_tokens: StyleTokens
    soul_profile: SoulProfile | None = None
    avatar_recipe: AvatarRecipe | None = None
    avatar_status: str | None = "recipe_ready"
    energy_score: int = 0

    model_config = ConfigDict(from_attributes=True)


class JokerBriefOut(BaseModel):
    id: str
    nickname: str | None
    mbti: str
    constellation: str
    social_energy: str
    energy_score: int = 0

    model_config = ConfigDict(from_attributes=True)


class BalloonCreate(BaseModel):
    emo_text: str = Field(min_length=2, max_length=500)


class BalloonOut(BaseModel):
    id: str
    owner_id: str
    emo_text: str
    safe_summary: str
    status: str
    healed_by_id: str | None

    model_config = ConfigDict(from_attributes=True)


class MatchRequest(BaseModel):
    action_type: str = Field(default="hug", pattern="^(hug|pet|cheer|dance)$")


class MatchOut(BaseModel):
    balloon_id: str
    owner_id: str
    balloon_summary: str
    owner: JokerBriefOut
    score: float
    reason: str
    suggested_action: str
    prompt: str


class HealActionCreate(BaseModel):
    balloon_id: str
    action_type: str = Field(pattern="^(hug|pet|cheer|dance)$")
    cheer_text: str = Field(min_length=1, max_length=120)
    media_asset_id: str | None = None


class HealActionOut(BaseModel):
    id: str
    healer_id: str
    recipient_id: str | None
    balloon_id: str
    action_type: str
    cheer_text: str
    match_score: float
    match_reason: str
    energy_delta_healer: int = 1
    energy_delta_owner: int = 2
    affinity_delta: int = 3

    model_config = ConfigDict(from_attributes=True)


class ParkEventOut(BaseModel):
    id: str
    actor_id: str
    target_id: str | None
    action_type: str
    dialogue: str
    animation_clip: str
    mood_delta: int
    position_path: list[list[float]]
    source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReplyRecordOut(BaseModel):
    id: str
    balloon_id: str
    balloon_summary: str
    responder: JokerBriefOut
    recipient: JokerBriefOut
    action_type: str
    cheer_text: str
    match_score: float
    match_reason: str
    energy_delta_healer: int
    energy_delta_owner: int
    affinity_delta: int
    created_at: datetime


class RelationshipOut(BaseModel):
    joker: JokerBriefOut
    affinity_score: int
    interaction_count: int
    last_action_id: str | None
    updated_at: datetime
    chat_unlocked: bool = False
    chat_room_id: str | None = None


class PublicFootprintOut(BaseModel):
    id: str
    room_id: str
    location_id: str
    location_label: str
    content_safe: str | None
    created_at: datetime


class ReplayOut(BaseModel):
    joker: JokerOut
    balloons: list[BalloonOut]
    actions: list[HealActionOut]
    events: list[ParkEventOut]
    received_replies: list[ReplyRecordOut]
    sent_replies: list[ReplyRecordOut]
    relationships: list[RelationshipOut]
    public_footprints: list[PublicFootprintOut] = Field(default_factory=list)
    energy_score: int
    headline: str
    share_text: str


class AvatarJobCreate(BaseModel):
    joker_id: str
    input_asset_id: str | None = None
    image_url: str | None = None
    input_descriptor: FaceDescriptor | None = None
    avatar_recipe: AvatarRecipe | None = None


class AvatarJobOut(BaseModel):
    id: str
    joker_id: str
    status: str
    provider: str
    fallback_asset_url: str | None
    output_asset_id: str | None
    error_message: str | None
    progress: int = 0
    result_recipe: AvatarRecipe | None = None

    model_config = ConfigDict(from_attributes=True)


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class ChatMessageOut(BaseModel):
    id: str
    room_id: str
    sender_id: str
    sender: JokerBriefOut | None = None
    content_safe: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatRoomOut(BaseModel):
    id: str
    room_type: str
    joker_a_id: str | None
    joker_b_id: str | None
    location_id: str | None
    created_at: datetime
    last_message_at: datetime | None
    peer: JokerBriefOut | None = None

    model_config = ConfigDict(from_attributes=True)


class ChatLocationOut(BaseModel):
    id: str
    label: str
    note: str


class ChatLocationPresenceOut(BaseModel):
    location_id: str
    room_id: str | None = None
    active_count: int = 0
    active_jokers: list[JokerBriefOut] = Field(default_factory=list)


class HealthOut(BaseModel):
    ok: bool
    service: str
    env: str


class AdminLoginCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class AdminSessionOut(BaseModel):
    username: str
    role: str
    is_super_admin: bool
    host: str | None
    expires_in_seconds: int


class AdminSystemStatsOut(BaseModel):
    joker_count: int
    user_session_count: int
    balloon_count: int
    pending_balloon_count: int
    healed_balloon_count: int
    heal_action_count: int
    event_count: int
    avatar_job_count: int
    media_asset_count: int
    moderation_log_count: int
    chat_room_count: int = 0
    chat_message_count: int = 0


class AdminChatMessageOut(BaseModel):
    id: str
    room_id: str
    sender_id: str
    sender: JokerBriefOut | None = None
    content_safe: str | None
    created_at: datetime


class AdminChatRoomOut(BaseModel):
    id: str
    room_type: str
    location_id: str | None
    joker_a_id: str | None
    joker_b_id: str | None
    created_at: datetime
    last_message_at: datetime | None
    message_count: int = 0
    recent_messages: list[AdminChatMessageOut] = Field(default_factory=list)


class AdminJokerOut(BaseModel):
    id: str
    owner_session_id: str | None
    nickname: str | None
    mbti: str
    constellation: str
    social_energy: str
    persona: str
    verdict: str
    qr_token: str
    avatar_status: str | None
    energy_score: int
    created_at: datetime
    updated_at: datetime
    balloon_count: int
    action_count: int
    event_count: int


class AdminDeleteOut(BaseModel):
    joker_id: str
    deleted_counts: dict[str, int]
