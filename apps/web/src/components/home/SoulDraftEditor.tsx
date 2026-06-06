"use client";

import { RefreshCcw, Save, Sparkles } from "lucide-react";
import { PixelAvatarBadge } from "@/components/pixel/PixelAvatarBadge";
import type { JokerDraft, SoulProfile } from "@/lib/api";

type SoulDraftEditorProps = {
  draft: JokerDraft;
  draftSoul: SoulProfile;
  draftVerdict: string;
  loading: boolean;
  onSoulChange: <K extends keyof SoulProfile>(field: K, value: SoulProfile[K]) => void;
  onVerdictChange: (value: string) => void;
  onRegenerate: () => void;
  onSubmit: () => void;
};

function joinLines(lines: string[]) {
  return lines.join("\n");
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function SoulDraftEditor({
  draft,
  draftSoul,
  draftVerdict,
  loading,
  onSoulChange,
  onVerdictChange,
  onRegenerate,
  onSubmit
}: SoulDraftEditorProps) {
  return (
    <div className="task-panel">
      <div className="section-title">
        <div>
          <span className="pixel-kicker">STEP 02</span>
          <h2>小丑灵魂草案</h2>
          <p>确认后，这只小丑会用同一套灵魂和形象进入校园地图。</p>
        </div>
        <Sparkles color="var(--color-sky)" aria-hidden />
      </div>
      <div className="avatar-draft-row">
        <PixelAvatarBadge recipe={draft.avatar_recipe} label="预览" />
        <div className="swatch-row" aria-label="小丑配色">
          {Object.values(draft.avatar_recipe.palette).map((color) => (
            <span key={color} className="color-swatch" style={{ background: color }} />
          ))}
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="corePersonality">核心性格</label>
          <textarea id="corePersonality" value={draftSoul.core_personality} onChange={(event) => onSoulChange("core_personality", event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="catchphrase">口头禅</label>
          <input id="catchphrase" value={draftSoul.catchphrase} onChange={(event) => onSoulChange("catchphrase", event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="verdict">入园判词</label>
          <textarea id="verdict" value={draftVerdict} onChange={(event) => onVerdictChange(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="behaviorRules">会做的行为</label>
          <textarea id="behaviorRules" value={joinLines(draftSoul.behavior_rules)} onChange={(event) => onSoulChange("behavior_rules", splitLines(event.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="sampleLines">可能会说的话</label>
          <textarea id="sampleLines" value={joinLines(draftSoul.sample_lines)} onChange={(event) => onSoulChange("sample_lines", splitLines(event.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="boundaries">社交边界</label>
          <textarea id="boundaries" value={joinLines(draftSoul.social_boundaries)} onChange={(event) => onSoulChange("social_boundaries", splitLines(event.target.value))} />
        </div>
        <div className="task-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={onRegenerate}>
            <RefreshCcw size={18} aria-hidden />
            重生成
          </button>
          <button className="primary-button" type="button" disabled={loading || !draftSoul.core_personality || !draftVerdict} onClick={onSubmit}>
            <Save size={18} aria-hidden />
            确认入园
          </button>
        </div>
      </div>
    </div>
  );
}
