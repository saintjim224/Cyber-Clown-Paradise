"use client";

import type { CSSProperties, PointerEvent, WheelEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { campusPixelMaps, tileLegend, type CampusPixelMap, type CampusPoi, type CampusTile } from "@/lib/swuplCampusMap";
import type { Joker, ParkEvent } from "@/lib/api";
import { PixelAvatarBadge } from "./PixelAvatarBadge";

type PixelCampusMapProps = {
  joker?: Joker | null;
  events?: ParkEvent[];
  initialCampusId?: string;
  compact?: boolean;
  mode?: "embedded" | "explorer";
};

type PanState = {
  x: number;
  y: number;
};

const tileLabels: Record<CampusTile, string> = {
  grass: "草地",
  tree: "树丛",
  path: "小路",
  road: "道路",
  water: "水域",
  building: "建筑",
  dorm: "宿舍",
  court: "球场",
  plaza: "广场",
  gate: "校门",
  landmark: "地标",
  social: "社交点"
};

const poiTypeLabel: Record<CampusPoi["type"], string> = {
  gate: "入口",
  study: "学习点",
  social: "社交点",
  sport: "运动点",
  lake: "湖畔",
  dorm: "宿舍",
  service: "补给点"
};

const minZoom = 0.72;
const maxZoom = 3.2;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shouldZoomWithWheel(event: WheelEvent<HTMLDivElement>) {
  return event.ctrlKey || event.deltaMode !== 0 || Math.abs(event.deltaY) >= 40;
}

function eventToTile(event: ParkEvent | undefined, map: CampusPixelMap) {
  const lastPoint = event?.position_path?.[event.position_path.length - 1];
  if (!lastPoint) return { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
  const [rawX = 0, , rawZ = 0] = lastPoint;
  const normalizedX = (rawX + 3) / 6;
  const normalizedY = (rawZ + 2) / 4;
  return {
    x: Math.max(1, Math.min(map.width - 2, Math.round(normalizedX * (map.width - 1)))),
    y: Math.max(1, Math.min(map.height - 2, Math.round(normalizedY * (map.height - 1))))
  };
}

export function PixelCampusMap({
  joker,
  events = [],
  initialCampusId = "liangjiang",
  compact = false,
  mode = "embedded"
}: PixelCampusMapProps) {
  const [campusId, setCampusId] = useState(initialCampusId);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(mode === "explorer" ? 1.18 : 1);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const dragMoved = useRef(false);
  const map = campusPixelMaps.find((item) => item.id === campusId) ?? campusPixelMaps[0];
  const activeEvent = events[events.length - 1];
  const actorPosition = useMemo(() => eventToTile(activeEvent, map), [activeEvent, map]);
  const poiByCoord = useMemo(() => new Map(map.pois.map((poi) => [`${poi.x}:${poi.y}`, poi])), [map.pois]);
  const selectedPoi = map.pois.find((poi) => poi.id === selectedPoiId) ?? map.pois.find((poi) => poi.type === "social") ?? map.pois[0];
  const explorer = mode === "explorer";

  function tileAt(x: number, y: number) {
    const symbol = map.rows[y]?.[x];
    return symbol ? tileLegend[symbol] ?? null : null;
  }

  function tileVariant(x: number, y: number, tile: CampusTile) {
    return Math.abs((x * 17 + y * 31 + tile.length * 13) % 6);
  }

  function resetView(nextZoom = explorer ? 1.18 : 1) {
    setZoom(nextZoom);
    setPan({ x: 0, y: 0 });
  }

  function changeZoom(delta: number) {
    setZoom((current) => clamp(Number((current + delta).toFixed(2)), minZoom, maxZoom));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!explorer) return;
    if (!shouldZoomWithWheel(event)) return;
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -0.12 : 0.12);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!explorer) return;
    dragMoved.current = false;
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: pan.x,
      panY: pan.y
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!explorer || !dragStart.current) return;
    const deltaX = event.clientX - dragStart.current.pointerX;
    const deltaY = event.clientY - dragStart.current.pointerY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) dragMoved.current = true;
    setPan({
      x: dragStart.current.panX + deltaX,
      y: dragStart.current.panY + deltaY
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!explorer) return;
    dragStart.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.setTimeout(() => {
      dragMoved.current = false;
    }, 0);
  }

  const layerStyle = {
    "--map-width": map.width,
    "--map-height": map.height,
    "--map-zoom": zoom,
    "--map-pan-x": `${pan.x}px`,
    "--map-pan-y": `${pan.y}px`,
    gridTemplateColumns: `repeat(${map.width}, var(--campus-tile-size))`
  } as CSSProperties;

  return (
    <div className={`campus-map campus-map--${mode} ${compact ? "campus-map--compact" : ""}`.trim()}>
      <div className="campus-map__tabs" role="tablist" aria-label="选择西南政法大学校区">
        {campusPixelMaps.map((campus) => (
          <button
            key={campus.id}
            type="button"
            role="tab"
            aria-selected={campus.id === map.id}
            data-active={campus.id === map.id}
            onClick={() => {
              setCampusId(campus.id);
              setSelectedPoiId(null);
              resetView();
            }}
          >
            {campus.name}
          </button>
        ))}
      </div>

      <div className="campus-map__meta">
        <div>
          <h3>{map.name}</h3>
          <p>
            {map.alias ? `${map.alias} / ` : ""}
            {map.address}
          </p>
        </div>
        <span>{map.role}</span>
      </div>

      {explorer ? (
        <div className="campus-map__toolbar" aria-label="地图缩放控制">
          <button type="button" onClick={() => changeZoom(0.18)} aria-label="放大地图">
            +
          </button>
          <button type="button" onClick={() => changeZoom(-0.18)} aria-label="缩小地图">
            -
          </button>
          <button type="button" onClick={() => resetView()}>
            复位
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <span>约 {map.metersPerTile}m / 格</span>
        </div>
      ) : null}

      <div
        className={`campus-map__viewport ${isDragging ? "campus-map__viewport--dragging" : ""}`.trim()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="campus-map__grid" style={layerStyle} aria-label={`${map.name} 像素地图`}>
          {map.rows.flatMap((row, y) =>
            row.split("").map((symbol, x) => {
              const tile = tileLegend[symbol] ?? "grass";
              const poi = poiByCoord.get(`${x}:${y}`);
              const actorHere = actorPosition.x === x && actorPosition.y === y;
              const northSame = tileAt(x, y - 1) === tile;
              const southSame = tileAt(x, y + 1) === tile;
              const eastSame = tileAt(x + 1, y) === tile;
              const westSame = tileAt(x - 1, y) === tile;
              const variant = tileVariant(x, y, tile);
              const tileStyle = {
                "--tile-variant": variant,
                "--tile-spark": `${(variant + 1) * 2}px`
              } as CSSProperties;
              return (
                <button
                  key={`${map.id}-${x}-${y}`}
                  type="button"
                  className={`campus-tile campus-tile--${tile} campus-tile--v${variant}`}
                  aria-label={poi ? `${poi.label}，${poiTypeLabel[poi.type]}` : tileLabels[tile]}
                  title={poi ? poi.label : tileLabels[tile]}
                  data-poi={Boolean(poi)}
                  data-active={poi?.id === selectedPoi?.id}
                  data-n={northSame}
                  data-s={southSame}
                  data-e={eastSame}
                  data-w={westSame}
                  style={tileStyle}
                  onClick={() => {
                    if (dragMoved.current) return;
                    if (poi) setSelectedPoiId(poi.id);
                  }}
                >
                  {poi ? (
                    <>
                      <span className={`campus-poi campus-poi--${poi.type}`} />
                      <span className="campus-poi-label">{poi.label}</span>
                    </>
                  ) : null}
                  {actorHere ? <PixelAvatarBadge joker={joker} compact label={joker?.nickname ?? "小丑"} /> : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="campus-map__footer">
        <div className="campus-map__poi">
          <strong>{selectedPoi?.label ?? "等待小丑入园"}</strong>
          <span>{selectedPoi ? poiTypeLabel[selectedPoi.type] : "事件点"}</span>
        </div>
        <p>{activeEvent?.dialogue ?? selectedPoi?.note ?? "地图为公开校区信息基础上的原创像素抽象，后续可接入正式地图导入管线。"}</p>
      </div>

      {explorer ? (
        <>
          <div className="campus-poi-list" aria-label={`${map.name}地点标识`}>
            {map.pois.map((poi) => (
              <button
                key={poi.id}
                type="button"
                data-active={poi.id === selectedPoi?.id}
                onClick={() => setSelectedPoiId(poi.id)}
              >
                <span className={`campus-poi-dot campus-poi-dot--${poi.type}`} />
                <strong>{poi.label}</strong>
                <small>{poiTypeLabel[poi.type]}</small>
              </button>
            ))}
          </div>
          <div className="campus-map__source">
            <div>
              <strong>数据状态</strong>
              <span>{map.dataStatus === "playable-abstraction" ? "可玩抽象地图，待授权 1:1 导入" : "可导入授权数据"}</span>
            </div>
            <ul>
              {map.sourceNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
