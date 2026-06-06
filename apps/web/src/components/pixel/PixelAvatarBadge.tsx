import type { CSSProperties } from "react";
import type { AvatarRecipe, Joker } from "@/lib/api";

type PixelAvatarBadgeProps = {
  joker?: Joker | null;
  recipe?: AvatarRecipe | null;
  label?: string;
  compact?: boolean;
};

function clamp(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function PixelAvatarBadge({ joker, recipe, label, compact = false }: PixelAvatarBadgeProps) {
  const avatar = recipe ?? joker?.avatar_recipe;
  const palette = avatar?.palette ?? joker?.style_tokens?.palette ?? {
    primary: "#e23d2f",
    secondary: "#2c67c7",
    accent: "#ffd84a"
  };
  const style = {
    "--avatar-primary": palette.primary,
    "--avatar-secondary": palette.secondary,
    "--avatar-accent": palette.accent,
    "--avatar-head-scale": clamp(avatar?.head_scale, 0.86, 1.22, 1),
    "--avatar-eye-gap": `${18 + clamp(avatar?.eye_spacing, 0, 1, 0.5) * 12}px`,
    "--avatar-eye-size": `${7 + clamp(avatar?.eye_size, 0, 1, 0.5) * 8}px`,
    "--avatar-nose": `${9 + clamp(avatar?.nose_scale, 0, 1, 0.5) * 9}px`,
    "--avatar-cheek": `${9 + clamp(avatar?.cheek_scale, 0, 1, 0.5) * 8}px`,
    "--avatar-hat-tilt": `${(clamp(avatar?.hat_tilt, 0, 1, 0.5) - 0.5) * 10}deg`
  } as CSSProperties;

  return (
    <div className={`pixel-avatar ${compact ? "pixel-avatar--compact" : ""}`.trim()} style={style} aria-label={label ?? "像素小丑头像"}>
      <div className="pixel-avatar__sprite" aria-hidden>
        <span className="pixel-avatar__hat" />
        <span className="pixel-avatar__head">
          <span className="pixel-avatar__eye pixel-avatar__eye--left" />
          <span className="pixel-avatar__eye pixel-avatar__eye--right" />
          <span className="pixel-avatar__cheek pixel-avatar__cheek--left" />
          <span className="pixel-avatar__cheek pixel-avatar__cheek--right" />
          <span className="pixel-avatar__nose" />
          <span className="pixel-avatar__mouth" />
        </span>
        <span className="pixel-avatar__body" />
        <span className="pixel-avatar__shoe pixel-avatar__shoe--left" />
        <span className="pixel-avatar__shoe pixel-avatar__shoe--right" />
      </div>
      {label ? <span className="pixel-avatar__label">{label}</span> : null}
    </div>
  );
}
