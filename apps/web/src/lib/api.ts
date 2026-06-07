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
  energy_score: number;
  headline: string;
  share_text: string;
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
};

function currentSiteOrigin() {
  if (SITE_ORIGIN) return SITE_ORIGIN;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
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
    throw new Error(text || `Request failed: ${response.status}`);
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
