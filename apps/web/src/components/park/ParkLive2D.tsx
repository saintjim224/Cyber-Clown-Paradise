"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import { Activity, CheckCircle, Clock, History, MapPin, Radio, Reply, Send, Sparkles, UserPlus, Users } from "lucide-react";
import { useLiveSocialEvents } from "@/hooks/useLiveSocialEvents";
import {
  eventStatusText,
  eventTypeText,
  liangjiangCampus,
  liangjiangPois,
  poiTypeText,
  type DemoClown,
  type LiangjiangPoi,
  type LngLatTuple,
  type SocialEvent
} from "@/lib/socialMapData";

type Selection =
  | { kind: "event"; id: string }
  | { kind: "clown"; id: string }
  | { kind: "poi"; id: string };

type ProjectedPoint = {
  x: number;
  y: number;
};

type PositionStyle = CSSProperties & {
  "--x": string;
  "--y": string;
  "--clown-main"?: string;
  "--clown-accent"?: string;
};

const statusOrder: SocialEvent["status"][] = ["live", "waiting", "done", "replay"];
const moodOptions = ["想打招呼", "有点紧张", "求陪走", "分享快乐"];

const statusIcons = {
  live: Radio,
  waiting: Clock,
  done: CheckCircle,
  replay: History
};

function getEventPath(event: SocialEvent, clowns: DemoClown[]): LngLatTuple[] {
  const from = clowns.find((clown) => clown.id === event.from);
  const to = event.to ? clowns.find((clown) => clown.id === event.to) : null;
  const poi = event.poiId ? liangjiangPois.find((item) => item.id === event.poiId) : null;

  if (event.path && event.path.length > 0) return event.path;
  if (from && to) return [from.position, to.position];
  if (from && poi) return [from.position, poi.position];
  if (from) return [from.position];
  if (poi) return [poi.position];
  return [liangjiangCampus.center];
}

function getEventPosition(event: SocialEvent, clowns: DemoClown[]) {
  const path = getEventPath(event, clowns);
  return path[Math.floor(path.length / 2)] ?? path[0] ?? liangjiangCampus.center;
}

