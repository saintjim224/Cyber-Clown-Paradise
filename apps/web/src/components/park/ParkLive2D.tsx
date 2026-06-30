"use client";

import type { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CheckCircle, Clock, Heart, History, MessageCircle, Radio, Reply, RotateCcw, Send, Sparkles, Trophy, UserPlus, Users, X, ZoomIn, ZoomOut } from "lucide-react";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { LocationChatPanel } from "@/components/chat/LocationChatPanel";
import { ClownSprite } from "@/components/pixel/ClownSprite";
import { PixelAvatarBadge } from "@/components/pixel/PixelAvatarBadge";
import { useLiveSocialEvents } from "@/hooks/useLiveSocialEvents";
import { useLocationZone } from "@/hooks/useLocationZone";
import { clearActiveJoker, loadActiveJoker, saveActiveJoker } from "@/lib/clownAssets";
import { apiFetch, type Balloon, type ChatRoom as ChatRoomType, type ClownVoteSummary, type HealAction, type Joker, type MatchRequest, type MatchResult, type RelationshipRecord } from "@/lib/api";
import {
  eventStatusText,
  eventTypeText,
  liangjiangMapImage,
  liangjiangPois,
  pointInChatZone,
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

type ReplyActionType = "hug" | "pet" | "cheer" | "dance";

type ReplyDraft = {
  eventId: string;
  match: MatchResult;
  actionType: ReplyActionType;
  cheerText: string;
};

type ParkLive2DMode = "user" | "admin";

type ParkLive2DProps = {
  mode?: ParkLive2DMode;
};

type ReplyComposerOptions = {
  eventId?: string;
  preferredAction?: ReplyActionType;
  targetOwnerId?: string;
  targetClownName?: string;
};

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

function shouldZoomWithWheel(event: ReactWheelEvent<HTMLDivElement>) {
  return event.ctrlKey || event.deltaMode !== 0 || Math.abs(event.deltaY) >= 40;
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

function isDemoClownId(id: string | undefined) {
  return Boolean(id?.startsWith("demo-clown-"));
}

function isRealParkClown(id: string | undefined) {
  return Boolean(id?.startsWith("jkr_"));
}

const sessionJokerPrompt = "先在灵魂工坊生成你的专属小丑，再回来投放气球。";

function commandErrorMessage(error: unknown, fallback: string, targetClownName?: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("no_active_joker") || message.includes("token_not_found")) return sessionJokerPrompt;
  if (message.includes("no_pending_balloon_for_target")) {
    return targetClownName ? `${targetClownName} 现在没有待接气球。` : "这个小丑现在没有待接气球。";
  }
  if (message.includes("target_joker_not_found")) return "这个小丑刚刚离开了乐园，换一个目标试试。";
  if (message.includes("cannot_heal_own_balloon")) return "不能接自己的气球，试试选择其他小丑。";
  if (message.includes("no_pending_balloon")) return "现在还没有其他人的待接气球。";
  return message || fallback;
}

export function ParkLive2D({ mode = "user" }: ParkLive2DProps) {
  const isAdmin = mode === "admin";
  const {
    clowns,
    events,
    activeEvent,
    rosterLoaded,
    joinPark,
    joinWave,
    dropBalloon,
    ensureMatchedBalloon,
    replyToEvent,
    focusEvent,
    addJokerToPark,
    syncParkJokers,
    syncPendingBalloons
  } = useLiveSocialEvents();
  const [selected, setSelected] = useState<Selection>({ kind: "event", id: activeEvent?.id ?? events[0]?.id ?? "" });
  const [activeModule, setActiveModule] = useState<SocialEvent["status"]>("live");
  const [balloonText, setBalloonText] = useState("");
  const [mood, setMood] = useState(moodOptions[0]);
  const [activeJoker, setActiveJoker] = useState<Joker | null>(null);
  const [manualJokerPoint, setManualJokerPoint] = useState<ImagePointTuple | null>(null);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [voteSummary, setVoteSummary] = useState<ClownVoteSummary>({ items: [], voted_clown_id: null });
  const [voteSubmittingId, setVoteSubmittingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [chatUnlocks, setChatUnlocks] = useState<RelationshipRecord[]>([]);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoomType | null>(null);
  const [chatOpening, setChatOpening] = useState(false);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [mapView, setMapView] = useState<MapView>(initialMapView);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const baseMapScale = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return 1;
    return Math.max(viewportSize.width / liangjiangMapImage.width, viewportSize.height / liangjiangMapImage.height);
  }, [viewportSize.height, viewportSize.width]);
  const effectiveMapScale = baseMapScale * mapView.scale;

  const refreshChatUnlocks = useCallback(async (jokerId?: string | null) => {
    if (!jokerId) {
      setChatUnlocks([]);
      return;
    }
    try {
      const unlocks = await apiFetch<RelationshipRecord[]>("/api/chat/private-unlocks");
      setChatUnlocks(unlocks);
    } catch {
      setChatUnlocks([]);
    }
  }, []);

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

  const activateSessionJoker = useCallback(
    (joker: Joker) => {
      setActiveJoker(joker);
      const clown = addJokerToPark(joker);
      setSelected({ kind: "clown", id: clown.id });
      return clown;
    },
    [addJokerToPark]
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

  const restoreSessionJoker = useCallback(async () => {
    try {
      return await apiFetch<Joker>("/api/jokers/me");
    } catch (sessionError) {
      const storedJoker = loadActiveJoker();
      if (storedJoker?.qr_token) {
        try {
          return await apiFetch<Joker>(`/api/jokers/enter/${encodeURIComponent(storedJoker.qr_token)}`, {
            method: "POST"
          });
        } catch (restoreError) {
          const message = restoreError instanceof Error ? restoreError.message : "";
          if (message.includes("token_not_found")) clearActiveJoker();
          throw restoreError;
        }
      } else {
        clearActiveJoker();
      }
      throw sessionError;
    }
  }, []);

  const ensureSessionJoker = useCallback(async () => {
    try {
      const joker = await restoreSessionJoker();
      saveActiveJoker(joker);
      const clown = activateSessionJoker(joker);
      return { joker, clown };
    } catch (error) {
      setActiveJoker(null);
      throw error;
    }
  }, [activateSessionJoker, restoreSessionJoker]);

  useEffect(() => {
    let cancelled = false;

    async function loadSessionJoker() {
      try {
        const sessionJoker = await restoreSessionJoker();
        if (cancelled) return;
        saveActiveJoker(sessionJoker);
        activateSessionJoker(sessionJoker);
      } catch {
        if (!cancelled) setActiveJoker(null);
      }
    }

    void loadSessionJoker();

    return () => {
      cancelled = true;
    };
  }, [activateSessionJoker, restoreSessionJoker]);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedJokers() {
      try {
        const [parkJokers, pendingBalloons] = await Promise.all([
          apiFetch<Joker[]>("/api/park/jokers"),
          apiFetch<Balloon[]>("/api/park/balloons")
        ]);
        if (!cancelled) {
          syncParkJokers(parkJokers);
          syncPendingBalloons(pendingBalloons);
        }
      } catch {
        // Keep the local demo usable if the shared park list is temporarily unavailable.
      }
    }

    void loadSharedJokers();
    const timer = window.setInterval(() => void loadSharedJokers(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [syncParkJokers, syncPendingBalloons]);

  useEffect(() => {
    void refreshChatUnlocks(activeJoker?.id);
  }, [activeJoker?.id, refreshChatUnlocks]);

  useEffect(() => {
    setManualJokerPoint(null);
  }, [activeJoker?.id]);

  const displayClowns = useMemo(() => {
    if (!activeJoker || !manualJokerPoint) return clowns;
    return clowns.map((clown) =>
      clown.id === activeJoker.id
        ? {
            ...clown,
            mapPoint: manualJokerPoint,
            status: "由你移动到当前区域",
            action: "正在根据地图位置切换公共聊天池"
          }
        : clown
    );
  }, [activeJoker, clowns, manualJokerPoint]);
  const focusedEvent = selected.kind === "event" ? events.find((event) => event.id === selected.id) ?? activeEvent : activeEvent;
  const focusedClown = selected.kind === "clown" ? displayClowns.find((clown) => clown.id === selected.id) ?? null : null;
  const focusedPoi = selected.kind === "poi" ? liangjiangPois.find((poi) => poi.id === selected.id) ?? null : null;
  const activeClown = activeJoker ? displayClowns.find((clown) => clown.id === activeJoker.id) ?? null : null;
  const activeChatZone = useLocationZone(activeClown?.mapPoint ?? null);
  const focusedClownIsDemo = Boolean(focusedClown && isDemoClownId(focusedClown.id));
  const focusedClownIsSelf = Boolean(activeJoker && focusedClown?.id === activeJoker.id);
  const canReplyToFocusedClown = Boolean(activeJoker && focusedClown && !focusedClownIsDemo && !focusedClownIsSelf);
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
  const focusedChatUnlock = useMemo(() => {
    if (!activeJoker || !focusedClown || focusedClown.id === activeJoker.id) return null;
    return chatUnlocks.find((relationship) => relationship.chat_unlocked && relationship.joker.id === focusedClown.id) ?? null;
  }, [activeJoker, chatUnlocks, focusedClown]);
  const activeZoneOccupancy = useMemo(() => {
    if (!activeChatZone) return 0;
    return Math.max(1, displayClowns.filter((clown) => pointInChatZone(clown.mapPoint, activeChatZone)).length);
  }, [activeChatZone, displayClowns]);
  const realParkClowns = useMemo(
    () => clowns.filter((clown) => isRealParkClown(clown.id)),
    [clowns]
  );
  const voteableClowns = useMemo(
    () => realParkClowns,
    [realParkClowns]
  );
  const voteableClownIds = useMemo(() => voteableClowns.map((clown) => clown.id), [voteableClowns]);
  const voteCountById = useMemo(
    () => new Map(voteSummary.items.map((item) => [item.clown_id, item.votes])),
    [voteSummary.items]
  );
  const rankedClowns = useMemo(
    () =>
      voteableClowns
        .map((clown, index) => ({
          clown,
          initialIndex: index,
          votes: voteCountById.get(clown.id) ?? 0
        }))
        .sort((left, right) => right.votes - left.votes || left.initialIndex - right.initialIndex),
    [voteCountById, voteableClowns]
  );
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
      if (!shouldZoomWithWheel(event)) return;
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

  const refreshVoteSummary = useCallback(async () => {
    if (voteableClownIds.length === 0) {
      setVoteSummary({ items: [], voted_clown_id: null });
      return;
    }
    const summary = await apiFetch<ClownVoteSummary>("/api/park/clown-votes/summary", {
      method: "POST",
      body: JSON.stringify({ clown_ids: voteableClownIds })
    });
    setVoteSummary(summary);
  }, [voteableClownIds]);

  useEffect(() => {
    let cancelled = false;

    async function pollVotes() {
      try {
        if (voteableClownIds.length === 0) {
          if (!cancelled) setVoteSummary({ items: [], voted_clown_id: null });
          return;
        }
        const summary = await apiFetch<ClownVoteSummary>("/api/park/clown-votes/summary", {
          method: "POST",
          body: JSON.stringify({ clown_ids: voteableClownIds })
        });
        if (!cancelled) setVoteSummary(summary);
      } catch {
        // Keep the current optimistic board visible if the vote endpoint blips.
      }
    }

    void pollVotes();
    const timer = window.setInterval(() => void pollVotes(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [voteableClownIds]);

  async function toggleFavoriteVote(clownId: string) {
    if (voteSubmittingId || voteableClownIds.length === 0) return;
    const previousSummary = voteSummary;
    const previousVotedId = previousSummary.voted_clown_id;
    const nextVotedId = previousVotedId === clownId ? null : clownId;
    const nextCounts = new Map(previousSummary.items.map((item) => [item.clown_id, item.votes]));

    if (previousVotedId) {
      nextCounts.set(previousVotedId, Math.max(0, (nextCounts.get(previousVotedId) ?? 0) - 1));
    }
    if (nextVotedId) {
      nextCounts.set(nextVotedId, (nextCounts.get(nextVotedId) ?? 0) + 1);
    }

    setVoteSubmittingId(clownId);
    setCommandError(null);
    setVoteSummary({
      voted_clown_id: nextVotedId,
      items: voteableClownIds.map((id) => ({ clown_id: id, votes: nextCounts.get(id) ?? 0 }))
    });

    try {
      const summary = await apiFetch<ClownVoteSummary>("/api/park/clown-votes/toggle", {
        method: "POST",
        body: JSON.stringify({
          clown_id: clownId,
          current_clown_ids: voteableClownIds
        })
      });
      setVoteSummary(summary);
      setCommandError(null);
    } catch (err) {
      setVoteSummary(previousSummary);
      setCommandError(err instanceof Error ? err.message : "投票同步失败");
      void refreshVoteSummary();
    } finally {
      setVoteSubmittingId(null);
    }
  }

  const clientPointToMapPoint = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): ImagePointTuple => {
      const rect = event.currentTarget.getBoundingClientRect();
      const worldCenterX = rect.width / 2 + mapView.x;
      const worldCenterY = rect.height / 2 + mapView.y;
      return [
        Math.round(
          clamp(
            (event.clientX - rect.left - worldCenterX) / effectiveMapScale + liangjiangMapImage.width / 2,
            24,
            liangjiangMapImage.width - 24
          )
        ),
        Math.round(
          clamp(
            (event.clientY - rect.top - worldCenterY) / effectiveMapScale + liangjiangMapImage.height / 2,
            24,
            liangjiangMapImage.height - 24
          )
        )
      ];
    },
    [effectiveMapScale, mapView.x, mapView.y]
  );

  const handleMapDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!activeJoker || isAdmin) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button, input, select, textarea, a, .location-chat-panel")) {
        return;
      }
      const point = clientPointToMapPoint(event);
      setManualJokerPoint(point);
      setSelected({ kind: "clown", id: activeJoker.id });
      centerMapOn(point, Math.max(mapView.scale, 1.58));
    },
    [activeJoker, centerMapOn, clientPointToMapPoint, isAdmin, mapView.scale]
  );

  function selectEvent(event: SocialEvent) {
    setSelected({ kind: "event", id: event.id });
    setActiveModule(event.status);
    focusEvent(event.id);
    centerMapOn(getEventMapPosition(event, displayClowns));
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

  async function handleLocateMyJoker() {
    if (commandLoading) return;
    setCommandLoading(true);
    setCommandError(null);
    try {
      const { clown } = await ensureSessionJoker();
      setSelected({ kind: "clown", id: clown.id });
      centerMapOn(clown.mapPoint, 1.82);
    } catch (err) {
      setCommandError(commandErrorMessage(err, sessionJokerPrompt));
    } finally {
      setCommandLoading(false);
    }
  }

  async function handleDropBalloon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommandLoading(true);
    setCommandError(null);
    try {
      const { joker } = await ensureSessionJoker();
      const emoText = balloonText.trim() || mood;
      const balloon = await apiFetch<Balloon>("/api/balloons", {
        method: "POST",
        body: JSON.stringify({ emo_text: emoText })
      });
      const created = dropBalloon({
        text: emoText,
        mood,
        balloon,
        senderId: joker.id
      });
      setBalloonText("");
      setActiveModule("waiting");
      setSelected({ kind: "event", id: created.id });
      centerMapOn(getEventMapPosition(created, displayClowns));
    } catch (err) {
      setCommandError(commandErrorMessage(err, "投放气球失败"));
    } finally {
      setCommandLoading(false);
    }
  }

  async function openReplyComposer(options: ReplyComposerOptions = {}) {
    const { eventId, preferredAction = "cheer", targetOwnerId, targetClownName } = options;
    setCommandLoading(true);
    setCommandError(null);
    try {
      const { joker } = await ensureSessionJoker();
      if (targetOwnerId && isDemoClownId(targetOwnerId)) {
        setCommandError("Demo 小丑没有真实待接气球，换一个现场小丑试试。");
        return;
      }
      if (targetOwnerId && targetOwnerId === joker.id) {
        setCommandError("不能接自己的气球，试试选择其他小丑。");
        return;
      }
      const matchRequest: MatchRequest = {
        action_type: preferredAction,
        ...(targetOwnerId ? { target_owner_id: targetOwnerId } : {})
      };
      const match = await apiFetch<MatchResult>("/api/heal/match", {
        method: "POST",
        body: JSON.stringify(matchRequest)
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
      centerMapOn(getEventMapPosition(matchedEvent, displayClowns));
    } catch (err) {
      setCommandError(commandErrorMessage(err, "接住气球失败", targetClownName));
    } finally {
      setCommandLoading(false);
    }
  }

  async function submitReplyComposer() {
    if (!replyDraft) return;
    const cheerText = replyDraft.cheerText.trim();
    if (!cheerText) {
      setCommandError("先留一句回应，再把气球送回去。");
      return;
    }
    setCommandLoading(true);
    setCommandError(null);
    try {
      const { joker } = await ensureSessionJoker();
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
        responderId: joker.id,
        match: replyDraft.match,
        action
      });
      const updatedJoker = {
        ...joker,
        energy_score: (joker.energy_score ?? 0) + action.energy_delta_healer
      };
      setActiveJoker(updatedJoker);
      saveActiveJoker(updatedJoker);
      void refreshChatUnlocks(updatedJoker.id);
      setReplyDraft(null);
      setActiveModule("done");
      setSelected({ kind: "event", id: replyDraft.eventId });
      centerMapOn(getEventMapPosition(matchedEvent, displayClowns));
    } catch (err) {
      setCommandError(commandErrorMessage(err, "提交回应失败"));
    } finally {
      setCommandLoading(false);
    }
  }

  async function openPrivateChatForJoker(jokerId: string) {
    if (!activeJoker || jokerId === activeJoker.id) return;
    setChatOpening(true);
    setCommandError(null);
    try {
      const room = await apiFetch<ChatRoomType>(`/api/chat/private/${jokerId}`, { method: "POST" });
      setActiveChatRoom(room);
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : "打开私聊失败");
    } finally {
      setChatOpening(false);
    }
  }

  async function openFocusedPrivateChat() {
    if (!focusedClown) return;
    await openPrivateChatForJoker(focusedClown.id);
  }

  function handleReplyWave() {
    void openReplyComposer(
      waitingEvent
        ? {
            eventId: waitingEvent.id,
            targetOwnerId: waitingEvent.from,
            targetClownName: clownName(waitingEvent.from)
          }
        : {}
    );
  }

  function styleForMapPoint(point: ImagePointTuple, clown?: DemoClown): PositionStyle {
    return {
      "--x": `${point[0]}px`,
      "--y": `${point[1]}px`,
      "--clown-main": clown?.color,
      "--clown-accent": clown?.accent
    };
  }

  function eventMeta(event: SocialEvent) {
    const poi = getEventPoi(event);
    return `${timeLabel(event.createdAt)} · ${eventTypeText[event.type]} · ${poi?.label ?? "两江校区"}`;
  }

  function eventIsFocused(event: SocialEvent) {
    return focusedEvent?.id === event.id || selected.kind === "event" && selected.id === event.id;
  }

  function selectPoi(poi: LiangjiangPoi) {
    setSelected({ kind: "poi", id: poi.id });
    centerMapOn(poi.mapPoint, 1.78);
  }

  function selectClown(clown: DemoClown) {
    setSelected({ kind: "clown", id: clown.id });
    centerMapOn(clown.mapPoint, 1.82);
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
    return displayClowns.find((clown) => clown.id === id)?.name ?? "现场小丑";
  }

  function connectionFeedText(event: SocialEvent) {
    const from = clownName(event.from);
    const to = event.to ? clownName(event.to) : null;
    if (to) return `${from} 和 ${to} 建立了连接`;
    const poi = getEventPoi(event);
    return `${from} 在 ${poi?.label ?? "两江校区"} 发起了${eventTypeText[event.type]}`;
  }

  return (
    <section className={`park-live2d park-live2d--${mode}`} aria-label={isAdmin ? "两江二维实时社交运营台" : "两江二维实时社交广场"}>
      <div className="park-live2d__layout">
        <section className="park-live2d__map-panel" aria-label="实时二维社交地图">
          <div className="park-live2d__header">
            <div>
              <span className="pixel-kicker">{isAdmin ? "OPS LIVE PARK" : "BUBBLE SOCIAL"}</span>
              <h1>{isAdmin ? "两江小丑实时游园" : "小丑社交广场"}</h1>
              <p>
                {isAdmin
                  ? "同一份两江校区数据驱动小丑、地点、气球和回放。现场看到的是大家的小丑正在替自己社交。"
                  : "像气球一样轻轻发出心情，让数据库里的小丑替你在校园地图上打招呼、接回应、留下回放。"}
              </p>
            </div>
            <span className="park-live2d__signal">
              <Activity size={16} aria-hidden />
              {rosterLoaded ? `${clowns.length} 只小丑在线` : "同步小丑中"}
            </span>
          </div>

          {isAdmin ? (
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
          ) : (
            <div className="park-user-stat-grid" aria-label="广场状态">
              <div>
                <strong>{clowns.length}</strong>
                <span>同校小丑</span>
              </div>
              <div>
                <strong>{waitingCount}</strong>
                <span>待接气球</span>
              </div>
              <div>
                <strong>{relayCount}</strong>
                <span>已回应</span>
              </div>
            </div>
          )}

          {isAdmin ? (
            <div className="park-direction-strip" aria-label="当前产品方向">
              <div>
                <span>确认方向</span>
                <strong>现场多人小丑替身社交</strong>
              </div>
              <p>不是静态地图，也不是 3D 形象秀。核心是让现场小丑投放气球，由其他小丑接力回应，持续产生可回放事件。</p>
            </div>
          ) : (
            <div className="park-user-intent-strip" aria-label="社交玩法说明">
              <span>用户端</span>
              <strong>发一颗气球，等一个轻轻的回应</strong>
              <p>这里不展示后台队列和回放池，只保留你需要的社交动作。</p>
            </div>
          )}

          <div className={`park-map-stage ${isAdmin ? "park-map-stage--single" : ""}`}>
            <div
              ref={mapViewportRef}
              className="park-map2d"
              aria-label="两江校区可缩放直播地图"
              onWheel={handleMapWheel}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={handleMapPointerEnd}
              onPointerCancel={handleMapPointerEnd}
              onDoubleClick={handleMapDoubleClick}
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

                {liangjiangPois.map((poi) => (
                  <button
                    key={poi.id}
                    type="button"
                    className={`park-poi-pin park-poi-pin--${poi.type}`}
                    aria-label={poi.label}
                    data-active={poiIsFocused(poi)}
                    style={styleForMapPoint(poi.mapPoint)}
                    onClick={() => selectPoi(poi)}
                  />
                ))}

                {visibleEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="park-event-bubble2d"
                    data-active={eventIsFocused(event)}
                    data-status={event.status}
                    style={styleForMapPoint(getEventMapPosition(event, displayClowns))}
                    onClick={() => selectEvent(event)}
                  >
                    <strong>{event.title}</strong>
                    <span>{eventTypeText[event.type]}</span>
                  </button>
                ))}

                {displayClowns.map((clown) => (
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
                    ) : clown.avatarRecipe ? (
                      <PixelAvatarBadge recipe={clown.avatarRecipe} compact label={clown.name} />
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

              {!isAdmin && activeJoker ? <div className="park-map2d__move-hint">双击空地图移动我的小丑</div> : null}
            </div>

            {!isAdmin ? (
              <aside className="park-map-status-rail" aria-label="地图状态栏">
                <LocationChatPanel
                  zone={activeChatZone}
                  currentJoker={activeJoker}
                  occupancy={activeZoneOccupancy}
                  privateUnlocks={chatUnlocks}
                  onOpenPrivateChat={(joker) => {
                    setSelected({ kind: "clown", id: joker.id });
                    void openPrivateChatForJoker(joker.id);
                  }}
                />

                <aside
                  className="park-map2d__activity-screen"
                  aria-label="连接动态滚动屏"
                  onPointerDown={(event) => event.stopPropagation()}
                  onWheel={(event) => event.stopPropagation()}
                >
                  <div className="park-map2d__activity-head">
                    <span className="pixel-kicker">LINK LIVE</span>
                    <strong>连接动态</strong>
                  </div>
                  <div className="park-map2d__activity-list">
                    {visibleEvents.length > 0 ? (
                      visibleEvents.slice().reverse().map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          data-active={eventIsFocused(event)}
                          onClick={() => selectEvent(event)}
                        >
                          <span>{timeLabel(event.createdAt)}</span>
                          <strong>{connectionFeedText(event)}</strong>
                          <small>{event.summary}</small>
                        </button>
                      ))
                    ) : (
                      <p className="park-map2d__activity-empty">等待第一条连接动态</p>
                    )}
                  </div>
                </aside>

                <div className="park-map2d__focus" aria-live="polite">
                  <small>{focusedEvent ? eventMeta(focusedEvent) : "两江校区"}</small>
                  <strong>{focusedEvent?.title ?? "等待第一场互动"}</strong>
                  <span>{focusedEvent?.summary ?? "加入游园或投放情绪气球后，这里会同步高亮。"}</span>
                  {focusedEventPoi ? <em>{focusedEventPoi.note}</em> : null}
                </div>
              </aside>
            ) : null}
          </div>

          <section className="park-favorite-board" aria-label="小丑喜爱排行榜">
            <div className="park-favorite-board__header">
              <div>
                <span className="pixel-kicker">FAVORITES</span>
                <div className="park-favorite-title-row">
                  <h2>小丑人气榜</h2>
                  <span>共 {rankedClowns.length} 只</span>
                </div>
                <p>口头禅来自灵魂草案 / 入园档案；每人只能投一票，点一下投票，再点一下取消。</p>
              </div>
              <Trophy color="var(--color-coin)" aria-hidden />
            </div>

            <div className="park-favorite-list" data-empty={rankedClowns.length === 0}>
              {rankedClowns.length === 0 ? (
                <div className="park-event-empty">还没有用户小丑入园。从灵魂工坊生成小丑，或扫码恢复入园后，这里会实时开榜。</div>
              ) : (
                rankedClowns.map(({ clown, votes }, index) => {
                  const isWinner = index === 0;
                  const voted = voteSummary.voted_clown_id === clown.id;
                  return (
                    <article className="park-favorite-row" data-winner={isWinner} data-voted={voted} key={clown.id}>
                      <div className="park-favorite-row__sprite" aria-hidden>
                        <ClownSprite
                          spriteUrl={clown.spriteUrl}
                          previewUrl={clown.image}
                          frameSize={clown.frameSize}
                          actions={clown.spriteActions}
                          action={isWinner ? "special" : "walk-front"}
                          size={62}
                          label={clown.name}
                          fallback={(
                            <span className="park-clown-sprite" aria-hidden>
                              <i className="park-clown-sprite__hat" />
                              <i className="park-clown-sprite__head" />
                              <i className="park-clown-sprite__body" />
                            </span>
                          )}
                        />
                      </div>
                      <strong className="park-favorite-row__name">
                        {isWinner ? "最喜爱小丑 · " : `NO.${index + 1} · `}
                        {clown.name}
                      </strong>
                      <p className="park-favorite-row__catchphrase">“{clown.catchphrase ?? clown.line}”</p>
                      <button
                        type="button"
                        className="park-favorite-row__vote"
                        data-voted={voted}
                        aria-pressed={voted}
                        disabled={voteSubmittingId !== null}
                        onClick={() => void toggleFavoriteVote(clown.id)}
                      >
                        <Heart size={15} aria-hidden />
                        <span>{voted ? "取消" : "投票"}</span>
                        <strong>{votes}</strong>
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          {!isAdmin ? (
            <section className="park-user-dock" aria-label="气球社交操作">
              <div className="park-user-dock__intro">
                <span className="pixel-kicker">SOCIAL MODE</span>
                <h2>把今天交给一颗气球</h2>
                <p>用户端只保留轻社交动作：加入广场、投放心情、接住别人的气球。</p>
              </div>

              <div className="park-user-dock__actions">
                <button type="button" className="primary-button" onClick={handleJoin}>
                  <UserPlus size={17} aria-hidden />
                  加入广场
                </button>
                <button type="button" className="park-reply-button" disabled={commandLoading || !rosterLoaded} onClick={() => void openReplyComposer({ eventId: waitingEvent?.id })}>
                  <Reply size={16} aria-hidden />
                  {waitingEvent ? "接住一个气球" : "随机匹配气球"}
                </button>
              </div>

              {activeJoker ? (
                <form className="park-user-balloon-form" onSubmit={handleDropBalloon}>
                  <label className="field">
                    <span>气球心情</span>
                    <select value={mood} onChange={(event) => setMood(event.target.value)}>
                      {moodOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>一句短话</span>
                    <input
                      value={balloonText}
                      maxLength={32}
                      onChange={(event) => setBalloonText(event.target.value)}
                      placeholder="今天想轻轻打个招呼"
                    />
                  </label>
                  <button type="submit" className="secondary-button" disabled={commandLoading}>
                    <Send size={16} aria-hidden />
                    {commandLoading ? "投放中" : "投放气球"}
                  </button>
                </form>
              ) : (
                <div className="park-user-empty">
                  <strong>先拥有你的专属小丑</strong>
                  <span>去灵魂工坊生成形象后，就能用真实数据库小丑发气球和回应。</span>
                  <a className="secondary-button" href="/workshop">去灵魂工坊</a>
                </div>
              )}

              <div className="park-user-feed" aria-label="最近回应">
                <span className="pixel-kicker">LATEST</span>
                {latestEvents.slice(0, 3).map((event) => (
                  <button key={event.id} type="button" data-active={focusedEvent?.id === event.id} onClick={() => selectEvent(event)}>
                    <strong>{event.title}</strong>
                    <span>{event.summary}</span>
                  </button>
                ))}
              </div>

              {commandError ? <p className="error park-user-error">{commandError}</p> : null}
            </section>
          ) : null}
        </section>

        {isAdmin ? (
          <aside className="park-live2d__side" aria-label="游园互动控制台">
          <section className="pixel-panel park-command-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">JOIN</span>
                <h2>多人互动</h2>
              </div>
            </div>

            <button type="button" className="primary-button" disabled={commandLoading} onClick={() => void handleLocateMyJoker()}>
              <UserPlus size={17} aria-hidden />
              定位我的小丑
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
              <button type="submit" className="secondary-button" disabled={!activeJoker || commandLoading}>
                <Send size={16} aria-hidden />
                {commandLoading ? "处理中" : "投放气球"}
              </button>
            </form>

            <button type="button" className="park-reply-button" disabled={!activeJoker || commandLoading} onClick={() => void openReplyComposer({ eventId: waitingEvent?.id })}>
              <Reply size={16} aria-hidden />
              {waitingEvent ? "接住一个气球" : "匹配一个气球"}
            </button>
            <button type="button" className="park-reply-button park-reply-button--batch" disabled={!activeJoker || waitingCount === 0 || commandLoading} onClick={handleReplyWave}>
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
                      <button
                        type="button"
                        className="park-event-row2d__reply"
                        disabled={commandLoading}
                        onClick={() =>
                          void openReplyComposer({
                            eventId: event.id,
                            targetOwnerId: event.from,
                            targetClownName: clownName(event.from)
                          })
                        }
                      >
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
                <div className="park-focus-card__actions">
                  {focusedChatUnlock ? (
                    <button className="park-chat-action" type="button" disabled={chatOpening} onClick={() => void openFocusedPrivateChat()}>
                      <MessageCircle size={16} aria-hidden />
                      {chatOpening ? "打开中" : "私聊"}
                    </button>
                  ) : null}
                  {!activeJoker ? (
                    <small>先定位我的小丑，再接其他小丑的气球。</small>
                  ) : focusedClownIsDemo ? (
                    <small>Demo 小丑没有真实待接气球，换一个现场小丑试试。</small>
                  ) : focusedClownIsSelf ? (
                    <small>这是你自己的小丑，不能接自己的气球。</small>
                  ) : (
                    <button
                      type="button"
                      className="park-focus-card__reply"
                      disabled={!canReplyToFocusedClown || commandLoading}
                      onClick={() =>
                        void openReplyComposer({
                          targetOwnerId: focusedClown.id,
                          targetClownName: focusedClown.name
                        })
                      }
                    >
                      <Reply size={15} aria-hidden />
                      接这个小丑的气球
                    </button>
                  )}
                </div>
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
        ) : null}
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
              <button className="primary-button" type="button" disabled={!activeJoker || commandLoading || replyDraft.cheerText.trim().length === 0} onClick={() => void submitReplyComposer()}>
                <Send size={16} aria-hidden />
                送出回应
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {activeChatRoom && activeJoker ? (
        <ChatRoom room={activeChatRoom} currentJoker={activeJoker} onClose={() => setActiveChatRoom(null)} />
      ) : null}
    </section>
  );
}
