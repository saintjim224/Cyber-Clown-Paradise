"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { ClownSprite } from "@/components/pixel/ClownSprite";
import type { Joker, ParkEvent } from "@/lib/api";
import {
  eventTypeText,
  liangjiangMapImage,
  liangjiangPois,
  type DemoClown,
  type ImagePointTuple,
  type LiangjiangPoi,
  type SocialEvent
} from "@/lib/socialMapData";

type LiangjiangRealtimeMapProps = {
  joker?: Joker | null;
  events?: ParkEvent[] | SocialEvent[];
  clowns?: DemoClown[];
  compact?: boolean;
  allowCampusTabs?: boolean;
};

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

type GesturePointer = {
  id: number;
  x: number;
  y: number;
};

type DragGesture = {
  type: "drag";
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type PinchGesture = {
  type: "pinch";
  startDistance: number;
  startCenterX: number;
  startCenterY: number;
  origin: MapView;
};

type MapGesture = DragGesture | PinchGesture;
type MapViewUpdater = MapView | ((current: MapView) => MapView);

const emptyEvents: Array<ParkEvent | SocialEvent> = [];
const minMapScale = 1;
const maxMapScale = 3.25;
const mapZoomStep = 0.28;
const initialMapView: MapView = { scale: 1, x: 0, y: 0 };

const campusTabs = [
  { id: "liangjiang", name: "两江校区", available: true },
  { id: "shapingba", name: "沙坪坝校区", available: false },
  { id: "baoshenghu", name: "宝圣湖校区", available: false }
] as const;

const parkActionTypeText: Record<string, SocialEvent["type"]> = {
  hug: "reply",
  pet: "reply",
  dance: "wave",
  cheer: "cheer"
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pointerDistance(first: GesturePointer, second: GesturePointer) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerCenter(first: GesturePointer, second: GesturePointer) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  };
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableUnit(seed: string, salt: number) {
  return stableHash(`${seed}:${salt}`) / 0xffffffff;
}

function stableOffsetMapPoint(point: ImagePointTuple, seed: string, scale = 28): ImagePointTuple {
  return [
    clamp(Math.round(point[0] + (stableUnit(seed, 1) - 0.5) * scale), 24, liangjiangMapImage.width - 24),
    clamp(Math.round(point[1] + (stableUnit(seed, 2) - 0.5) * scale), 24, liangjiangMapImage.height - 24)
  ];
}

function stableOffsetPosition(position: [number, number], seed: string, scale = 0.00008): [number, number] {
  return [
    Number((position[0] + (stableUnit(seed, 3) - 0.5) * scale).toFixed(6)),
    Number((position[1] + (stableUnit(seed, 4) - 0.5) * scale).toFixed(6))
  ];
}

function poiById(id: string | null | undefined): LiangjiangPoi | undefined {
  return id ? liangjiangPois.find((poi) => poi.id === id) : undefined;
}

function fallbackJokerPoi(joker: Joker) {
  return joker.social_energy === "I"
    ? poiById("lj-yuxiu-lake") ?? liangjiangPois[0]
    : poiById("lj-roman-square") ?? liangjiangPois[0];
}

function jokerToClown(joker: Joker, index: number): DemoClown {
  const spawnPoi = poiById(joker.desired_poi_id) ?? fallbackJokerPoi(joker);
  const offsetSeed = `${joker.id}:${joker.desired_poi_id ?? spawnPoi.id}`;
  const sampleLine = joker.soul_profile?.sample_lines?.[0] ?? joker.verdict;
  const palette = joker.style_tokens?.palette;

  return {
    id: joker.id,
    name: joker.nickname || `${joker.social_energy} 人小丑`,
    role: joker.social_energy === "I" ? "低压游园" : "主动破冰",
    energy: joker.social_energy,
    status: "正在两江小丑实时游园",
    line: sampleLine,
    catchphrase: joker.soul_profile?.catchphrase ?? sampleLine,
    homePoiId: spawnPoi.id,
    action: "正在播放自己的专属动作",
    position: stableOffsetPosition(spawnPoi.position, offsetSeed),
    mapPoint: stableOffsetMapPoint(spawnPoi.mapPoint, offsetSeed),
    color: palette?.primary ?? (index % 2 === 0 ? "#e23d2f" : "#2c67c7"),
    accent: palette?.accent ?? "#ffd84a",
    image: joker.avatar_recipe?.preview_url,
    spriteUrl: joker.avatar_recipe?.sprite_url,
    frameSize: joker.avatar_recipe?.frame_size,
    spriteActions: joker.avatar_recipe?.actions
  };
}

function isSocialEvent(event: ParkEvent | SocialEvent): event is SocialEvent {
  return "createdAt" in event;
}

function parkPointToMapPoint(point: number[] | undefined): ImagePointTuple | null {
  if (!point) return null;
  const [rawX = 0, , rawZ = 0] = point;
  const normalizedX = clamp((rawX + 3) / 6, 0, 1);
  const normalizedY = clamp((rawZ + 2) / 4, 0, 1);
  return [
    clamp(Math.round(normalizedX * liangjiangMapImage.width), 24, liangjiangMapImage.width - 24),
    clamp(Math.round(normalizedY * liangjiangMapImage.height), 24, liangjiangMapImage.height - 24)
  ];
}

function normalizeParkEvent(event: ParkEvent, activeClowns: DemoClown[], joker?: Joker | null): SocialEvent {
  const actor = activeClowns.find((clown) => clown.id === event.actor_id) ?? (joker ? activeClowns.find((clown) => clown.id === joker.id) : null);
  const target = event.target_id ? activeClowns.find((clown) => clown.id === event.target_id) ?? null : null;
  const mapPath = event.position_path
    .map(parkPointToMapPoint)
    .filter((point): point is ImagePointTuple => Boolean(point));
  const fallbackPath = target && actor ? [actor.mapPoint, target.mapPoint] : actor ? [actor.mapPoint] : [liangjiangPois[0].mapPoint];
  const type = parkActionTypeText[event.action_type] ?? "wave";

  return {
    id: event.id,
    title: event.animation_clip || event.action_type,
    from: actor?.id ?? event.actor_id,
    to: target?.id ?? event.target_id ?? undefined,
    poiId: actor?.homePoiId,
    summary: event.dialogue,
    type,
    moodDelta: event.mood_delta,
    createdAt: event.created_at,
    status: event.source === "autonomy" ? "live" : "replay",
    mapPath: mapPath.length > 0 ? mapPath : fallbackPath
  };
}

function normalizeEvents(events: Array<ParkEvent | SocialEvent>, activeClowns: DemoClown[], joker?: Joker | null) {
  return events.map((event) => (isSocialEvent(event) ? event : normalizeParkEvent(event, activeClowns, joker)));
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

function styleForMapPoint(point: ImagePointTuple, clown?: DemoClown): PositionStyle {
  return {
    "--x": `${point[0]}px`,
    "--y": `${point[1]}px`,
    "--clown-main": clown?.color,
    "--clown-accent": clown?.accent
  };
}

export function LiangjiangRealtimeMap({
  joker = null,
  events = emptyEvents as ParkEvent[] | SocialEvent[],
  clowns,
  compact = false,
  allowCampusTabs = false
}: LiangjiangRealtimeMapProps) {
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapViewRef = useRef<MapView>(initialMapView);
  const activePointersRef = useRef<Map<number, GesturePointer>>(new Map());
  const gestureRef = useRef<MapGesture | null>(null);
  const [mapView, setMapView] = useState<MapView>(initialMapView);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [selected, setSelected] = useState<Selection>({ kind: "poi", id: "lj-main-gate" });
  const [closedCampusNotice, setClosedCampusNotice] = useState<string | null>(null);
  const baseMapScale = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return 1;
    return Math.max(viewportSize.width / liangjiangMapImage.width, viewportSize.height / liangjiangMapImage.height);
  }, [viewportSize.height, viewportSize.width]);
  const effectiveMapScale = baseMapScale * mapView.scale;

  const activeClowns = useMemo(() => {
    const next = clowns ? [...clowns] : [];
    if (joker && !next.some((clown) => clown.id === joker.id)) next.push(jokerToClown(joker, next.length));
    return next;
  }, [clowns, joker]);

  const normalizedEvents = useMemo(
    () => normalizeEvents(events as Array<ParkEvent | SocialEvent>, activeClowns, joker),
    [activeClowns, events, joker]
  );
  const visibleEvents = normalizedEvents.slice(-14);
  const focusedEvent = selected.kind === "event" ? normalizedEvents.find((event) => event.id === selected.id) ?? normalizedEvents.at(-1) : normalizedEvents.at(-1);
  const focusedClown = selected.kind === "clown" ? activeClowns.find((clown) => clown.id === selected.id) ?? null : null;
  const focusedPoi = selected.kind === "poi" ? liangjiangPois.find((poi) => poi.id === selected.id) ?? null : null;
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

  const clampMapView = useCallback(
    (view: MapView): MapView => {
      const scale = clamp(view.scale, minMapScale, maxMapScale);
      if (viewportSize.width <= 0 || viewportSize.height <= 0) return { scale, x: 0, y: 0 };

      const scaledWidth = liangjiangMapImage.width * baseMapScale * scale;
      const scaledHeight = liangjiangMapImage.height * baseMapScale * scale;
      const maxX = Math.max(0, (scaledWidth - viewportSize.width) / 2);
      const maxY = Math.max(0, (scaledHeight - viewportSize.height) / 2);

      return {
        scale,
        x: clamp(view.x, -maxX, maxX),
        y: clamp(view.y, -maxY, maxY)
      };
    },
    [baseMapScale, viewportSize.height, viewportSize.width]
  );

  const updateMapView = useCallback(
    (next: MapViewUpdater) => {
      setMapView((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        const clamped = clampMapView(resolved);
        mapViewRef.current = clamped;
        return clamped;
      });
    },
    [clampMapView]
  );

  const zoomAroundPoint = useCallback((current: MapView, nextScale: number, clientX: number, clientY: number, rect: DOMRect): MapView => {
    const scale = clamp(nextScale, minMapScale, maxMapScale);
    const ratio = scale / current.scale;
    const cursorX = clientX - rect.left - rect.width / 2 - current.x;
    const cursorY = clientY - rect.top - rect.height / 2 - current.y;

    return {
      scale,
      x: current.x - cursorX * (ratio - 1),
      y: current.y - cursorY * (ratio - 1)
    };
  }, []);

  const startDragGesture = useCallback((pointer: GesturePointer) => {
    const current = mapViewRef.current;
    gestureRef.current = {
      type: "drag",
      pointerId: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      originX: current.x,
      originY: current.y
    };
  }, []);

  const startPinchGesture = useCallback((pointers: GesturePointer[], rect: DOMRect) => {
    const [first, second] = pointers;
    if (!first || !second) return;
    const distance = pointerDistance(first, second);
    if (distance <= 0) return;
    const center = pointerCenter(first, second);

    gestureRef.current = {
      type: "pinch",
      startDistance: distance,
      startCenterX: center.x - rect.left - rect.width / 2,
      startCenterY: center.y - rect.top - rect.height / 2,
      origin: mapViewRef.current
    };
  }, []);

  const centerMapOn = useCallback(
    (point: ImagePointTuple, nextScale = 1.72) => {
      if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
      const scale = clamp(nextScale, minMapScale, maxMapScale);
      const effectiveScale = baseMapScale * scale;
      updateMapView({
        scale,
        x: -(point[0] - liangjiangMapImage.width / 2) * effectiveScale,
        y: -(point[1] - liangjiangMapImage.height / 2) * effectiveScale
      });
    },
    [baseMapScale, updateMapView, viewportSize.height, viewportSize.width]
  );

  const zoomMap = useCallback(
    (delta: number) => {
      const viewport = mapViewportRef.current;
      if (!viewport) {
        updateMapView((current) => ({ ...current, scale: current.scale + delta }));
        return;
      }
      const rect = viewport.getBoundingClientRect();
      updateMapView((current) => zoomAroundPoint(current, current.scale + delta, rect.left + rect.width / 2, rect.top + rect.height / 2, rect));
    },
    [updateMapView, zoomAroundPoint]
  );

  const resetMap = useCallback(() => {
    updateMapView(initialMapView);
  }, [updateMapView]);

  const handleMapWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const viewport = mapViewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const delta = event.deltaY > 0 ? -mapZoomStep : mapZoomStep;
      updateMapView((current) => zoomAroundPoint(current, current.scale + delta, event.clientX, event.clientY, rect));
    },
    [updateMapView, zoomAroundPoint]
  );

  const handleMapPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, select, textarea, a")) return;

    event.preventDefault();
    const pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    activePointersRef.current.set(event.pointerId, pointer);
    event.currentTarget.setPointerCapture(event.pointerId);

    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length >= 2) {
      startPinchGesture(pointers, event.currentTarget.getBoundingClientRect());
    } else {
      startDragGesture(pointer);
    }
  }, [startDragGesture, startPinchGesture]);

  const handleMapPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(event.pointerId)) return;
      event.preventDefault();
      activePointersRef.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });

      const pointers = Array.from(activePointersRef.current.values());
      const gesture = gestureRef.current;

      if (pointers.length >= 2) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!gesture || gesture.type !== "pinch") {
          startPinchGesture(pointers, rect);
          return;
        }

        const [first, second] = pointers;
        if (!first || !second || gesture.startDistance <= 0) return;
        const distance = pointerDistance(first, second);
        const center = pointerCenter(first, second);
        const nextScale = gesture.origin.scale * (distance / gesture.startDistance);
        const scale = clamp(nextScale, minMapScale, maxMapScale);
        const ratio = scale / gesture.origin.scale;
        const centerX = center.x - rect.left - rect.width / 2;
        const centerY = center.y - rect.top - rect.height / 2;

        updateMapView({
          scale,
          x: centerX - (gesture.startCenterX - gesture.origin.x) * ratio,
          y: centerY - (gesture.startCenterY - gesture.origin.y) * ratio
        });
        return;
      }

      if (!gesture || gesture.type !== "drag" || gesture.pointerId !== event.pointerId) return;
      updateMapView((current) => ({
        scale: current.scale,
        x: gesture.originX + event.clientX - gesture.startX,
        y: gesture.originY + event.clientY - gesture.startY
      }));
    },
    [startPinchGesture, updateMapView]
  );

  const handleMapPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length >= 2) {
      startPinchGesture(pointers, event.currentTarget.getBoundingClientRect());
    } else if (pointers.length === 1 && pointers[0]) {
      startDragGesture(pointers[0]);
    } else {
      gestureRef.current = null;
    }
  }, [startDragGesture, startPinchGesture]);

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
      mapViewRef.current = next;
      return next.scale === current.scale && next.x === current.x && next.y === current.y ? current : next;
    });
  }, [clampMapView]);

  useEffect(() => {
    mapViewRef.current = mapView;
  }, [mapView]);

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleMapWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleMapWheel);
  }, [handleMapWheel]);

  useEffect(() => {
    setSelected((current) => {
      if (current.kind === "event" && normalizedEvents.some((event) => event.id === current.id)) return current;
      if (current.kind === "clown" && activeClowns.some((clown) => clown.id === current.id)) return current;
      if (current.kind === "poi" && liangjiangPois.some((poi) => poi.id === current.id)) return current;

      const latestEvent = normalizedEvents.at(-1);
      if (latestEvent) return { kind: "event", id: latestEvent.id };
      const ownClown = joker ? activeClowns.find((clown) => clown.id === joker.id) : null;
      if (ownClown) return { kind: "clown", id: ownClown.id };
      if (activeClowns[0]) return { kind: "clown", id: activeClowns[0].id };
      return { kind: "poi", id: "lj-main-gate" };
    });
  }, [activeClowns, joker, normalizedEvents]);

  function eventMeta(event: SocialEvent) {
    const poi = getEventPoi(event);
    return `${timeLabel(event.createdAt)} · ${eventTypeText[event.type]} · ${poi?.label ?? "两江校区"}`;
  }

  function polylinePoints(event: SocialEvent) {
    return getEventMapPath(event, activeClowns)
      .map((point) => `${point[0]},${point[1]}`)
      .join(" ");
  }

  function selectEvent(event: SocialEvent) {
    setSelected({ kind: "event", id: event.id });
    centerMapOn(getEventMapPosition(event, activeClowns));
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
    if (selected.kind === "clown") return selected.id === clown.id;
    return focusedEvent?.from === clown.id || focusedEvent?.to === clown.id;
  }

  function poiIsFocused(poi: LiangjiangPoi) {
    return selected.kind === "poi" && selected.id === poi.id || focusedEvent?.poiId === poi.id;
  }

  function clickCampus(id: string, name: string, available: boolean) {
    if (available) {
      setClosedCampusNotice(null);
      resetMap();
      return;
    }
    setClosedCampusNotice(`${name}暂未开放`);
  }

  return (
    <div className={`liangjiang-realtime-map ${compact ? "liangjiang-realtime-map--compact" : ""}`.trim()}>
      {allowCampusTabs ? (
        <div className="liangjiang-realtime-map__tabs" role="tablist" aria-label="选择校区">
          {campusTabs.map((campus) => (
            <button
              key={campus.id}
              type="button"
              role="tab"
              aria-selected={campus.available}
              data-active={campus.available}
              onClick={() => clickCampus(campus.id, campus.name, campus.available)}
            >
              {campus.name}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={mapViewportRef}
        className="park-map2d"
        aria-label="两江校区可缩放直播地图"
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
              style={styleForMapPoint(getEventMapPosition(event, activeClowns))}
              onClick={() => selectEvent(event)}
            >
              <strong>{event.title}</strong>
              <span>{getEventPoi(event)?.label ?? eventTypeText[event.type]}</span>
            </button>
          ))}

          {activeClowns.map((clown) => (
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
                  className={clown.id.startsWith("demo-clown-") ? "clown-sprite--smooth" : ""}
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

        {closedCampusNotice ? (
          <div className="liangjiang-realtime-map__notice" role="status">
            {closedCampusNotice}
          </div>
        ) : null}

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
          {focusedClown ? (
            <>
              <small>{focusedClown.energy} · {focusedClown.role}</small>
              <strong>{focusedClown.name}</strong>
              <span>{focusedClown.line}</span>
              <em>{focusedClown.action}</em>
            </>
          ) : focusedPoi ? (
            <>
              <small>两江校区</small>
              <strong>{focusedPoi.label}</strong>
              <span>{focusedPoi.note}</span>
            </>
          ) : (
            <>
              <small>{focusedEvent ? eventMeta(focusedEvent) : "两江校区"}</small>
              <strong>{focusedEvent?.title ?? "等待第一场互动"}</strong>
              <span>{focusedEvent?.summary ?? "加入游园或投放情绪气球后，这里会同步高亮。"}</span>
              {focusedEventPoi ? <em>{focusedEventPoi.note}</em> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
