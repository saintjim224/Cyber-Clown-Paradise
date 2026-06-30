"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  demoClowns,
  demoEvents,
  eventTypeText,
  liangjiangCampus,
  liangjiangPois,
  poiTypeText,
  type CampusPoiType,
  type DemoClown,
  type LngLatTuple,
  type SocialEvent
} from "@/lib/socialMapData";

type AMapNamespace = {
  getConfig: () => { appname?: string };
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  InfoWindow: new (options: Record<string, unknown>) => AMapInfoWindow;
  Pixel: new (x: number, y: number) => unknown;
  Scale: new () => unknown;
  ToolBar: new (options?: Record<string, unknown>) => unknown;
  ControlBar: new (options?: Record<string, unknown>) => unknown;
  MapType: new (options?: Record<string, unknown>) => unknown;
  LngLat: new (lng: number, lat: number) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
};

type AMapMap = {
  add: (overlay: unknown | unknown[]) => void;
  addControl: (control: unknown) => void;
  clearMap: () => void;
  destroy: () => void;
  setCenter: (center: LngLatTuple | unknown) => void;
  setZoom: (zoom: number) => void;
  setFitView?: (overlays?: unknown[], immediately?: boolean, avoid?: number[], maxZoom?: number) => void;
};

type AMapMarker = {
  on: (eventName: string, handler: () => void) => void;
};

type AMapInfoWindow = {
  open: (map: AMapMap, position: unknown) => void;
};

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string;
      serviceHost?: string;
    };
  }
}

type RuntimeConfig = {
  amapJsapiKey?: string;
  amapSecurityJsCode?: string;
  hasAmapKey?: boolean;
};

type MarkerRecord = {
  id: string;
  marker: AMapMarker;
  info: AMapInfoWindow;
  position: unknown;
};

type SelectedItem = {
  kind: "clown" | "poi" | "event";
  id: string;
  title: string;
  badge: string;
  note: string;
};

type ActiveModule = "clowns" | "events" | "places";

const key = process.env.NEXT_PUBLIC_AMAP_JSAPI_KEY ?? "";
const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE ?? "";
const eventTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai"
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markerContent(label: string, type: CampusPoiType | "campus") {
  return `<div class="amap-pixel-marker amap-pixel-marker--${type}"><b>${escapeHtml(label)}</b></div>`;
}

function clownContent(clown: DemoClown) {
  const image = clown.image
    ? `<img src="${escapeHtml(clown.image)}" alt="" />`
    : `<span class="amap-clown-sprite" aria-hidden="true">
        <i class="amap-clown-hat"></i>
        <i class="amap-clown-head"></i>
        <i class="amap-clown-body"></i>
      </span>`;

  return `<div class="amap-clown-marker" style="--clown-main:${clown.color};--clown-accent:${clown.accent}">
    ${image}
    <b>${escapeHtml(clown.name)}</b>
  </div>`;
}

function eventBubbleContent(event: SocialEvent) {
  return `<div class="amap-event-bubble"><b>${escapeHtml(event.title)}</b></div>`;
}

function addControlSafely(map: AMapMap, makeControl: () => unknown) {
  try {
    map.addControl(makeControl());
  } catch {
    // AMap controls are optional; older SDK builds can omit one without breaking the map.
  }
}

function eventPoi(event: SocialEvent) {
  return event.poiId ? liangjiangPois.find((item) => item.id === event.poiId) ?? null : null;
}

function eventPath(event: SocialEvent): LngLatTuple[] {
  const from = demoClowns.find((clown) => clown.id === event.from);
  const to = event.to ? demoClowns.find((clown) => clown.id === event.to) : null;
  const poi = eventPoi(event);

  if (event.path && event.path.length > 0) return event.path;
  if (from && to) return [from.position, to.position];
  if (from && poi) return [from.position, poi.position];
  if (from) return [from.position];
  if (poi) return [poi.position];
  return [liangjiangCampus.center];
}

