import { Clock, Share2, Sparkles } from "lucide-react";
import { ParkExperiencePanel } from "@/components/home/ParkExperiencePanel";
import { PixelAvatarBadge } from "@/components/pixel/PixelAvatarBadge";
import { QRCodeBox } from "@/components/QRCodeBox";
import { API_BASE, type Replay } from "@/lib/api";

async function loadReplay(token: string): Promise<Replay | null> {
  try {
    const response = await fetch(`${API_BASE}/api/replay/${token}`, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default async function ReplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const replay = await loadReplay(token);

  if (!replay) {
    return (
      <main className="replay-shell">
        <section className="replay-panel">
          <h1>这张小丑票根暂时失效</h1>
          <p className="helper">请回到展台重新生成小丑，或者确认 API 服务已经启动。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="replay-shell">
      <div className="replay-layout">
        <section className="replay-panel">
          <div className="section-title">
            <div>
              <h1>{replay.headline}</h1>
              <p>{replay.share_text}</p>
            </div>
            <Sparkles color="var(--color-lemon)" aria-hidden />
          </div>
          <div className="joker-card">
            <div className="joker-card__body">
              <PixelAvatarBadge joker={replay.joker} label="回放小丑" />
              <div>
                <h2>{replay.joker.nickname || replay.joker.id}</h2>
                <p className="verdict">{replay.joker.verdict}</p>
                <p className="helper">{replay.joker.mbti} / {replay.joker.constellation} / {replay.joker.social_energy} 人小丑</p>
              </div>
            </div>
          </div>
          <div className="task-panel">
            <h3>气球结果</h3>
            {replay.balloons.length === 0 ? <p className="helper">这只小丑还没寄存气球。</p> : null}
            {replay.balloons.map((balloon) => (
              <div className="event-row" key={balloon.id}>
                <strong>{balloon.status === "healed" ? "已被捏爆治愈" : "仍在漂浮"}</strong>
                <span>{balloon.safe_summary}</span>
              </div>
            ))}
          </div>
          <div className="task-panel">
            <h3>动作记录</h3>
            {replay.actions.length === 0 ? <p className="helper">暂时还没有治愈动作。</p> : null}
            {replay.actions.map((action) => (
              <div className="event-row" key={action.id}>
                <strong>{action.action_type} · 匹配分 {Math.round(action.match_score * 100)}</strong>
                <span>{action.cheer_text}</span>
                <span className="event-meta">{action.match_reason}</span>
              </div>
            ))}
          </div>
          <div className="task-actions">
            <span className="status-pill">
              <Clock size={16} aria-hidden />
              deterministic replay
            </span>
            <span className="status-pill">
              <Share2 size={16} aria-hidden />
              图文分享卡已适配
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <QRCodeBox value={`/replay/${token}`} />
          </div>
        </section>
        <ParkExperiencePanel joker={replay.joker} events={replay.events} />
      </div>
    </main>
  );
}
