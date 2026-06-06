"use client";

import { HeartHandshake, Send } from "lucide-react";
import type { Balloon, HealAction, Joker, MatchResult } from "@/lib/api";

type SocialTaskPanelProps = {
  joker: Joker;
  loading: boolean;
  balloonText: string;
  balloon: Balloon | null;
  match: MatchResult | null;
  cheerText: string;
  action: HealAction | null;
  onBalloonTextChange: (value: string) => void;
  onCheerTextChange: (value: string) => void;
  onSubmitBalloon: () => void;
  onFindMatch: (actionType: "hug" | "pet" | "dance" | "cheer") => void;
  onSubmitHealAction: () => void;
};

export function SocialTaskPanel({
  joker,
  loading,
  balloonText,
  balloon,
  match,
  cheerText,
  action,
  onBalloonTextChange,
  onCheerTextChange,
  onSubmitBalloon,
  onFindMatch,
  onSubmitHealAction
}: SocialTaskPanelProps) {
  if (joker.social_energy === "I") {
    return (
      <div className="task-panel">
        <div className="section-title">
          <div>
            <span className="pixel-kicker">I ROUTE</span>
            <h3>情绪气球寄存</h3>
          </div>
          <HeartHandshake color="var(--color-sky)" aria-hidden />
        </div>
        <div className="field">
          <label htmlFor="balloon">最近的小丑瞬间</label>
          <textarea id="balloon" value={balloonText} onChange={(event) => onBalloonTextChange(event.target.value)} placeholder="比如：今天面试又挂了，回来还踩到水坑。" />
        </div>
        <button className="primary-button" type="button" disabled={loading || balloonText.length < 2} onClick={onSubmitBalloon}>
          <Send size={18} aria-hidden />
          寄存气球
        </button>
        {balloon ? <p className="helper">气球已入库：{balloon.safe_summary}</p> : null}
      </div>
    );
  }

  return (
    <div className="task-panel">
      <div className="section-title">
        <div>
          <span className="pixel-kicker">E ROUTE</span>
          <h3>小丑盲盒治愈任务</h3>
        </div>
        <HeartHandshake color="var(--color-red)" aria-hidden />
      </div>
      <div className="task-actions">
        <button className="secondary-button" type="button" disabled={loading} onClick={() => onFindMatch("hug")}>大大拥抱</button>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => onFindMatch("pet")}>隔空摸头</button>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => onFindMatch("dance")}>原地转运舞</button>
      </div>
      {match ? (
        <>
          <p className="helper">{match.reason}</p>
          <div className="field">
            <label htmlFor="cheer">转运骚操作话术</label>
            <input id="cheer" value={cheerText} onChange={(event) => onCheerTextChange(event.target.value)} />
          </div>
          <button className="primary-button" type="button" disabled={loading || !cheerText} onClick={onSubmitHealAction}>
            <Send size={18} aria-hidden />
            发射治愈动作
          </button>
        </>
      ) : null}
      {action ? <p className="helper">治愈已送达：{action.cheer_text}</p> : null}
    </div>
  );
}