function eventOccurrencePosition(event: SocialEvent): LngLatTuple {
  const poi = eventPoi(event);
  if (poi) return poi.position;

  const path = eventPath(event);
  if (path.length === 1) return path[0];
  const midpoint = path[Math.floor(path.length / 2)];
  return midpoint ?? path[0];
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return eventTimeFormatter.format(date);
}

function eventPlaceLabel(event: SocialEvent) {
  return eventPoi(event)?.label ?? liangjiangCampus.shortName;
}

function eventMetaText(event: SocialEvent) {
  return `${formatEventTime(event.createdAt)} · ${eventTypeText[event.type]} · ${eventPlaceLabel(event)}`;
}

function eventSelectedItem(event: SocialEvent): SelectedItem {
  return {
    kind: "event",
    id: event.id,
    title: event.title,
    badge: eventMetaText(event),
    note: event.summary
  };
}

export function AmapCampusMap() {
  const [status, setStatus] = useState("正在读取高德地图配置。");
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [activeModule, setActiveModule] = useState<ActiveModule>("clowns");
  const [selected, setSelected] = useState<SelectedItem>({
    kind: "clown",
    id: demoClowns[0].id,
    title: demoClowns[0].name,
    badge: demoClowns[0].role,
    note: demoClowns[0].line
  });
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const markerRefs = useRef<Record<string, MarkerRecord>>({});
  const activeKey = runtimeConfig?.amapJsapiKey || key;
  const activeSecurityJsCode = runtimeConfig?.amapSecurityJsCode || securityJsCode;
  const hasAmapKey = Boolean(activeKey);
  const keyStatus = runtimeConfig === null ? "CHECKING" : hasAmapKey ? "KEY READY" : "NEED KEY";

  const selectedClown = useMemo(
    () => (selected.kind === "clown" ? demoClowns.find((clown) => clown.id === selected.id) ?? demoClowns[0] : null),
    [selected]
  );

  function drawSocialMap(AMap: AMapNamespace, map: AMapMap) {
    map.clearMap();
    markerRefs.current = {};
    map.setCenter(liangjiangCampus.center);
    map.setZoom(liangjiangCampus.zoom);
    const focusableOverlays: unknown[] = [];

    function addMarker(id: string, content: string, position: unknown, note: string, onClick: () => void, offset: [number, number]) {
      const marker = new AMap.Marker({
        position,
        content,
        offset: new AMap.Pixel(offset[0], offset[1]),
        anchor: "bottom-center",
        zIndex: id.startsWith("demo") ? 120 : id.startsWith("event") ? 100 : 80
      });
      const info = new AMap.InfoWindow({
        content: `<div class="amap-info-window">${note}</div>`,
        offset: new AMap.Pixel(0, -34)
      });
      markerRefs.current[id] = { id, marker, info, position };
      marker.on("click", () => {
        onClick();
        info.open(map, markerRefs.current[id].position);
      });
      focusableOverlays.push(marker);
      map.add(marker);
    }

    liangjiangPois.forEach((poi) => {
      const position = new AMap.LngLat(poi.position[0], poi.position[1]);
      addMarker(
        poi.id,
        markerContent(poi.label, poi.type),
        position,
        `<strong>${escapeHtml(poi.label)}</strong><p>${escapeHtml(poiTypeText[poi.type])} · ${escapeHtml(poi.note)}</p>`,
        () => {
          setActiveModule("places");
          setSelected({
            kind: "poi",
            id: poi.id,
            title: poi.label,
            badge: poiTypeText[poi.type],
            note: poi.note
          });
        },
        [0, -11]
      );
    });

    demoClowns.forEach((clown) => {
      const position = new AMap.LngLat(clown.position[0], clown.position[1]);
      addMarker(
        clown.id,
        clownContent(clown),
        position,
        `<strong>${escapeHtml(clown.name)}</strong><p>${escapeHtml(clown.line)}</p><p>${escapeHtml(clown.action)}</p>`,
        () =>
          setSelected({
            kind: "clown",
            id: clown.id,
            title: clown.name,
            badge: `${clown.energy} · ${clown.role}`,
            note: clown.line
          }),
        [-34, -82]
      );
    });

    demoEvents.forEach((event) => {
      const path = eventPath(event);
      const polylinePath = path.map((position) => new AMap.LngLat(position[0], position[1]));
      const from = demoClowns.find((clown) => clown.id === event.from);
      if (polylinePath.length > 1) {
        map.add(
          new AMap.Polyline({
            path: polylinePath,
            strokeColor: from?.accent ?? "#ffd84a",
            strokeOpacity: 0.86,
            strokeWeight: 5,
            strokeStyle: "dashed",
            lineJoin: "round",
            zIndex: 70
          })
        );
      }

      const bubbleLngLat = eventOccurrencePosition(event);
      const bubblePosition = new AMap.LngLat(bubbleLngLat[0], bubbleLngLat[1]);
      const eventMeta = eventMetaText(event);
      addMarker(
        event.id,
        eventBubbleContent(event),
        bubblePosition,
        `<strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(eventMeta)}</p><p>${escapeHtml(event.summary)}</p>`,
        () => {
          setActiveModule("events");
          setSelected(eventSelectedItem(event));
        },
        [0, -9]
      );
    });

    map.setFitView?.(focusableOverlays, false, [90, 110, 90, 110], 17.45);
    setStatus("高德两江校区社交地图已启用：小丑、事件路径和地点标识均为项目自有覆盖层。");
  }

  function focusMarker(item: SelectedItem) {
    setSelected(item);
    const map = mapRef.current;
    const record = markerRefs.current[item.id];
    if (!map || !record) return;
    map.setCenter(record.position);
    map.setZoom(item.kind === "event" ? 17.9 : 18.15);
    record.info.open(map, record.position);
  }

  useEffect(() => {
    let closed = false;

    async function loadRuntimeConfig() {
      try {
        const response = await fetch("/api/runtime-config", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const config = (await response.json()) as RuntimeConfig;
        if (closed) return;
        setRuntimeConfig(config);
        if (!config.hasAmapKey) setStatus("未配置高德 Web Key，当前无法显示真实两江社交地图。");
      } catch (error) {
        if (closed) return;
        setRuntimeConfig({});
        setStatus(error instanceof Error ? `读取高德配置失败：${error.message}` : "读取高德配置失败。");
      }
    }

    void loadRuntimeConfig();
    return () => {
      closed = true;
    };
  }, []);

  useEffect(() => {
    let closed = false;
    if (runtimeConfig === null || !activeKey || !mountRef.current) return;

    async function setup() {
      try {
        setStatus("正在加载高德两江校区真实底图。");
        if (activeSecurityJsCode) {
          window._AMapSecurityConfig = {
            securityJsCode: activeSecurityJsCode
          };
        }

        const loader = await import("@amap/amap-jsapi-loader");
        const AMap = (await loader.load({
          key: activeKey,
          version: "2.0",
          plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.ControlBar", "AMap.MapType"]
        }).then((AMap: AMapNamespace) => {
          AMap.getConfig().appname = "amap-jsapi-skill";
          return AMap;
        })) as AMapNamespace;

        if (closed || !mountRef.current) return;
        const map = new AMap.Map(mountRef.current, {
          viewMode: "3D",
          zoom: liangjiangCampus.zoom,
          center: liangjiangCampus.center,
          pitch: 35,
          rotation: 0,
          mapStyle: "amap://styles/normal",
          resizeEnable: true,
          showLabel: true,
          showIndoorMap: true,
          features: ["bg", "road", "building", "point"]
        });
        addControlSafely(map, () => new AMap.Scale());
        addControlSafely(map, () => new AMap.ToolBar({ position: "RB" }));
        addControlSafely(map, () => new AMap.ControlBar({ position: { right: "10px", top: "10px" } }));
        addControlSafely(map, () => new AMap.MapType({ defaultType: 0 }));
        mapRef.current = map;
        drawSocialMap(AMap, map);
      } catch (error) {
        if (!closed) setStatus(error instanceof Error ? `高德地图加载失败：${error.message}` : "高德地图加载失败。");
      }
    }

    void setup();
    return () => {
      closed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // Map instance should be created once after runtime config is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, activeSecurityJsCode, runtimeConfig]);

  return (
    <section className="amap-panel amap-social-panel" aria-label="两江校区高德社交地图">
      <div className="amap-panel__header">
        <div>
          <span className="pixel-kicker">AMAP SOCIAL MAP</span>
          <h2>两江校区真实社交地图</h2>
          <p>直接使用高德真实底图作为社交空间。小丑、气球、对话和回放路径都是项目自有覆盖层，后续可替换为队友交付的二维角色 PNG。</p>
        </div>
        <span className={hasAmapKey ? "amap-status amap-status--ready" : "amap-status"}>{keyStatus}</span>
      </div>

      <div className="amap-social-layout">
        <div className="amap-frame amap-social-frame">
          {hasAmapKey ? <div ref={mountRef} className="amap-canvas" /> : null}
          {!hasAmapKey ? (
            <div className="amap-empty">
              <strong>{runtimeConfig === null ? "读取配置中" : "等待高德 Key"}</strong>
              <p>把 Web Key 填入 NEXT_PUBLIC_AMAP_JSAPI_KEY，把安全密钥填入 NEXT_PUBLIC_AMAP_SECURITY_JS_CODE，重启前端即可启用真实社交地图。</p>
            </div>
          ) : null}
        </div>

        <aside className="amap-social-sidebar" aria-label="小丑社交控制台">
          <div className="amap-module-tabs" role="tablist" aria-label="社交地图模块">
            <button type="button" data-active={activeModule === "clowns"} onClick={() => setActiveModule("clowns")}>
              <strong>{demoClowns.length}</strong>
              <span>demo 小丑</span>
            </button>
            <button type="button" data-active={activeModule === "events"} onClick={() => setActiveModule("events")}>
              <strong>{demoEvents.length}</strong>
              <span>社交事件</span>
            </button>
            <button type="button" data-active={activeModule === "places"} onClick={() => setActiveModule("places")}>
              <strong>{liangjiangPois.length}</strong>
              <span>地点标识</span>
            </button>
          </div>

          <div className="amap-social-selected">
            <span>{selected.badge}</span>
            <strong>{selected.title}</strong>
            <p>{selected.note}</p>
            {selectedClown ? <small>{selectedClown.action}</small> : null}
          </div>

          <div className="amap-module-panel">
            {activeModule === "clowns" ? (
              <div className="amap-clown-list" aria-label="demo 小丑列表">
                {demoClowns.map((clown) => (
                  <button
                    key={clown.id}
                    type="button"
                    data-active={selected.id === clown.id}
                    style={{ "--clown-main": clown.color, "--clown-accent": clown.accent } as CSSProperties}
                    onClick={() =>
                      focusMarker({
                        kind: "clown",
                        id: clown.id,
                        title: clown.name,
                        badge: `${clown.energy} · ${clown.role}`,
                        note: clown.line
                      })
                    }
                  >
                    <i aria-hidden />
                    <span>
                      <strong>{clown.name}</strong>
                      <small>{clown.status}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {activeModule === "events" ? (
              <div className="amap-event-list" aria-label="自主社交事件列表">
                {demoEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    data-active={selected.id === event.id}
                    onClick={() => focusMarker(eventSelectedItem(event))}
                  >
                    <strong>{event.title}</strong>
                    <span>{eventMetaText(event)}</span>
                    <span>{event.summary}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {activeModule === "places" ? (
              <div className="amap-poi-list amap-poi-list--social" aria-label="两江校区地点标识">
                {liangjiangPois.map((poi) => (
                  <button
                    key={poi.id}
                    type="button"
                    data-active={selected.id === poi.id}
                    onClick={() =>
                      focusMarker({
                        kind: "poi",
                        id: poi.id,
                        title: poi.label,
                        badge: poiTypeText[poi.type],
                        note: poi.note
                      })
                    }
                  >
                    <i className={`campus-poi-dot campus-poi-dot--${poi.type}`} aria-hidden />
                    <span>{poi.label}</span>
                    <small>{poiTypeText[poi.type]}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="amap-footer">
        <p>{status}</p>
      </div>
    </section>
  );
}
