"use client";

import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CheckCircle, Clock, History, MapPin, Radio, Reply, RotateCcw, Send, Sparkles, UserPlus, Users, X, ZoomIn, ZoomOut } from "lucide-react";
import { ClownSprite } from "@/components/pixel/ClownSprite";
import { useLiveSocialEvents } from "@/hooks/useLiveSocialEvents";
import { loadActiveJoker, saveActiveJoker } from "@/lib/clownAssets";
import { apiFetch, type Balloon, type HealAction, type Joker, type MatchResult } from "@/lib/api";
import {
  eventStatusText,
  eventTypeText,
  liangjiangMapImage,
  liangjiangPois,
  poiTypeText,
  type DemoClown,
  type ImagePointTuple,
  type LiangjiangPoi,
  type SocialEvent
} from "@/lib/socialMapData";

type Selection =
  | { kind: "event"; id: string }
  | { kind: "clown"; id: string }
  | { kind: "poi"; id: string };

type PositionStyle = CSSProperties & {
  "--x": string;
  "--y": string;
  "--clown-main"?: string;
  "--clown-accent"?: string;
};

type MapView = {
  scale: number;
  x: number;
  y: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ReplyActionType = "hug" | "pet" | "cheer" | "dance";

type ReplyDraft = {
  eventId: string;
  match: MatchResult;
  actionType: ReplyActionType;
  cheerText: string;
};

const statusOrder: SocialEvent["status"][] = ["live", "waiting", "done", "replay"];
const moodOptions = ["想打招呼", "有点紧张", "求陪走", "分享快乐"];
const replyActionCards: Array<{ type: ReplyActionType; label: string; description: string; defaultText: string }> = [
  {
    type: "cheer",
    label: "加油",
    description: "给对方一小段明亮的补给。",
    defaultText: "接住了，这颗气球有人认真回应。"
  },
  {
    type: "hug",
    label: "拥抱",
    description: "适合低电量和需要被接住的瞬间。",
    defaultText: "抱一下，坏运气先原地掉线。"
  },
  {
    type: "pet",
    label: "摸头",
    description: "轻轻安抚，不催促对方立刻变好。",
    defaultText: "摸摸头，今天先把电量充到 61%。"
  },
  {
    type: "dance",
    label: "转运舞",
    description: "用一点荒诞把气氛转起来。",
    defaultText: "原地转两圈，坏心情自动退场。"
  }
];

const statusIcons = {
  live: Radio,
  waiting: Clock,
  done: CheckCircle,
  replay: History
};

const minMapScale = 1;
const maxMapScale = 3.25;
const mapZoomStep = 0.28;
const initialMapView: MapView = { scale: 1, x: 0, y: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getEventPoi(event: SocialEvent): LiangjiangPoi | null {
  return event.poiId ? liangjiangPois.find((item) => item.id === event.poiId) ?? null : null;
}

function getEventMapPath(event: SocialEvent, clowns: DemoClown[]): ImagePointTuple[] {
  const from = clowns.find((clown) => clown.id === event.from);
  const to = event.to ? clowns.find((clown) => clown.id === event.to) : null;
  const poi = getEventPoi(event);

  if (event.mapPath && event.mapPath.length > 0) return event.mapPath;
  if (from && to) return [from.mapPoint, to.mapPoint];
  if (from && poi) return [from.mapPoint, poi.mapPoint];
  if (from) return [from.mapPoint];
  if (poi) return [poi.mapPoint];
  return [liangjiangPois[0].mapPoint];
}

function getEventMapPosition(event: SocialEvent, clowns: DemoClown[]) {
  const path = getEventMapPath(event, clowns);
  return path[Math.floor(path.length / 2)] ?? path[0] ?? liangjiangPois[0].mapPoint;
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

function normalizeReplyAction(value: string): ReplyActionType {
  return replyActionCards.some((card) => card.type === value) ? value as ReplyActionType : "cheer";
}

function defaultReplyText(actionType: ReplyActionType) {
  return replyActionCards.find((card) => card.type === actionType)?.defaultText ?? replyActionCards[0].defaultText;
}

export function ParkLive2D() {
  const { clowns, events, activeEvent, joinPark, joinWave, dropBalloon, ensureMatchedBalloon, replyToEvent, focusEvent, addJokerToPark } = useLiveSocialEvents();
  const [selected, setSelected] = useState<Selection>({ kind: "event", id: activeEvent?.id ?? events[0]?.id ?? "" });
  const [activeModule, setActiveModule] = useState<SocialEvent["status"]>("live");
  const [balloonText, setBalloonText] = useState("");
  const [mood, setMood] = useState(moodOptions[0]);
  const [activeJoker, setActiveJoker] = useState<Joker | null>(null);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [mapView, setMapView] = useState<MapView>(initialMapView);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const baseMapScale = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return 1;
    return Math.min(viewportSize.width / liangjiangMapImage.width, viewportSize.height / liangjiangMapImage.height);
  }, [viewportSize.height, viewportSize.width]);
  const effectiveMapScale = baseMapScale * mapView.scale;

  const clampMapView = useCallback(
    (view: MapView): MapView => {
      const scale = clamp(view.scale, minMapScale, maxMapScale);
      if (viewportSize.width <= 0 || viewportSize.height <= 0) return { scale, x: 0, y: 0 };

      const scaledWidth = liangjiangMapImage.width * baseMapScale * scale;
      const scaledHeight = liangjiangMapImage.height * baseMapScale * scale;
      const buffer = scale > 1 ? 72 : 0;
      const maxX = Math.max(0, (scaledWidth - viewportSize.width) / 2) + buffer;
      const maxY = Math.max(0, (scaledHeight - viewportSize.height) / 2) + buffer;

      return {
        scale,
        x: clamp(view.x, -maxX, maxX),
        y: clamp(view.y, -maxY, maxY)
      };
    },
    [baseMapScale, viewportSize.height, viewportSize.width]
  );

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewportSize({ width, height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setMapView((current) => {
      const next = clampMapView(current);
      return next.scale === current.scale && next.x === current.x && next.y === current.y ? current : next;
    });
  }, [clampMapView]);

  useEffect(() => {
    let cancelled = false;

    function activateJoker(joker: Joker) {
      setActiveJoker(joker);
      const clown = addJokerToPark(joker);
      setSelected({ kind: "clown", id: clown.id });
    }

    async function loadSessionJoker() {
      try {
        const sessionJoker = await apiFetch<Joker>("/api/jokers/me");
        if (cancelled) return;
        saveActiveJoker(sessionJoker);
        activateJoker(sessionJoker);
      } catch {
        const storedJoker = loadActiveJoker();
        if (!cancelled && storedJoker) activateJoker(storedJoker);
      }
    }

    void loadSessionJoker();

    return () => {
      cancelled = true;
    };
  }, [addJokerToPark]);

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
  const focusedEventPoi = focusedEvent ? getEventPoi(focusedEvent) : null;
  const mapWorldStyle = useMemo(
    () =>
      ({
        width: liangjiangMapImage.width,
        height: liangjiangMapImage.height,
        "--map-overlay-scale": `${1 / Math.sqrt(mapView.scale)}`,
        transform: `translate(-50%, -50%) translate(${mapView.x}px, ${mapView.y}px) scale(${effectiveMapScale})`
      }) as CSSProperties,
    [effectiveMapScale, mapView.scale, mapView.x, mapView.y]
  );

  const centerMapOn = useCallback(
    (point: ImagePointTuple, nextScale = 1.72) => {
      if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
      const scale = clamp(nextScale, minMapScale, maxMapScale);
      const effectiveScale = baseMapScale * scale;
      const nextView = {
        scale,
        x: -(point[0] - liangjiangMapImage.width / 2) * effectiveScale,
        y: -(point[1] - liangjiangMapImage.height / 2) * effectiveScale
      };
      setMapView(clampMapView(nextView));
    },
    [baseMapScale, clampMapView, viewportSize.height, viewportSize.width]
  );

  const zoomMap = useCallback(
    (delta: number) => {
      setMapView((current) =>
        clampMapView({
          ...current,
          scale: current.scale + delta
        })
      );
    },
    [clampMapView]
  );

  const resetMap = useCallback(() => {
    setMapView(initialMapView);
  }, []);

  const handleMapWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const delta = event.deltaY > 0 ? -mapZoomStep : mapZoomStep;
      setMapView((current) => {
        const nextScale = clamp(current.scale + delta, minMapScale, maxMapScale);
        const ratio = nextScale / current.scale;
        const cursorX = event.clientX - rect.left - rect.width / 2 - current.x;
        const cursorY = event.clientY - rect.top - rect.height / 2 - current.y;

        return clampMapView({
          scale: nextScale,
          x: current.x - cursorX * (ratio - 1),
          y: current.y - cursorY * (ratio - 1)
        });
      });
    },
    [clampMapView]
  );

  const handleMapPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, select, textarea, a")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapView.x,
      originY: mapView.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [mapView.x, mapView.y]);

  const handleMapPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setMapView(
        clampMapView({
          scale: mapView.scale,
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY
        })
      );
    },
    [clampMapView, mapView.scale]
  );

  const handleMapPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  function selectEvent(event: SocialEvent) {
    setSelected({ kind: "event", id: event.id });
    setActiveModule(event.status);
    focusEvent(event.id);
    centerMapOn(getEventMapPosition(event, clowns));
  }

  function handleJoin() {
    const clown = joinPark();
    setSelected({ kind: "clown", id: clown.id });
    centerMapOn(clown.mapPoint, 1.82);
  }

  function handleJoinWave() {
    const joined = joinWave(12);
    const first = joined[0];
    if (first) {
      setSelected({ kind: "clown", id: first.id });
      centerMapOn(first.mapPoint, 1.72);
    }
  }

  async function handleDropBalloon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeJoker) {
      setCommandError("先在灵魂工坊生成你的专属小丑，再投放气球。");
      return;
    }
    setCommandLoading(true);
    setCommandError(null);
    try {
      const balloon = await apiFetch<Balloon>("/api/balloons", {
        method: "POST",
        body: JSON.stringify({ emo_text: balloonText || mood })
      });
      const created = dropBalloon({
        text: balloonText,
        mood,
        balloon,
        senderId: activeJoker.id
      });
      setBalloonText("");
      setActiveModule("waiting");
      setSelected({ kind: "event", id: created.id });
      centerMapOn(getEventMapPosition(created, clowns));
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : "投放气球失败");
    } finally {
      setCommandLoading(false);
    }
  }

  async function openReplyComposer(eventId?: string, preferredAction: ReplyActionType = "cheer") {
    if (!activeJoker) {
      setCommandError("先在灵魂工坊生成你的专属小丑，再接住气球。");
      return;
    }
    setCommandLoading(true);
    setCommandError(null);
    try {
      const match = await apiFetch<MatchResult>("/api/heal/match", {
        method: "POST",
        body: JSON.stringify({ action_type: preferredAction })
      });
      const actionType = normalizeReplyAction(match.suggested_action);
      const matchedEvent = ensureMatchedBalloon(match);
      const targetEventId = eventId && eventId === match.balloon_id ? eventId : match.balloon_id;
      setReplyDraft({
        eventId: targetEventId,
        match,
        actionType,
        cheerText: defaultReplyText(actionType)
      });
      setActiveModule("waiting");
      setSelected({ kind: "event", id: targetEventId });
      centerMapOn(getEventMapPosition(matchedEvent, clowns));
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : "接住气球失败");
    } finally {
      setCommandLoading(false);
    }
  }

  async function submitReplyComposer() {
    if (!activeJoker || !replyDraft) return;
    const cheerText = replyDraft.cheerText.trim();
    if (!cheerText) {
      setCommandError("先留一句回应，再把气球送回去。");
      return;
    }
    setCommandLoading(true);
    setCommandError(null);
    try {
      const action = await apiFetch<HealAction>("/api/heal/actions", {
        method: "POST",
        body: JSON.stringify({
          balloon_id: replyDraft.match.balloon_id,
          action_type: replyDraft.actionType,
          cheer_text: cheerText
        })
      });
      const matchedEvent = ensureMatchedBalloon(replyDraft.match);
      replyToEvent({
        eventId: replyDraft.eventId,
        responderId: activeJoker.id,
        match: replyDraft.match,
        action
      });
      const updatedJoker = {
        ...activeJoker,
        energy_score: (activeJoker.energy_score ?? 0) + action.energy_delta_healer
      };
      setActiveJoker(updatedJoker);
      saveActiveJoker(updatedJoker);
      setReplyDraft(null);
      setActiveModule("done");
      setSelected({ kind: "event", id: replyDraft.eventId });
      centerMapOn(getEventMapPosition(matchedEvent, clowns));
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : "提交回应失败");
    } finally {
      setCommandLoading(false);
    }
  }

  function handleReplyWave() {
    void openReplyComposer(waitingEvent?.id);
  }

  function styleForMapPoint(point: ImagePointTuple, clown?: DemoClown): PositionStyle {
    return {
      "--x": `${point[0]}px`,
      "--y": `${point[1]}px`,
      "--clown-main": clown?.color,
      "--clown-accent": clown?.accent
    };
  }

  function polylinePoints(event: SocialEvent) {
    return getEventMapPath(event, clowns)
      .map((point) => `${point[0]},${point[1]}`)
      .join(" ");
  }

  function eventMeta(event: SocialEvent) {
    const poi = getEventPoi(event);
    return `${timeLabel(event.createdAt)} · ${eventTypeText[event.type]} · ${poi?.label ?? "两江校区"}`;
  }

  function selectPoi(poi: LiangjiangPoi) {
    setSelected({ kind: "poi", id: poi.id });
    centerMapOn(poi.mapPoint, 1.78);
  }

  function selectClown(clown: DemoClown) {
    setSelected({ kind: "clown", id: clown.id });
    centerMapOn(clown.mapPoint, 1.82);
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
            <p>不是静态地图，也不是 3D 形象秀。核心是让现场小丑投放气球，由其他小丑接力回应，持续产生可回放事件。</p>
          </div>

          <div
            ref={mapViewportRef}
            className="park-map2d"
            aria-label="两江校区可缩放直播地图"
            onWheel={handleMapWheel}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerEnd}
            onPointerCancel={handleMapPointerEnd}
          >
            <div className="park-map2d__world" style={mapWorldStyle}>
              <img
                className="park-map2d__image"
                src={liangjiangMapImage.src}
                width={liangjiangMapImage.width}
                height={liangjiangMapImage.height}
                alt={liangjiangMapImage.alt}
                draggable={false}
              />

              <svg
                className="park-map2d__paths"
                viewBox={`0 0 ${liangjiangMapImage.width} ${liangjiangMapImage.height}`}
                preserveAspectRatio="none"
                aria-hidden
              >
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
                  style={styleForMapPoint(poi.mapPoint)}
                  onClick={() => selectPoi(poi)}
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
                  style={styleForMapPoint(getEventMapPosition(event, clowns))}
                  onClick={() => selectEvent(event)}
                >
                  <strong>{event.title}</strong>
                  <span>{getEventPoi(event)?.label ?? eventTypeText[event.type]}</span>
                </button>
              ))}

              {clowns.map((clown) => (
                <button
                  key={clown.id}
                  type="button"
                  className="park-clown-token"
                  data-active={clownIsFocused(clown)}
                  style={styleForMapPoint(clown.mapPoint, clown)}
                  onClick={() => selectClown(clown)}
                >
                  {clown.spriteUrl ? (
                    <ClownSprite
                      spriteUrl={clown.spriteUrl}
                      previewUrl={clown.image}
                      frameSize={clown.frameSize}
                      actions={clown.spriteActions}
                      action={clownIsFocused(clown) ? "special" : "idle"}
                      size={52}
                      label={clown.name}
                    />
                  ) : clown.image ? (
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
            </div>

            <div className="park-map2d__tools" aria-label="地图缩放控制" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" aria-label="放大地图" title="放大地图" onClick={() => zoomMap(mapZoomStep)}>
                <ZoomIn size={17} aria-hidden />
              </button>
              <button type="button" aria-label="缩小地图" title="缩小地图" onClick={() => zoomMap(-mapZoomStep)}>
                <ZoomOut size={17} aria-hidden />
              </button>
              <button type="button" aria-label="重置地图视图" title="重置地图视图" onClick={resetMap}>
                <RotateCcw size={17} aria-hidden />
              </button>
            </div>

            <div className="park-map2d__focus" aria-live="polite">
              <small>{focusedEvent ? eventMeta(focusedEvent) : "两江校区"}</small>
              <strong>{focusedEvent?.title ?? "等待第一场互动"}</strong>
              <span>{focusedEvent?.summary ?? "加入游园或投放情绪气球后，这里会同步高亮。"}</span>
              {focusedEventPoi ? <em>{focusedEventPoi.note}</em> : null}
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
              <button type="submit" className="secondary-button" disabled={commandLoading}>
                <Send size={16} aria-hidden />
                {commandLoading ? "处理中" : "投放气球"}
              </button>
            </form>

            <button type="button" className="park-reply-button" disabled={commandLoading} onClick={() => void openReplyComposer(waitingEvent?.id)}>
              <Reply size={16} aria-hidden />
              {waitingEvent ? "接住一个气球" : "匹配一个气球"}
            </button>
            <button type="button" className="park-reply-button park-reply-button--batch" disabled={waitingCount === 0 || commandLoading} onClick={handleReplyWave}>
              <Sparkles size={16} aria-hidden />
              {waitingCount > 0 ? "接力一个等待" : "等待气球为 0"}
            </button>
            {commandError ? <p className="error">{commandError}</p> : null}
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
                      <span>{eventMeta(event)}</span>
                      <strong>{event.title}</strong>
                      <small>{event.summary}</small>
                    </button>
                    {event.status === "waiting" ? (
                      <button type="button" className="park-event-row2d__reply" disabled={commandLoading} onClick={() => void openReplyComposer(event.id)}>
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
                    <span>{clownName(event.from)} 发出，等待在 {getEventPoi(event)?.label ?? "两江校区"} 接力</span>
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
                    <span>{clownName(event.from)} → {clownName(event.to)} · {getEventPoi(event)?.label ?? "两江校区"}</span>
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
                <span>{eventStatusText[focusedEvent.status]} · {eventMeta(focusedEvent)}</span>
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
      {replyDraft ? (
        <div className="park-reply-modal" role="dialog" aria-modal="true" aria-labelledby="parkReplyTitle">
          <div className="park-reply-modal__card">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">BALLOON REPLY</span>
                <h2 id="parkReplyTitle">接住这颗气球</h2>
              </div>
              <button className="icon-button" type="button" title="关闭" onClick={() => setReplyDraft(null)}>
                <X size={17} aria-hidden />
              </button>
            </div>

            <div className="park-reply-modal__target">
              <span>{replyDraft.match.owner.nickname || replyDraft.match.owner.id} 的气球</span>
              <strong>{replyDraft.match.balloon_summary}</strong>
              <small>{replyDraft.match.reason}</small>
            </div>

            <div className="park-reply-actions" role="radiogroup" aria-label="选择回应动作">
              {replyActionCards.map((card) => (
                <button
                  key={card.type}
                  type="button"
                  data-active={replyDraft.actionType === card.type}
                  onClick={() =>
                    setReplyDraft((current) => {
                      if (!current) return current;
                      const previousDefault = defaultReplyText(current.actionType);
                      const nextText = current.cheerText.trim() && current.cheerText !== previousDefault ? current.cheerText : card.defaultText;
                      return { ...current, actionType: card.type, cheerText: nextText };
                    })
                  }
                >
                  <strong>{card.label}</strong>
                  <span>{card.description}</span>
                </button>
              ))}
            </div>

            <label className="field park-reply-modal__field" htmlFor="parkReplyText">
              <span>给对方的回复</span>
              <textarea
                id="parkReplyText"
                value={replyDraft.cheerText}
                maxLength={120}
                onChange={(event) => setReplyDraft((current) => current ? { ...current, cheerText: event.target.value } : current)}
              />
            </label>

            <div className="park-reply-modal__footer">
              <span>回应者能量 +1 · 对方能量 +2 · 亲密度 +3</span>
              <button className="primary-button" type="button" disabled={commandLoading || replyDraft.cheerText.trim().length === 0} onClick={() => void submitReplyComposer()}>
                <Send size={16} aria-hidden />
                送出回应
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
