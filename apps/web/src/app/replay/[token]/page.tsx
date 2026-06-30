import { Clock, Share2, Sparkles } from "lucide-react";
import { RelationshipChatButton } from "@/components/chat/RelationshipChatButton";
import { ParkExperiencePanel } from "@/components/home/ParkExperiencePanel";
import { PixelAvatarBadge } from "@/components/pixel/PixelAvatarBadge";
import { QRCodeBox } from "@/components/QRCodeBox";
import { API_BASE, type Replay } from "@/lib/api";

const actionText: Record<string, string> = {
  hug: "拥抱",
  pet: "摸头",
  cheer: "加油",
  dance: "转运舞"
};

const replyTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai"
});

function jokerName(joker: { id: string; nickname: string | null }) {
  return joker.nickname || joker.id;
}

function replyTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return replyTimeFormatter.format(date);
}

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
                <p className="helper">{replay.joker.mbti} / {replay.joker.constellation} / {replay.joker.social_energy} 人小丑 · 能量 {replay.energy_score}</p>
              </div>
            </div>
          </div>
          <div className="task-panel replay-inbox-panel">
            <h3>给我的气球回应</h3>
            {replay.received_replies.length === 0 ? <p className="helper">还没有人接住这只小丑放出的气球。</p> : null}
            {replay.received_replies.map((reply) => (
              <div className="event-row replay-reply-row" key={reply.id}>
                <strong>{jokerName(reply.responder)} 用{actionText[reply.action_type] ?? reply.action_type}回应了你</strong>
                <span>“{reply.cheer_text}”</span>
                <span className="event-meta">气球：{reply.balloon_summary}</span>
                <span className="event-meta">主人能量 +{reply.energy_delta_owner} · 亲密度 +{reply.affinity_delta} · {replyTime(reply.created_at)}</span>
              </div>
            ))}
          </div>
          <div className="task-panel">
            <h3>我送出的回应</h3>
            {replay.sent_replies.length === 0 ? <p className="helper">这只小丑暂时还没有接住别人的气球。</p> : null}
            {replay.sent_replies.map((reply) => (
              <div className="event-row" key={reply.id}>
                <strong>送给 {jokerName(reply.recipient)} · {actionText[reply.action_type] ?? reply.action_type}</strong>
                <span>{reply.cheer_text}</span>
                <span className="event-meta">回应者能量 +{reply.energy_delta_healer} · {replyTime(reply.created_at)}</span>
              </div>
            ))}
          </div>
          <div className="task-panel">
            <h3>亲密度关系</h3>
            {replay.relationships.length === 0 ? <p className="helper">还没有形成稳定的接力关系。</p> : null}
            {replay.relationships.map((relationship) => (
              <div className="event-row" key={relationship.joker.id}>
                <div className="replay-relationship-row">
                  <strong>{jokerName(relationship.joker)} · 亲密度 {relationship.affinity_score}</strong>
                  <RelationshipChatButton replayJoker={replay.joker} peer={relationship.joker} unlocked={relationship.chat_unlocked} />
                </div>
                <span>{relationship.interaction_count} 次气球回应接力</span>
              </div>
            ))}
          </div>
          <div className="task-panel">
            <h3>公共足迹</h3>
            {replay.public_footprints.length === 0 ? <p className="helper">这只小丑还没有在公共聊天池留下发言。</p> : null}
            {replay.public_footprints.map((footprint) => (
              <div className="event-row" key={footprint.id}>
                <strong>{footprint.location_label}</strong>
                <span>{footprint.content_safe || ""}</span>
                <span className="event-meta">{replyTime(footprint.created_at)}</span>
              </div>
            ))}
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
            <a className="primary-button" href={`/park/join/${token}`}>
              进入小丑乐园
            </a>
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
