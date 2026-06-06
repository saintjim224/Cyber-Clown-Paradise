"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { ClownSprite } from "@/components/pixel/ClownSprite";
import type { Joker } from "@/lib/api";

type ClownRevealModalProps = {
  joker: Joker;
  onEnterPark: () => void;
};

export function ClownRevealModal({ joker, onEnterPark }: ClownRevealModalProps) {
  const label = joker.social_energy === "I" ? "I 人专属小丑" : "E 人专属小丑";

  return (
    <div className="clown-reveal" role="dialog" aria-modal="true" aria-labelledby="clownRevealTitle">
      <div className="clown-reveal__card">
        <span className="pixel-kicker">CLOWN GENERATED</span>
        <h2 id="clownRevealTitle">你的小丑醒来了</h2>
        <div className="clown-reveal__stage">
          <ClownSprite recipe={joker.avatar_recipe} action="special" size={180} label={label} />
        </div>
        <p>{joker.verdict}</p>
        <div className="clown-reveal__actions">
          <button className="primary-button" type="button" onClick={onEnterPark}>
            <Sparkles size={18} aria-hidden />
            进入游园
            <ArrowRight size={18} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
