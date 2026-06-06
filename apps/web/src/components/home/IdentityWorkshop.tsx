"use client";

import type { FormEvent } from "react";
import { Sparkles, WandSparkles } from "lucide-react";
import { CameraBooth } from "@/components/CameraBooth";
import type { FaceDescriptor } from "@/lib/api";

type IdentityWorkshopProps = {
  nickname: string;
  mbti: string;
  constellation: string;
  socialEnergy: "I" | "E";
  soulSeed: string;
  faceDescriptor: FaceDescriptor | null;
  consentMedia: boolean;
  loading: boolean;
  mbtiOptions: string[];
  constellationOptions: string[];
  onNicknameChange: (value: string) => void;
  onMbtiChange: (value: string) => void;
  onConstellationChange: (value: string) => void;
  onSocialEnergyChange: (value: "I" | "E") => void;
  onSoulSeedChange: (value: string) => void;
  onFaceDescriptorChange: (descriptor: FaceDescriptor) => void;
  onConsentMediaChange: (value: boolean) => void;
  onGenerateDraft: (event?: FormEvent) => void;
};

export function IdentityWorkshop({
  nickname,
  mbti,
  constellation,
  socialEnergy,
  soulSeed,
  faceDescriptor,
  consentMedia,
  loading,
  mbtiOptions,
  constellationOptions,
  onNicknameChange,
  onMbtiChange,
  onConstellationChange,
  onSocialEnergyChange,
  onSoulSeedChange,
  onFaceDescriptorChange,
  onConsentMediaChange,
  onGenerateDraft
}: IdentityWorkshopProps) {
  return (
    <>
      <div className="section-title">
        <div>
          <span className="pixel-kicker">STEP 01</span>
          <h2>灵魂工坊</h2>
          <p>输入你的性格材料，小丑会长出自己的说话方式和社交边界。</p>
        </div>
        <Sparkles color="var(--color-coin)" aria-hidden />
      </div>
      <form className="form-grid" onSubmit={onGenerateDraft}>
        <div className="field">
          <label htmlFor="nickname">昵称</label>
          <input id="nickname" value={nickname} onChange={(event) => onNicknameChange(event.target.value)} placeholder="比如：凌晨补丁人" />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="mbti">MBTI</label>
            <select id="mbti" value={mbti} onChange={(event) => onMbtiChange(event.target.value)}>
              {mbtiOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="constellation">星座</label>
            <select id="constellation" value={constellation} onChange={(event) => onConstellationChange(event.target.value)}>
              {constellationOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>社交电量</label>
          <div className="segmented" role="group" aria-label="选择 I 人或 E 人">
            <button type="button" data-active={socialEnergy === "I"} onClick={() => onSocialEnergyChange("I")}>I 人寄存</button>
            <button type="button" data-active={socialEnergy === "E"} onClick={() => onSocialEnergyChange("E")}>E 人突袭</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="soulSeed">灵魂材料</label>
          <textarea
            id="soulSeed"
            value={soulSeed}
            onChange={(event) => onSoulSeedChange(event.target.value)}
            placeholder="比如：慢热、嘴硬心软、怕尴尬但爱讲冷笑话；不喜欢被逼着热场。"
          />
        </div>
        <CameraBooth descriptor={faceDescriptor} onDescriptor={onFaceDescriptorChange} />
        <label className="helper privacy-line">
          <input type="checkbox" checked={consentMedia} onChange={(event) => onConsentMediaChange(event.target.checked)} />
          同意保存我确认后的小丑形象资产，不保存原始自拍或视频。
        </label>
        <button className="primary-button" disabled={loading || soulSeed.trim().length < 4} type="submit">
          <WandSparkles size={18} aria-hidden />
          {loading ? "生成中" : "生成灵魂草案"}
        </button>
      </form>
    </>
  );
}
