"use client";

import { ClownSprite } from "@/components/pixel/ClownSprite";
import { PixelAvatarBadge } from "@/components/pixel/PixelAvatarBadge";
import type { Joker, ParkEvent } from "@/lib/api";

const actionText: Record<string, string> = {
  hug: "大大拥抱",
  pet: "隔空摸头",
  cheer: "给你加油",
  dance: "原地转运舞"
};

function jokerLabel(joker: Joker | null) {
  if (!joker) return "等待小丑";
  return joker.nickname || `${joker.social_energy} 人小丑`;
}

function activeLine(joker: Joker | null, active: ParkEvent | undefined) {
  if (active?.dialogue) return active.dialogue;
  return joker?.soul_profile?.catchphrase ?? joker?.verdict ?? "生成自己的小丑后，这里会播放它的专属动作。";
}

function actionLabel(active: ParkEvent | undefined) {
  if (!active) return "SPECIAL";
  return actionText[active.action_type] ?? active.animation_clip ?? active.action_type;
}

export function ParkScene({ joker, events }: { joker: Joker | null; events: ParkEvent[] }) {
  const active = events[events.length - 1];
  const name = jokerLabel(joker);

  return (
    <div className="park-panel solo-stage-panel">
      <div className="park-canvas scene-stage solo-clown-stage">
        <div className="solo-clown-stage__spotlight">
          <div className="solo-clown-stage__sprite">
            <ClownSprite
              recipe={joker?.avatar_recipe}
              action="special"
              size={196}
              label={name}
              fallback={<PixelAvatarBadge joker={joker} recipe={joker?.avatar_recipe} label={name} />}
            />
          </div>
          <div className="solo-clown-stage__badge">
            <span>{actionLabel(active)}</span>
            <strong>{name}</strong>
          </div>
        </div>

        <div className="scene-caption">
          {activeLine(joker, active)}
        </div>
      </div>

      <div className="event-list" aria-label="自己的小丑动作记录">
        {events.length === 0 ? (
          <div className="event-row">
            <strong>等待自己的小丑动作</strong>
            <span className="event-meta">进入游园、投放气球或接住回应后，这里会同步最近动作。</span>
          </div>
        ) : (
          events.slice(-4).reverse().map((event) => (
            <div className="event-row" key={event.id}>
              <strong>{actionText[event.action_type] ?? event.animation_clip}</strong>
              <span>{event.dialogue}</span>
              <span className="event-meta">mood +{event.mood_delta} · {new Date(event.created_at).toLocaleTimeString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
