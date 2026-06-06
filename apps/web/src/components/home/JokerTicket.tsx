"use client";

import { Upload } from "lucide-react";
import { ClownSprite } from "@/components/pixel/ClownSprite";
import { PixelAvatarBadge } from "@/components/pixel/PixelAvatarBadge";
import { QRCodeBox } from "@/components/QRCodeBox";
import type { Joker } from "@/lib/api";

type JokerTicketProps = {
  joker: Joker;
  qrValue: string;
  onCreateAvatarJob: () => void;
};

export function JokerTicket({ joker, qrValue, onCreateAvatarJob }: JokerTicketProps) {
  const label = joker.social_energy === "I" ? "I 人小丑" : "E 人小丑";

  return (
    <div className="joker-card">
      <div className="section-title">
        <div>
          <span className="pixel-kicker">PLAYER CARD</span>
          <h3>{joker.nickname || "匿名小丑"} 已入园</h3>
        </div>
        <button className="icon-button" type="button" onClick={onCreateAvatarJob} title="创建图片转 3D 任务">
          <Upload size={17} aria-hidden />
        </button>
      </div>
      <div className="joker-card__body">
        <ClownSprite
          recipe={joker.avatar_recipe}
          action="idle"
          size={112}
          label={label}
          fallback={<PixelAvatarBadge joker={joker} label={label} />}
        />
        <div>
          <p className="verdict">{joker.verdict}</p>
          <p className="helper">{joker.persona}</p>
        </div>
      </div>
      {joker.soul_profile?.sample_lines?.length ? (
        <div className="soul-chip-row">
          {joker.soul_profile.sample_lines.slice(0, 3).map((line) => (
            <span className="soul-chip" key={line}>{line}</span>
          ))}
        </div>
      ) : null}
      {qrValue ? <QRCodeBox value={qrValue} /> : null}
    </div>
  );
}
