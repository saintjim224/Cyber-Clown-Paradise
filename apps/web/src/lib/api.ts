export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export type StyleTokens = {
  palette: { primary: string; secondary: string; accent: string };
  material: string;
  motion: string;
  aura: string;
};

export type FaceDescriptor = {
  face_roundness: number;
  eye_spacing: number;
  eye_size: number;
  brow_lift: number;
  smile_curve: number;
  mouth_width: number;
  cheek_fullness: number;
  nose_scale: number;
  head_tilt: number;
  confidence: number;
  capture_quality: "good" | "ok" | "low" | "fallback";
};

export type SoulProfile = {
  core_personality: string;
  behavior_rules: string[];
  sample_lines: string[];
  social_boundaries: string[];
  catchphrase: string;
};

export type ClownSpriteAction = {
  start: number;
  frames: number;
  fps: number;
};

export type AvatarRecipe = {
  art_version: "native-clown-v1" | string;
  palette: { primary: string; secondary: string; accent: string };
  head_scale: number;
  body_scale: number;
  eye_spacing: number;
  eye_size: number;
  nose_scale: number;
  cheek_scale: number;
  mouth_width: number;
  hat_height: number;
  hat_tilt: number;
  motion_style: string;
  material: string;
  asset_id?: string;
  asset_pool?: "I" | "E";
  preview_url?: string;
  sprite_url?: string;
  frame_size?: number;
  actions?: Record<string, ClownSpriteAction>;
};

export type JokerDraft = {
  soul_profile: SoulProfile;
  verdict: string;
  persona: string;
  style_tokens: StyleTokens;
  avatar_recipe: AvatarRecipe;
};

export type Joker = {
  id: string;
  nickname: string | null;
  mbti: string;
  constellation: string;
  social_energy: "I" | "E";
  desired_poi_id: string | null;
  persona: string;
  verdict: string;
  qr_token: string;
  style_tokens: StyleTokens;
  soul_profile: SoulProfile | null;
  avatar_recipe: AvatarRecipe | null;
  avatar_status: string | null;
  energy_score: number;
};

export type JokerBrief = {
  id: string;
  nickname: string | null;
  mbti: string;
  constellation: string;
  social_energy: "I" | "E";
  energy_score: number;
};

export type Balloon = {
  id: string;
  owner_id: string;
  emo_text: string;
  safe_summary: string;
  status: string;
  healed_by_id: string | null;
};

export type MatchResult = {
  balloon_id: string;
  owner_id: string;
  balloon_summary: string;
  owner: JokerBrief;
  score: number;
  reason: string;
  suggested_action: string;
  prompt: string;
};

export type MatchRequest = {
  action_type: string;
  target_owner_id?: string | null;
};

export type HealAction = {
  id: string;
  healer_id: string;
  recipient_id: string | null;
  balloon_id: string;
  action_type: string;
  cheer_text: string;
  match_score: number;
  match_reason: string;
  energy_delta_healer: number;
  energy_delta_owner: number;
  affinity_delta: number;
};

export type ParkEvent = {
  id: string;
  actor_id: string;
  target_id: string | null;
  action_type: string;
  dialogue: string;
  animation_clip: string;
  mood_delta: number;
  position_path: number[][];
  source: string;
  created_at: string;
};

export type Replay = {
  joker: Joker;
  balloons: Balloon[];
  actions: HealAction[];
  events: ParkEvent[];
  received_replies: ReplyRecord[];
  sent_replies: ReplyRecord[];
  relationships: RelationshipRecord[];
  public_footprints: PublicFootprint[];
  energy_score: number;
  headline: string;
  share_text: string;
};

export type PublicFootprint = {
  id: string;
  room_id: string;
  location_id: string;
  location_label: string;
  content_safe: string | null;
  created_at: string;
};

export type ReplyRecord = {
  id: string;
  balloon_id: string;
  balloon_summary: string;
  responder: JokerBrief;
  recipient: JokerBrief;
  action_type: string;
  cheer_text: string;
  match_score: number;
  match_reason: string;
  energy_delta_healer: number;
  energy_delta_owner: number;
  affinity_delta: number;
  created_at: string;
};

export type RelationshipRecord = {
  joker: JokerBrief;
  affinity_score: number;
  interaction_count: number;
  last_action_id: string | null;
  updated_at: string;
  chat_unlocked: boolean;
  chat_room_id: string | null;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  sender: JokerBrief | null;
  content_safe: string | null;
  created_at: string;
};

export type ChatRoom = {
  id: string;
  room_type: "private" | "location" | string;
  joker_a_id: string | null;
  joker_b_id: string | null;
  location_id: string | null;
  created_at: string;
  last_message_at: string | null;
  peer: JokerBrief | null;
};

export type ChatLocation = {
  id: string;
  label: string;
  note: string;
};

export type ChatLocationPresence = {
  location_id: string;
  room_id: string | null;
  active_count: number;
  active_jokers: JokerBrief[];
};

export type AdminSession = {
  username: string;
  role: "admin" | "super_admin" | string;
  is_super_admin: boolean;
  host: string | null;
  expires_in_seconds: number;
};

export type AdminStats = {
  joker_count: number;
  user_session_count: number;
  balloon_count: number;
  pending_balloon_count: number;
  healed_balloon_count: number;
  heal_action_count: number;
  event_count: number;
  avatar_job_count: number;
  media_asset_count: number;
  moderation_log_count: number;
  chat_room_count: number;
  chat_message_count: number;
};

export type AdminJoker = {
  id: string;
  owner_session_id: string | null;
  nickname: string | null;
  mbti: string;
  constellation: string;
  social_energy: "I" | "E" | string;
  persona: string;
  verdict: string;
  qr_token: string;
  avatar_status: string | null;
  energy_score: number;
  created_at: string;
  updated_at: string;
  balloon_count: number;
  action_count: number;
  event_count: number;
};

export type AdminDeleteResult = {
  joker_id: string;
  deleted_counts: Record<string, number>;
};

export type AdminChatRoom = {
  id: string;
  room_type: string;
  location_id: string | null;
  joker_a_id: string | null;
  joker_b_id: string | null;
  created_at: string;
  last_message_at: string | null;
  message_count: number;
  recent_messages: ChatMessage[];
};

export type ClownVoteSummaryItem = {
  clown_id: string;
  votes: number;
};

export type ClownVoteSummary = {
  items: ClownVoteSummaryItem[];
  voted_clown_id: string | null;
};

function currentSiteOrigin() {
  if (SITE_ORIGIN) return SITE_ORIGIN;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function apiErrorMessage(response: Response, text: string) {
  if (!text) return `Request failed: ${response.status}`;
  try {
    const payload = JSON.parse(text) as { detail?: unknown };
    if (typeof payload.detail === "string") return payload.detail;
  } catch {
    // Fall back to the raw response text.
  }
  return text;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(apiErrorMessage(response, text));
  }
  return response.json() as Promise<T>;
}

export function replayUrl(token: string) {
  const path = `/replay/${token}`;
  const origin = currentSiteOrigin();
  return origin ? `${origin}${path}` : path;
}

export function parkEntryUrl(token: string) {
  const path = `/park/join/${token}`;
  const origin = currentSiteOrigin();
  return origin ? `${origin}${path}` : path;
}

export function apiWebSocketUrl(path: string) {
  const base = API_BASE.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${base}${path}`;
}
