"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { IdentityWorkshop } from "@/components/home/IdentityWorkshop";
import { JokerTicket } from "@/components/home/JokerTicket";
import { SocialTaskPanel } from "@/components/home/SocialTaskPanel";
import { SoulDraftEditor } from "@/components/home/SoulDraftEditor";
import { ClownRevealModal } from "@/components/workshop/ClownRevealModal";
import {
  apiFetch,
  replayUrl,
  type Balloon,
  type FaceDescriptor,
  type HealAction,
  type Joker,
  type JokerDraft,
  type MatchResult,
  type SoulProfile
} from "@/lib/api";
import { saveActiveJoker, selectClownAsset, withClownAsset } from "@/lib/clownAssets";

type Step = "identity" | "task" | "replay";

const mbtiOptions = ["INFP", "INFJ", "INTJ", "INTP", "ENFP", "ENTP", "ENFJ", "ESTP", "ESFP", "ISFJ", "ISTJ", "ISFP"];
const constellationOptions = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"];

export function WorkshopApp() {
  const [step, setStep] = useState<Step>("identity");
  const [nickname, setNickname] = useState("");
  const [mbti, setMbti] = useState("INFP");
  const [constellation, setConstellation] = useState("双鱼座");
  const [socialEnergy, setSocialEnergy] = useState<"I" | "E">("I");
  const [soulSeed, setSoulSeed] = useState("");
  const [faceDescriptor, setFaceDescriptor] = useState<FaceDescriptor | null>(null);
  const [consentMedia, setConsentMedia] = useState(false);
  const [draft, setDraft] = useState<JokerDraft | null>(null);
  const [draftSoul, setDraftSoul] = useState<SoulProfile | null>(null);
  const [draftVerdict, setDraftVerdict] = useState("");
  const [joker, setJoker] = useState<Joker | null>(null);
  const [balloonText, setBalloonText] = useState("");
  const [balloon, setBalloon] = useState<Balloon | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [cheerText, setCheerText] = useState("");
  const [action, setAction] = useState<HealAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showClownReveal, setShowClownReveal] = useState(false);

  const qrValue = useMemo(() => (joker ? replayUrl(joker.qr_token) : ""), [joker]);
  const faceQuality = faceDescriptor?.capture_quality ?? "fallback";

  function updateSoul<K extends keyof SoulProfile>(field: K, value: SoulProfile[K]) {
    setDraftSoul((current) => (current ? { ...current, [field]: value } : current));
  }

  async function generateDraft(event?: FormEvent) {
    event?.preventDefault();
    if (!soulSeed.trim()) {
      setError("先给小丑一点灵魂材料。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await apiFetch<JokerDraft>("/api/joker-drafts", {
        method: "POST",
        body: JSON.stringify({
          mbti,
          constellation,
          social_energy: socialEnergy,
          soul_seed: soulSeed,
          face_descriptor: faceDescriptor
        })
      });
      setDraft(created);
      setDraftSoul(created.soul_profile);
      setDraftVerdict(created.verdict);
      setJoker(null);
      setShowDraftModal(true);
      setShowClownReveal(false);
      setStep("identity");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成灵魂草案失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateClown() {
    if (!draft || !draftSoul) return;
    setLoading(true);
    setError(null);
    try {
      const selectedAsset = selectClownAsset({
        socialEnergy,
        nickname,
        mbti,
        constellation,
        soulSeed,
        draftSoul,
        faceDescriptor
      });
      const avatarRecipe = withClownAsset(draft.avatar_recipe, selectedAsset);
      const created = await apiFetch<Joker>("/api/jokers", {
        method: "POST",
        body: JSON.stringify({
          nickname: nickname || undefined,
          mbti,
          constellation,
          social_energy: socialEnergy,
          consent_media: consentMedia,
          soul_seed: soulSeed,
          face_descriptor: faceDescriptor,
          soul_profile: draftSoul,
          avatar_recipe: avatarRecipe,
          style_tokens: draft.style_tokens,
          verdict: draftVerdict
        })
      });
      setJoker(created);
      saveActiveJoker(created);
      setShowDraftModal(false);
      setShowClownReveal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建小丑失败");
    } finally {
      setLoading(false);
    }
  }

  function enterParkAfterReveal() {
    setShowClownReveal(false);
    setStep("task");
  }

  async function submitBalloon() {
    if (!joker) return;
    setLoading(true);
    setError(null);
    try {
      const created = await apiFetch<Balloon>("/api/balloons", {
        method: "POST",
        body: JSON.stringify({ emo_text: balloonText })
      });
      setBalloon(created);
      setStep("replay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "气球寄存失败");
    } finally {
      setLoading(false);
    }
  }

  async function findMatch(actionType: "hug" | "pet" | "dance" | "cheer") {
    if (!joker) return;
    setLoading(true);
    setError(null);
    try {
      const found = await apiFetch<MatchResult>("/api/heal/match", {
        method: "POST",
        body: JSON.stringify({ action_type: actionType })
      });
      setMatch(found);
      setCheerText(actionType === "hug" ? "抱一下，坏运气直接掉线。" : "摸摸头，今天先把电量充到 61%。");
    } catch {
      setError("现在还没有可接力气球，可以先让其他小丑投放一颗。");
    } finally {
      setLoading(false);
    }
  }

  async function submitHealAction() {
    if (!joker || !match) return;
    setLoading(true);
    setError(null);
    try {
      const created = await apiFetch<HealAction>("/api/heal/actions", {
        method: "POST",
        body: JSON.stringify({
          balloon_id: match.balloon_id,
          action_type: match.suggested_action,
          cheer_text: cheerText
        })
      });
      setAction(created);
      setStep("replay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交治愈动作失败");
    } finally {
      setLoading(false);
    }
  }

  async function createAvatarJob() {
    if (!joker) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/avatar-jobs", {
        method: "POST",
        body: JSON.stringify({
          joker_id: joker.id,
          input_descriptor: faceDescriptor,
          avatar_recipe: joker.avatar_recipe
        })
      });
      setError("已创建 Q 版形象任务；当前使用本地 2D 像素小丑素材渲染。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建形象任务失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <HomeTopBar joker={joker} faceQuality={faceQuality} />

      <div className="workshop-layout">
        <section className="flow-panel" aria-label="体验流程">
          {step === "identity" ? (
            <IdentityWorkshop
              nickname={nickname}
              mbti={mbti}
              constellation={constellation}
              socialEnergy={socialEnergy}
              soulSeed={soulSeed}
              faceDescriptor={faceDescriptor}
              consentMedia={consentMedia}
              loading={loading}
              mbtiOptions={mbtiOptions}
              constellationOptions={constellationOptions}
              onNicknameChange={setNickname}
              onMbtiChange={setMbti}
              onConstellationChange={setConstellation}
              onSocialEnergyChange={setSocialEnergy}
              onSoulSeedChange={setSoulSeed}
              onFaceDescriptorChange={setFaceDescriptor}
              onConsentMediaChange={setConsentMedia}
              onGenerateDraft={(event) => void generateDraft(event)}
            />
          ) : null}

          {joker ? <JokerTicket joker={joker} qrValue={qrValue} onCreateAvatarJob={() => void createAvatarJob()} /> : null}

          {step !== "identity" && joker ? (
            <SocialTaskPanel
              joker={joker}
              loading={loading}
              balloonText={balloonText}
              balloon={balloon}
              match={match}
              cheerText={cheerText}
              action={action}
              onBalloonTextChange={setBalloonText}
              onCheerTextChange={setCheerText}
              onSubmitBalloon={() => void submitBalloon()}
              onFindMatch={(actionType) => void findMatch(actionType)}
              onSubmitHealAction={() => void submitHealAction()}
            />
          ) : null}

          {step === "replay" && joker ? (
            <div className="task-panel">
              <span className="pixel-kicker">REPLAY</span>
              <h3>私密回放码</h3>
              <p className="helper">离开展台后扫码，先查看别人给这只小丑的气球回应，再进入小丑乐园继续投放气球。</p>
              <a className="secondary-button" href={`/replay/${joker.qr_token}`}>打开回放页</a>
            </div>
          ) : null}

          {error ? <p className={error.includes("已创建") ? "helper info-box" : "error"}>{error}</p> : null}
        </section>

        <aside className="workshop-sidequest" aria-label="功能模块跳转">
          <div className="section-title">
            <div>
              <span className="pixel-kicker">NEXT STOPS</span>
              <h2>生成后去哪里玩</h2>
              <p>工坊负责把你的脸谱和灵魂做成小丑，地图、直播、回放都拆成独立关卡。</p>
            </div>
          </div>
          <div className="module-sign-list">
            <a className="module-sign module-sign--map" href="/map">
              <span>校园地图</span>
              <strong>缩放探索西政两江校区</strong>
            </a>
            <a className="module-sign module-sign--park" href="/park">
              <span>乐园直播</span>
              <strong>看小丑替你实时游园</strong>
            </a>
            <a className="module-sign module-sign--replay" href={joker ? `/replay/${joker.qr_token}` : "/replay/demo"}>
              <span>回放入口</span>
              <strong>{joker ? "查看你的专属行为回放" : "创建小丑后生成专属回放"}</strong>
            </a>
          </div>
        </aside>
      </div>

      {draft && draftSoul && showDraftModal ? (
        <div className="draft-confirm" role="dialog" aria-modal="true" aria-labelledby="draftConfirmTitle">
          <div className="draft-confirm__card">
            <SoulDraftEditor
              draft={draft}
              draftSoul={draftSoul}
              draftVerdict={draftVerdict}
              loading={loading}
              titleId="draftConfirmTitle"
              onSoulChange={updateSoul}
              onVerdictChange={setDraftVerdict}
              onRegenerate={() => void generateDraft()}
              onSubmit={() => void generateClown()}
            />
          </div>
        </div>
      ) : null}

      {joker && showClownReveal ? <ClownRevealModal joker={joker} onEnterPark={enterParkAfterReveal} /> : null}
    </main>
  );
}
