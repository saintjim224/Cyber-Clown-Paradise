import { z } from "zod";

export const socialEnergySchema = z.enum(["I", "E"]);
export type SocialEnergy = z.infer<typeof socialEnergySchema>;

export const faceDescriptorSchema = z.object({
  face_roundness: z.number().min(0).max(1),
  eye_spacing: z.number().min(0).max(1),
  eye_size: z.number().min(0).max(1),
  brow_lift: z.number().min(0).max(1),
  smile_curve: z.number().min(0).max(1),
  mouth_width: z.number().min(0).max(1),
  cheek_fullness: z.number().min(0).max(1),
  nose_scale: z.number().min(0).max(1),
  head_tilt: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  capture_quality: z.enum(["good", "ok", "low", "fallback"]),
});

export type FaceDescriptor = z.infer<typeof faceDescriptorSchema>;

export const soulProfileSchema = z.object({
  core_personality: z.string().min(1).max(180),
  behavior_rules: z.array(z.string().min(1).max(80)).max(5),
  sample_lines: z.array(z.string().min(1).max(80)).max(5),
  social_boundaries: z.array(z.string().min(1).max(80)).max(5),
  catchphrase: z.string().min(1).max(80),
});

export type SoulProfile = z.infer<typeof soulProfileSchema>;

export const clownSpriteActionSchema = z.object({
  start: z.number().int().min(0),
  frames: z.number().int().min(1),
  fps: z.number().min(0.1),
});

export const avatarRecipeSchema = z.object({
  art_version: z.literal("native-clown-v1").or(z.string().min(1)),
  palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
  }),
  head_scale: z.number().min(0.82).max(1.24),
  body_scale: z.number().min(0.86).max(1.16),
  eye_spacing: z.number().min(0).max(1),
  eye_size: z.number().min(0).max(1),
  nose_scale: z.number().min(0).max(1),
  cheek_scale: z.number().min(0).max(1),
  mouth_width: z.number().min(0).max(1),
  hat_height: z.number().min(0).max(1),
  hat_tilt: z.number().min(0).max(1),
  motion_style: z.string().min(1),
  material: z.string().min(1),
  asset_id: z.string().optional(),
  asset_pool: socialEnergySchema.optional(),
  preview_url: z.string().optional(),
  sprite_url: z.string().optional(),
  frame_size: z.number().int().positive().optional(),
  actions: z.record(clownSpriteActionSchema).optional(),
});

export type AvatarRecipe = z.infer<typeof avatarRecipeSchema>;

export const jokerCreateSchema = z.object({
  nickname: z.string().max(32).optional(),
  mbti: z.string().min(4).max(4),
  constellation: z.string().min(1).max(16),
  social_energy: socialEnergySchema,
  consent_media: z.boolean().default(false),
  soul_seed: z.string().max(700).optional(),
  soul_profile: soulProfileSchema.optional(),
  avatar_recipe: avatarRecipeSchema.optional(),
  face_descriptor: faceDescriptorSchema.optional(),
});

export type JokerCreate = z.infer<typeof jokerCreateSchema>;

export const styleTokensSchema = z.object({
  palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
  }),
  material: z.string(),
  motion: z.string(),
  aura: z.string(),
});

export type StyleTokens = z.infer<typeof styleTokensSchema>;

export const jokerDraftCreateSchema = z.object({
  mbti: z.string().min(4).max(4),
  constellation: z.string().min(1).max(16),
  social_energy: socialEnergySchema,
  soul_seed: z.string().min(1).max(700),
  face_descriptor: faceDescriptorSchema.optional(),
});

export type JokerDraftCreate = z.infer<typeof jokerDraftCreateSchema>;

export const jokerDraftSchema = z.object({
  soul_profile: soulProfileSchema,
  verdict: z.string(),
  persona: z.string(),
  style_tokens: styleTokensSchema,
  avatar_recipe: avatarRecipeSchema,
});

export type JokerDraft = z.infer<typeof jokerDraftSchema>;

export const jokerSchema = z.object({
  id: z.string(),
  nickname: z.string().nullable(),
  mbti: z.string(),
  constellation: z.string(),
  social_energy: socialEnergySchema,
  persona: z.string(),
  verdict: z.string(),
  qr_token: z.string(),
  style_tokens: styleTokensSchema,
  soul_profile: soulProfileSchema.nullable(),
  avatar_recipe: avatarRecipeSchema.nullable(),
  avatar_status: z.string().nullable(),
  energy_score: z.number().int().default(0),
});

export type Joker = z.infer<typeof jokerSchema>;

export const parkEventSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  targetId: z.string().nullable(),
  actionType: z.string(),
  dialogue: z.string(),
  animationClip: z.string(),
  moodDelta: z.number(),
  positionPath: z.array(z.tuple([z.number(), z.number(), z.number()])),
  createdAt: z.string(),
});

export type ParkEvent = z.infer<typeof parkEventSchema>;
