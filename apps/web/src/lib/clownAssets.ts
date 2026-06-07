import { generatedClownAssets } from "@/lib/generatedClownAssets";
import type { AvatarRecipe, ClownSpriteAction, FaceDescriptor, Joker, SoulProfile } from "@/lib/api";

export type ClownAssetPool = "I" | "E";
export type ClownActionName = "idle" | "walk-front" | "walk-side" | "walk-back" | "special";

export type ClownAsset = {
  asset_id: string;
  asset_pool: ClownAssetPool;
  label: string;
  source_file: string;
  preview_url: string;
  sprite_url: string;
  frame_size: number;
  actions: Record<ClownActionName | string, ClownSpriteAction>;
};

export type ClownSelectionInput = {
  socialEnergy: ClownAssetPool;
  nickname: string;
  mbti: string;
  constellation: string;
  soulSeed: string;
  draftSoul: SoulProfile;
  faceDescriptor: FaceDescriptor | null;
};

const storageKey = "cyberjoker.activeJoker.v1";
const pools = generatedClownAssets.pools as unknown as Record<ClownAssetPool, ClownAsset[]>;

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function cloneActions(actions: ClownAsset["actions"]) {
  return Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      { start: action.start, frames: action.frames, fps: action.fps }
    ])
  );
}

export function getClownAssets(pool: ClownAssetPool) {
  return pools[pool] ?? [];
}

export function selectClownAsset(input: ClownSelectionInput): ClownAsset | null {
  const assets = getClownAssets(input.socialEnergy);
  if (assets.length === 0) return null;
  const seed = JSON.stringify({
    socialEnergy: input.socialEnergy,
    nickname: input.nickname.trim(),
    mbti: input.mbti,
    constellation: input.constellation,
    soulSeed: input.soulSeed.trim(),
    draftSoul: input.draftSoul,
    faceDescriptor: input.faceDescriptor
  });
  return assets[stableHash(seed) % assets.length] ?? assets[0] ?? null;
}

export function withClownAsset(recipe: AvatarRecipe, asset: ClownAsset | null): AvatarRecipe {
  if (!asset) return recipe;
  return {
    ...recipe,
    asset_id: asset.asset_id,
    asset_pool: asset.asset_pool,
    preview_url: asset.preview_url,
    sprite_url: asset.sprite_url,
    frame_size: asset.frame_size,
    actions: cloneActions(asset.actions)
  };
}

export function saveActiveJoker(joker: Joker) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(joker));
}

export function loadActiveJoker(): Joker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const joker = JSON.parse(raw) as Joker;
    return { ...joker, energy_score: joker.energy_score ?? 0 };
  } catch {
    return null;
  }
}