function makeBounds(points: LngLatTuple[]) {
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngPad = Math.max((maxLng - minLng) * 0.12, 0.00016);
  const latPad = Math.max((maxLat - minLat) * 0.12, 0.00016);

  return {
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
    minLat: minLat - latPad,
    maxLat: maxLat + latPad
  };
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isRecent(event: SocialEvent) {
  const timestamp = new Date(event.createdAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp < 90_000;
}

export function ParkLive2D() {
  const { clowns, events, activeEvent, joinPark, joinWave, dropBalloon, replyToEvent, replyWaitingBalloons, focusEvent } = useLiveSocialEvents();
  const [selected, setSelected] = useState<Selection>({ kind: "event", id: activeEvent?.id ?? events[0]?.id ?? "" });
  const [activeModule, setActiveModule] = useState<SocialEvent["status"]>("live");
  const [balloonText, setBalloonText] = useState("");
  const [mood, setMood] = useState(moodOptions[0]);

  const bounds = useMemo(() => {
    const points = [
      ...liangjiangPois.map((poi) => poi.position),
      ...clowns.map((clown) => clown.position),
      ...events.flatMap((event) => getEventPath(event, clowns))
    ];
    return makeBounds(points.length > 0 ? points : [liangjiangCampus.center]);
  }, [clowns, events]);

  const project = (position: LngLatTuple): ProjectedPoint => {
    const x = ((position[0] - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 0.000001)) * 100;
    const y = (1 - (position[1] - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.000001)) * 100;
    return {
      x: Math.max(3, Math.min(97, x)),
      y: Math.max(3, Math.min(97, y))
    };
  };

  const focusedEvent = selected.kind === "event" ? events.find((event) => event.id === selected.id) ?? activeEvent : activeEvent;
  const focusedClown = selected.kind === "clown" ? clowns.find((clown) => clown.id === selected.id) ?? null : null;
  const focusedPoi = selected.kind === "poi" ? liangjiangPois.find((poi) => poi.id === selected.id) ?? null : null;
  const waitingEvent = events.find((event) => event.status === "waiting");
  const visibleEvents = events.slice(-14);
  const bucketEvents = events.filter((event) => event.status === activeModule).slice(-6).reverse();
  const waitingEvents = events.filter((event) => event.status === "waiting").slice(-5).reverse();
  const replayEvents = events.filter((event) => event.status === "replay").slice(-4).reverse();
  const latestEvents = events.slice(-4).reverse();
  const waitingCount = events.filter((event) => event.status === "waiting").length;
  const recentCount = Math.max(events.filter(isRecent).length, events.slice(-5).filter((event) => event.status === "live").length);
  const relayCount = events.filter((event) => event.to || event.status === "done" || event.status === "replay").length;

  function selectEvent(event: SocialEvent) {
    setSelected({ kind: "event", id: event.id });
    setActiveModule(event.status);
    focusEvent(event.id);
  }

  function handleJoin() {
    const clown = joinPark();
    setSelected({ kind: "clown", id: clown.id });
  }

  function handleJoinWave() {
    const joined = joinWave(12);
    const first = joined[0];
    if (first) setSelected({ kind: "clown", id: first.id });
  }

  function handleDropBalloon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = dropBalloon({
      text: balloonText,
      mood
    });
    setBalloonText("");
    setActiveModule("waiting");
    setSelected({ kind: "event", id: created.id });
  }

  function handleReply(eventId: string) {
    replyToEvent(eventId);
    setActiveModule("done");
    setSelected({ kind: "event", id: eventId });
  }

  function handleReplyWave() {
    replyWaitingBalloons();
    setActiveModule("done");
  }

  function styleForPosition(position: LngLatTuple, clown?: DemoClown): PositionStyle {
    const point = project(position);
    return {
      "--x": `${point.x}%`,
      "--y": `${point.y}%`,
      "--clown-main": clown?.color,
      "--clown-accent": clown?.accent
    };
  }

  function polylinePoints(event: SocialEvent) {
    return getEventPath(event, clowns)
      .map(project)
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
  }

  function eventIsFocused(event: SocialEvent) {
    return focusedEvent?.id === event.id || selected.kind === "event" && selected.id === event.id;
  }

  function clownIsFocused(clown: DemoClown) {
    return (
      selected.kind === "clown" && selected.id === clown.id ||
      focusedEvent?.from === clown.id ||
      focusedEvent?.to === clown.id
    );
  }

  function poiIsFocused(poi: LiangjiangPoi) {
    return selected.kind === "poi" && selected.id === poi.id || focusedEvent?.poiId === poi.id;
  }

  function clownName(id: string | undefined) {
    if (!id) return "待接力";
    return clowns.find((clown) => clown.id === id)?.name ?? "现场小丑";
  }

  return (
    <section className="park-live2d" aria-label="两江二维实时社交乐园">
      <div className="park-live2d__layout">
        <section className="park-live2d__map-panel" aria-label="实时二维社交地图">
          <div className="park-live2d__header">
            <div>
              <span className="pixel-kicker">LIVE 2D PARK</span>
              <h1>两江小丑实时游园</h1>
              <p>同一份两江校区数据驱动小丑、地点、气球和回放。现场看到的是大家的小丑正在替自己社交。</p>
            </div>
            <span className="park-live2d__signal">
              <Activity size={16} aria-hidden />
              tick 运行中
            </span>
          </div>

          <div className="park-heat-grid" aria-label="现场热度">
            <div>
              <strong>{clowns.length}</strong>
              <span>当前小丑</span>
            </div>
            <div>
              <strong>{waitingCount}</strong>
              <span>等待气球</span>
            </div>
            <div>
              <strong>{recentCount}</strong>
              <span>刚刚发生</span>
            </div>
            <div>
              <strong>{relayCount}</strong>
              <span>接力次数</span>
            </div>
          </div>

          <div className="park-direction-strip" aria-label="当前产品方向">
            <div>
              <span>确认方向</span>
              <strong>现场多人小丑替身社交</strong>
            </div>
            <p>不是静态地图，也不是 3D 形象秀。核心是让 I 人投放气球，让 E 人和其他小丑接力回应，现场持续产生可回放事件。</p>
          </div>

          <div className="park-map2d" aria-label="两江校区二维 overlay">
            <div className="park-map2d__skyline" aria-hidden />
            <svg className="park-map2d__paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {visibleEvents.map((event) => (
                <polyline
                  key={event.id}
                  points={polylinePoints(event)}
                  data-active={eventIsFocused(event)}
                  data-status={event.status}
                />
              ))}
            </svg>

            {liangjiangPois.map((poi) => (
              <button
                key={poi.id}
                type="button"
                className={`park-poi-pin park-poi-pin--${poi.type}`}
                data-active={poiIsFocused(poi)}
                style={styleForPosition(poi.position)}
                onClick={() => setSelected({ kind: "poi", id: poi.id })}
              >
                <MapPin size={14} aria-hidden />
                <span>{poi.label}</span>
              </button>
            ))}

            {visibleEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className="park-event-bubble2d"
                data-active={eventIsFocused(event)}
                data-status={event.status}
                style={styleForPosition(getEventPosition(event, clowns))}
                onClick={() => selectEvent(event)}
              >
                <strong>{event.title}</strong>
                <span>{eventTypeText[event.type]}</span>
              </button>
            ))}

            {clowns.map((clown) => (
              <button
                key={clown.id}
                type="button"
                className="park-clown-token"
                data-active={clownIsFocused(clown)}
                style={styleForPosition(clown.position, clown)}
                onClick={() => setSelected({ kind: "clown", id: clown.id })}
              >
                {clown.image ? (
                  <img src={clown.image} alt="" />
                ) : (
                  <span className="park-clown-sprite" aria-hidden>
                    <i className="park-clown-sprite__hat" />
                    <i className="park-clown-sprite__head" />
                    <i className="park-clown-sprite__body" />
                  </span>
                )}
                <span className="park-clown-token__name">{clown.name}</span>
              </button>
            ))}

            <div className="park-map2d__focus" aria-live="polite">
              <strong>{focusedEvent?.title ?? "等待第一场互动"}</strong>
              <span>{focusedEvent?.summary ?? "加入游园或投放情绪气球后，这里会同步高亮。"}</span>
            </div>
          </div>
        </section>

        <aside className="park-live2d__side" aria-label="游园互动控制台">
          <section className="pixel-panel park-command-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">JOIN</span>
                <h2>多人互动</h2>
              </div>
            </div>

            <button type="button" className="primary-button" onClick={handleJoin}>
              <UserPlus size={17} aria-hidden />
              加入游园
            </button>
            <button type="button" className="secondary-button park-wave-button" onClick={handleJoinWave}>
              <Users size={17} aria-hidden />
              模拟 12 人入园
            </button>

            <form className="park-balloon-form" onSubmit={handleDropBalloon}>
              <label className="field">
                <span>情绪气球</span>
                <select value={mood} onChange={(event) => setMood(event.target.value)}>
                  {moodOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>短句</span>
                <input
                  value={balloonText}
                  maxLength={32}
                  onChange={(event) => setBalloonText(event.target.value)}
                  placeholder="今天想轻轻打个招呼"
                />
              </label>
              <button type="submit" className="secondary-button">
                <Send size={16} aria-hidden />
                投放气球
              </button>
            </form>

            <button type="button" className="park-reply-button" disabled={!waitingEvent} onClick={() => waitingEvent && handleReply(waitingEvent.id)}>
              <Reply size={16} aria-hidden />
              {waitingEvent ? "接住一个气球" : "暂无等待气球"}
            </button>
            <button type="button" className="park-reply-button park-reply-button--batch" disabled={waitingCount === 0} onClick={handleReplyWave}>
              <Sparkles size={16} aria-hidden />
              {waitingCount > 0 ? "接力全部等待" : "等待气球为 0"}
            </button>
          </section>

          <section className="pixel-panel park-event-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">EVENTS</span>
                <h2>实时事件</h2>
              </div>
            </div>

            <div className="park-status-tabs" role="tablist" aria-label="事件状态模块">
              {statusOrder.map((status) => {
                const Icon = statusIcons[status];
                return (
                  <button
                    key={status}
                    type="button"
                    data-active={activeModule === status}
                    onClick={() => setActiveModule(status)}
                  >
                    <Icon size={16} aria-hidden />
                    <strong>{events.filter((event) => event.status === status).length}</strong>
                    <span>{eventStatusText[status]}</span>
                  </button>
                );
              })}
            </div>

            <div className="park-event-list2d">
              {bucketEvents.length === 0 ? (
                <div className="park-event-empty">这个模块暂时空着，等下一次 tick。</div>
              ) : (
                bucketEvents.map((event) => (
                  <div key={event.id} className="park-event-row2d" data-active={eventIsFocused(event)}>
                    <button type="button" className="park-event-row2d__main" onClick={() => selectEvent(event)}>
                      <span>{timeLabel(event.createdAt)} · {eventTypeText[event.type]}</span>
                      <strong>{event.title}</strong>
                      <small>{event.summary}</small>
                    </button>
                    {event.status === "waiting" ? (
                      <button type="button" className="park-event-row2d__reply" onClick={() => handleReply(event.id)}>
                        接住
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="pixel-panel park-pool-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">POOL</span>
                <h2>气球池</h2>
              </div>
            </div>

            <div className="park-mini-list">
              {waitingEvents.length === 0 ? (
                <div className="park-event-empty">暂无等待气球，现场 tick 会继续生成互动。</div>
              ) : (
                waitingEvents.map((event) => (
                  <button key={event.id} type="button" data-active={focusedEvent?.id === event.id} onClick={() => selectEvent(event)}>
                    <strong>{event.title}</strong>
                    <span>{clownName(event.from)} 发出，等待接力</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="pixel-panel park-replay-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">REPLAY</span>
                <h2>回放墙</h2>
              </div>
            </div>

            <div className="park-mini-list">
              {replayEvents.length === 0 ? (
                <div className="park-event-empty">接力完成后会自动生成回放。</div>
              ) : (
                replayEvents.map((event) => (
                  <button key={event.id} type="button" data-active={focusedEvent?.id === event.id} onClick={() => selectEvent(event)}>
                    <strong>{event.title}</strong>
                    <span>{clownName(event.from)} → {clownName(event.to)}</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="pixel-panel park-focus-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">FOCUS</span>
                <h2>当前高亮</h2>
              </div>
            </div>

            {focusedClown ? (
              <div className="park-focus-card" style={{ "--clown-main": focusedClown.color, "--clown-accent": focusedClown.accent } as CSSProperties}>
                <span>{focusedClown.energy} · {focusedClown.role}</span>
                <strong>{focusedClown.name}</strong>
                <p>{focusedClown.line}</p>
              </div>
            ) : null}

            {focusedPoi ? (
              <div className="park-focus-card">
                <span>{poiTypeText[focusedPoi.type]}</span>
                <strong>{focusedPoi.label}</strong>
                <p>{focusedPoi.note}</p>
              </div>
            ) : null}

            {!focusedClown && !focusedPoi && focusedEvent ? (
              <div className="park-focus-card">
                <span>{eventStatusText[focusedEvent.status]} · {eventTypeText[focusedEvent.type]}</span>
                <strong>{focusedEvent.title}</strong>
                <p>{focusedEvent.summary}</p>
              </div>
            ) : null}

            <div className="park-latest-ticker" aria-label="最新现场事件">
              {latestEvents.map((event) => (
                <button key={event.id} type="button" data-active={focusedEvent?.id === event.id} onClick={() => selectEvent(event)}>
                  <span>{timeLabel(event.createdAt)}</span>
                  <strong>{event.title}</strong>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
