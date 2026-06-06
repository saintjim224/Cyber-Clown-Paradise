"use client";

import type { CSSProperties, ReactNode } from "react";
import { PixelAvatarBadge } from "@/components/pixel/PixelAvatarBadge";
import type { AvatarRecipe, ClownSpriteAction } from "@/lib/api";
import type { ClownActionName } from "@/lib/clownAssets";

type ClownSpriteProps = {
  recipe?: AvatarRecipe | null;
  spriteUrl?: string | null;
  previewUrl?: string | null;
  frameSize?: number | null;
  actions?: Record<string, ClownSpriteAction> | null;
  action?: ClownActionName;
  size?: number;
  label?: string;
  className?: string;
  fallback?: ReactNode;
};

function actionConfig(
  actions: Record<string, ClownSpriteAction> | undefined | null,
  action: ClownActionName
) {
  return actions?.[action] ?? actions?.idle ?? { start: 0, frames: 1, fps: 1 };
}

export function ClownSprite({
  recipe,
  spriteUrl,
  frameSize,
  actions,
  action = "idle",
  size = 96,
  label,
  className = "",
  fallback
}: ClownSpriteProps) {
  const url = spriteUrl ?? recipe?.sprite_url;
  const resolvedFrameSize = frameSize ?? recipe?.frame_size ?? 64;
  const resolvedActions = actions ?? recipe?.actions;
  const config = actionConfig(resolvedActions, action);

  if (!url) {
    return fallback ?? <PixelAvatarBadge recipe={recipe} label={label} compact={size < 72} />;
  }

  const style = {
    "--clown-sprite-url": `url("${url}")`,
    "--clown-sprite-size": `${size}px`,
    "--clown-frame-size": `${resolvedFrameSize}px`,
    "--clown-scale": size / resolvedFrameSize,
    "--clown-start": config.start,
    "--clown-frames": config.frames,
    "--clown-duration": `${Math.max(0.25, config.frames / Math.max(config.fps, 1))}s`
  } as CSSProperties;

  return (
    <span
      className={`clown-sprite ${className}`.trim()}
      data-action={action}
      style={style}
      aria-label={label ?? "2D pixel clown"}
      role="img"
    >
      <span className="clown-sprite__sheet" aria-hidden />
    </span>
  );
}
