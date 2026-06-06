# CyberJoker Park Design System

## Direction

The product should feel like a neon candy carnival made from soft vinyl toys: playful, saturated, kinetic, but still readable and touch-friendly. Every view must share the same material language: blackcurrant night surfaces, mint-cyan light rails, coral-pink accents, lemon highlights, and soft rubber 3D characters.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#100d24` | App background |
| `--color-surface` | `#1b1735` | Panels and tool surfaces |
| `--color-surface-2` | `#262044` | Raised panels |
| `--color-text` | `#fff8e7` | Primary text |
| `--color-muted` | `#b8b0d8` | Secondary text |
| `--color-cyan` | `#27f5d4` | Navigation, focus, live signals |
| `--color-coral` | `#ff5f8f` | Primary action, clown cheeks |
| `--color-lemon` | `#ffe45e` | Status highlights |
| `--color-violet` | `#8b5cf6` | Secondary depth |
| `--radius-card` | `8px` | Cards and panels |
| `--shadow-neon` | `0 0 32px rgba(39, 245, 212, .28)` | Focused surfaces |

## Type

- UI font: system sans with Chinese fallback, `Inter`, `PingFang SC`, `Microsoft YaHei`, `Noto Sans SC`.
- Body: 16px minimum, line-height 1.55.
- Compact panel headings: 18-24px. Reserve larger type for the first screen only.
- Letter spacing stays `0`.

## Interaction

- Buttons are at least 44px high and use lucide icons when an icon is helpful.
- Animation durations: 160-280ms for UI, 600-1200ms for character moves.
- Respect `prefers-reduced-motion`: remove camera drift and nonessential pulses.
- No emoji as structural icons.

## 3D Rules

- Q version clown ratio: head 45%, torso 30%, legs 25%.
- Materials: high roughness soft vinyl, no photorealistic skin.
- Every autonomous event must include a visible action plus one short subtitle.
- Failed GLB loads use the base clown with user style tokens and optional flat image texture.

## Copy Voice

Small clowns are direct, funny, and kind. They speak in one or two short Chinese sentences. Avoid therapy diagnosis, long advice, customer-service phrasing, and any phrase like "作为 AI".
