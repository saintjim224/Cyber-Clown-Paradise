"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, type AvatarRecipe, type Balloon, type HealAction, type Joker, type MatchResult } from "@/lib/api";
import {
  liangjiangMapImage,
  liangjiangPois,
  type DemoClown,
  type ImagePointTuple,
  type LiangjiangPoi,
  type LngLatTuple,
  type SocialEvent
} from "@/lib/socialMapData";

type Energy = DemoClown["energy"];

type DropBalloonOptions = {
  text: string;
  mood: string;
  balloon?: Balloon;
  senderId?: string;
};

type ReplyOptions = {
  eventId: string;
  responderId?: string;
  match?: MatchResult;
  action?: HealAction;
};

type UseLiveSocialEventsResult = {
  clowns: DemoClown[];
  events: SocialEvent[];
  activeEvent: SocialEvent | null;
  rosterLoaded: boolean;
  joinPark: () => DemoClown;
  joinWave: (count?: number) => DemoClown[];
  dropBalloon: (options: DropBalloonOptions) => SocialEvent;
  ensureMatchedBalloon: (match: MatchResult) => SocialEvent;
  replyToEvent: (options: ReplyOptions) => void;
  replyWaitingBalloons: () => void;
  focusEvent: (eventId: string) => void;
  addJokerToPark: (joker: Joker) => DemoClown;
};

const nicknames = ["纸杯礼帽", "红鼻便利贴", "星星鞋带", "汽水泡泡", "午后鼓点", "薄荷口哨", "奶油信封", "像素风筝"];
const roles = ["气球投手", "接力回应", "低压搭话", "路线观察", "回放记录", "掌声补给"];
const palette = [
  ["#e23d2f", "#ffd84a"],
  ["#2c67c7", "#9be36d"],
  ["#ff5f8f", "#27f5d4"],
  ["#26b86d", "#ffe096"],
  ["#f08a24", "#b7f7ff"],
  ["#7c5cff", "#ffd84a"]
] as const;
const replyLines = ["接住了，先不用解释。", "我在这边挥手。", "收到，给你留个座。", "我替你说一句你好。", "这颗气球很轻。"];
const tickTitles = ["擦肩挥手", "广场接力", "湖边短句", "操场鼓点", "食堂碰头", "回放贴纸"];
const tickLines = [
  "两个小丑交换了一句短短的问候。",
  "一只气球被接住，又轻轻递回去。",
  "有人在旁边陪走了十几步。",
  "鼓掌声从操场传到广场。",
  "一张回访贴纸被放进时间线。"
];
const tickTypes: SocialEvent["type"][] = ["wave", "walk", "cheer", "reply", "gift"];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function poiById(id: string): LiangjiangPoi {
  return liangjiangPois.find((poi) => poi.id === id) ?? liangjiangPois[0];
}

function nowIso() {
  return new Date().toISOString();
}

function offsetMapPoint(point: ImagePointTuple, scale = 28): ImagePointTuple {
  return [
    Math.max(24, Math.min(liangjiangMapImage.width - 24, Math.round(point[0] + (Math.random() - 0.5) * scale))),
    Math.max(24, Math.min(liangjiangMapImage.height - 24, Math.round(point[1] + (Math.random() - 0.5) * scale)))
  ];
}

function offsetPosition(position: LngLatTuple, scale = 0.00018): LngLatTuple {
  return [
    Number((position[0] + (Math.random() - 0.5) * scale).toFixed(6)),
    Number((position[1] + (Math.random() - 0.5) * scale).toFixed(6))
  ];
}

function nearestPoi(position: LngLatTuple): LiangjiangPoi {
  return liangjiangPois.reduce((nearest, poi) => {
    const bestDistance = Math.hypot(nearest.position[0] - position[0], nearest.position[1] - position[1]);
    const distance = Math.hypot(poi.position[0] - position[0], poi.position[1] - position[1]);
    return distance < bestDistance ? poi : nearest;
  }, poiById("lj-main-gate"));
}

function makeJoinClown(index: number): DemoClown {
  const [color, accent] = palette[index % palette.length];
  const energy = randomItem<Energy>(["I", "E", "A"]);
  const spawnPoi = randomItem([poiById("lj-main-gate"), poiById("lj-roman-square"), poiById("lj-north-canteen")]);

  return {
    id: `guest-clown-${Date.now()}-${index}`,
    name: `${randomItem(nicknames)}${index}`,
    role: randomItem(roles),
    energy,
    status: "刚进园，正在找第一颗气球",
    line: energy === "I" ? "我先在旁边看一会儿。" : "我可以先替你挥手。",
    action: "加入两江校区实时游园",
    position: offsetPosition(spawnPoi.position, 0.00026),
    mapPoint: offsetMapPoint(spawnPoi.mapPoint, 36),
    color,
    accent
  };
}

function makeFallbackAvatarRecipe(joker: Joker, index: number): AvatarRecipe {
  const [primary, accent] = palette[index % palette.length];
  const paletteTokens = joker.style_tokens?.palette ?? {
    primary,
    secondary: joker.social_energy === "I" ? "#2c67c7" : "#ff5f8f",
    accent
  };

  return {
    art_version: "native-clown-v1",
    palette: paletteTokens,
    head_scale: joker.social_energy === "I" ? 0.96 : 1.08,
    body_scale: joker.social_energy === "I" ? 0.94 : 1.04,
    eye_spacing: 0.42 + index % 4 * 0.08,
    eye_size: joker.social_energy === "I" ? 0.48 : 0.62,
    nose_scale: 0.46 + index % 3 * 0.12,
    cheek_scale: joker.social_energy === "I" ? 0.52 : 0.72,
    mouth_width: joker.social_energy === "I" ? 0.42 : 0.7,
    hat_height: 0.45 + index % 5 * 0.08,
    hat_tilt: 0.36 + index % 5 * 0.07,
    motion_style: joker.style_tokens?.motion ?? "gentle-float",
    material: joker.style_tokens?.material ?? "soft-vinyl"
  };
}

function makeJokerClown(joker: Joker, index: number): DemoClown {
  const paletteTokens = joker.style_tokens?.palette;
  const avatarRecipe = joker.avatar_recipe ?? makeFallbackAvatarRecipe(joker, index);
  const spawnPois = joker.social_energy === "I"
    ? [poiById("lj-yuxiu-lake"), poiById("lj-library"), poiById("lj-north-dorm")]
    : [poiById("lj-roman-square"), poiById("lj-north-sport-field"), poiById("lj-main-gate")];
  const spawnPoi = spawnPois[index % spawnPois.length];
  const sampleLine = joker.soul_profile?.sample_lines?.[0] ?? joker.verdict;

  return {
    id: joker.id,
    name: joker.nickname || `${joker.mbti} 小丑`,
    role: joker.social_energy === "I" ? "低压游园" : "主动破冰",
    energy: joker.social_energy,
    status: "来自数据库的小丑形象",
    line: sampleLine,
    action: "正在两江校区地图里替用户接力互动",
    position: offsetPosition(spawnPoi.position, 0.00018 + index * 0.000006),
    mapPoint: offsetMapPoint(spawnPoi.mapPoint, 52 + index * 5),
    color: paletteTokens?.primary ?? palette[index % palette.length][0],
    accent: paletteTokens?.accent ?? palette[index % palette.length][1],
    image: joker.avatar_recipe?.preview_url,
    spriteUrl: joker.avatar_recipe?.sprite_url,
    frameSize: joker.avatar_recipe?.frame_size,
    spriteActions: joker.avatar_recipe?.actions,
    avatarRecipe
  };
}

function makeRosterEvents(clowns: DemoClown[]): SocialEvent[] {
  return clowns.slice(0, 18).map((clown, index) => {
    const poi = nearestPoi(clown.position);
    return {
      id: `roster-${clown.id}`,
      title: index === 0 ? "数据库小丑入园" : "小丑形象同步",
      from: clown.id,
      poiId: poi.id,
      summary: `${clown.name} 已从数据库同步到乐园地图。`,
      type: index % 3 === 0 ? "wave" : index % 3 === 1 ? "cheer" : "walk",
      moodDelta: 1 + index % 3,
      createdAt: nowIso(),
      status: index === 0 ? "live" : "done",
      path: [clown.position, poi.position],
      mapPath: [clown.mapPoint, poi.mapPoint]
    };
  });
}

function withBoundedEvents(events: SocialEvent[]) {
  return events.slice(-48);
}

function makeReplyEvents(
  currentEvent: SocialEvent,
  currentClowns: DemoClown[],
  responderId?: string,
  action?: HealAction
): [SocialEvent, SocialEvent] | null {
  const candidates = currentClowns.filter((clown) => clown.id !== currentEvent.from);
  if (currentClowns.length === 0 || candidates.length === 0) return null;

  const responder = currentClowns.find((clown) => clown.id === responderId) ?? randomItem(candidates);
  const from = currentClowns.find((clown) => clown.id === currentEvent.from);
  const line = action?.cheer_text ?? randomItem(replyLines);
  const replied: SocialEvent = {
    ...currentEvent,
    to: responder.id,
    title: currentEvent.type === "balloon" ? "气球被接住" : "接力回应",
    summary: `${responder.name} 回应：“${line}”`,
    type: "reply",
    moodDelta: currentEvent.moodDelta + 2,
    createdAt: nowIso(),
    status: "done",
    path: from ? [from.position, responder.position] : currentEvent.path,
    mapPath: from ? [from.mapPoint, responder.mapPoint] : currentEvent.mapPath
  };
  const replay: SocialEvent = {
    id: makeId("replay"),
    title: "生成回放",
    from: responder.id,
    to: currentEvent.from,
    poiId: currentEvent.poiId,
    summary: `${responder.name} 把这次回应放进回放墙。`,
    type: "gift",
    moodDelta: 1,
    createdAt: nowIso(),
    status: "replay",
    path: replied.path,
    mapPath: replied.mapPath
  };

  return [replied, replay];
}

export function useLiveSocialEvents(): UseLiveSocialEventsResult {
  const [clowns, setClowns] = useState<DemoClown[]>([]);
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState("");
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const clownsRef = useRef(clowns);
  const eventsRef = useRef(events);
  const joinedCountRef = useRef(0);
  const tickCountRef = useRef(0);

  useEffect(() => {
    clownsRef.current = clowns;
  }, [clowns]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    let cancelled = false;

    async function loadJokerRoster() {
      try {
        const jokers = await apiFetch<Joker[]>("/api/park/jokers");
        if (cancelled) return;
        const rosterClowns = jokers.map((joker, index) => makeJokerClown(joker, index));
        const rosterEvents = makeRosterEvents(rosterClowns);
        clownsRef.current = rosterClowns;
        eventsRef.current = rosterEvents;
        setClowns(rosterClowns);
        setEvents(rosterEvents);
        setActiveEventId(rosterEvents.find((event) => event.status === "live")?.id ?? rosterEvents[0]?.id ?? "");
      } catch {
        if (!cancelled) {
          setClowns([]);
          setEvents([]);
          setActiveEventId("");
        }
      } finally {
        if (!cancelled) setRosterLoaded(true);
      }
    }

    void loadJokerRoster();

    return () => {
      cancelled = true;
    };
  }, []);

  const focusEvent = useCallback((eventId: string) => {
    setActiveEventId(eventId);
  }, []);

  const addJokerToPark = useCallback((joker: Joker) => {
    const existing = clownsRef.current.find((clown) => clown.id === joker.id);
    if (existing) return existing;

    const clown = makeJokerClown(joker, clownsRef.current.length + 1);
    const poi = nearestPoi(clown.position);
    const event: SocialEvent = {
      id: makeId("joker"),
      title: "专属小丑入园",
      from: clown.id,
      poiId: poi.id,
      summary: `${clown.name} 从灵魂工坊进入两江校区，先做了一段专属动作。`,
      type: "wave",
      moodDelta: 2,
      createdAt: nowIso(),
      status: "live",
      path: [clown.position, poi.position],
      mapPath: [clown.mapPoint, poi.mapPoint]
    };

    setClowns((current) => (current.some((item) => item.id === clown.id) ? current : [...current, clown]));
    setEvents((current) =>
      withBoundedEvents([
        ...current.map((item) => (item.status === "live" ? { ...item, status: "done" as const } : item)),
        event
      ])
    );
    setActiveEventId(event.id);
    return clown;
  }, []);

  const joinPark = useCallback(() => {
    joinedCountRef.current += 1;
    const clown = makeJoinClown(joinedCountRef.current);
    const poi = nearestPoi(clown.position);
    const event: SocialEvent = {
      id: makeId("join"),
      title: "新朋友入园",
      from: clown.id,
      poiId: poi.id,
      summary: `${clown.name} 从 ${poi.label} 加入，先挥了挥手。`,
      type: "wave",
      moodDelta: 1,
      createdAt: nowIso(),
      status: "live",
      path: [clown.position, poi.position],
      mapPath: [clown.mapPoint, poi.mapPoint]
    };

    setClowns((current) => [...current, clown]);
    setEvents((current) =>
      withBoundedEvents([
        ...current.map((item) => (item.status === "live" ? { ...item, status: "done" as const } : item)),
        event
      ])
    );
    setActiveEventId(event.id);
    return clown;
  }, []);

  const joinWave = useCallback((count = 8) => {
    const nextClowns = Array.from({ length: Math.max(1, Math.min(count, 18)) }, () => {
      joinedCountRef.current += 1;
      return makeJoinClown(joinedCountRef.current);
    });
    const waveEvents = nextClowns.slice(0, 6).map((clown, index): SocialEvent => {
      const poi = nearestPoi(clown.position);
      return {
        id: makeId(`wave-${index}`),
        title: index === 0 ? "一队小丑入园" : "现场人流加入",
        from: clown.id,
        poiId: poi.id,
        summary: `${clown.name} 从 ${poi.label} 加入，现场热度升了一格。`,
        type: index % 2 === 0 ? "wave" : "cheer",
        moodDelta: 1 + index % 2,
        createdAt: nowIso(),
        status: index === 0 ? "live" : "done",
        path: [clown.position, poi.position],
        mapPath: [clown.mapPoint, poi.mapPoint]
      };
    });

    setClowns((current) => [...current, ...nextClowns]);
    setEvents((current) =>
      withBoundedEvents([
        ...current.map((item) => (item.status === "live" ? { ...item, status: "done" as const } : item)),
        ...waveEvents
      ])
    );
    if (waveEvents.length > 0) setActiveEventId(waveEvents[0].id);
    return nextClowns;
  }, []);

  const dropBalloon = useCallback((options: DropBalloonOptions) => {
    const text = options.text.trim().slice(0, 32) || options.mood;
    const currentClowns = clownsRef.current;
    const sender = currentClowns.find((clown) => clown.id === options.senderId) ??
      currentClowns.find((clown) => clown.id.startsWith("guest-clown")) ??
      currentClowns[0];
    const poi = randomItem([poiById("lj-roman-square"), poiById("lj-yuxiu-lake"), poiById("lj-north-sport-field")]);
    const event: SocialEvent = {
      id: options.balloon?.id ?? makeId("balloon"),
      title: `${options.mood}气球`,
      from: sender?.id ?? options.senderId ?? "unknown-joker",
      poiId: poi.id,
      summary: `${sender?.name ?? "现场小丑"} 投放：“${options.balloon?.safe_summary ?? text}”`,
      type: "balloon",
      moodDelta: 1,
      createdAt: nowIso(),
      status: "waiting",
      path: sender ? [sender.position, poi.position] : [poi.position],
      mapPath: sender ? [sender.mapPoint, poi.mapPoint] : [poi.mapPoint]
    };

    setEvents((current) => withBoundedEvents([...current, event]));
    setActiveEventId(event.id);
    return event;
  }, []);

  const ensureMatchedBalloon = useCallback((match: MatchResult) => {
    const existing = eventsRef.current.find((event) => event.id === match.balloon_id);
    if (existing) return existing;

    const currentClowns = clownsRef.current;
    const owner = currentClowns.find((clown) => clown.id === match.owner_id);
    const poi = randomItem([poiById("lj-roman-square"), poiById("lj-yuxiu-lake"), poiById("lj-north-sport-field")]);
    const event: SocialEvent = {
      id: match.balloon_id,
      title: "待接力气球",
      from: match.owner_id,
      poiId: poi.id,
      summary: owner ? `${owner.name} 投放了一颗气球，等待接力回应。` : match.prompt,
      type: "balloon",
      moodDelta: 1,
      createdAt: nowIso(),
      status: "waiting",
      path: owner ? [owner.position, poi.position] : [poi.position],
      mapPath: owner ? [owner.mapPoint, poi.mapPoint] : [poi.mapPoint]
    };

    eventsRef.current = withBoundedEvents([...eventsRef.current, event]);
    setEvents((current) => withBoundedEvents([...current, event]));
    setActiveEventId(event.id);
    return event;
  }, []);

  const replyToEvent = useCallback(({ eventId, responderId, match, action }: ReplyOptions) => {
    const currentClowns = clownsRef.current;
    const currentEvent = eventsRef.current.find((event) => event.id === eventId) ??
      eventsRef.current.find((event) => event.id === match?.balloon_id);
    if (!currentEvent) return;

    const replyEvents = makeReplyEvents(currentEvent, currentClowns, responderId, action);
    if (!replyEvents) return;
    const [replied, replay] = replyEvents;

    setEvents((current) => withBoundedEvents([...current.map((event) => (event.id === eventId ? replied : event)), replay]));
    setActiveEventId(replied.id);
  }, []);

  const replyWaitingBalloons = useCallback(() => {
    const currentClowns = clownsRef.current;
    const waitingEvents = eventsRef.current.filter((event) => event.status === "waiting").slice(0, 4);
    if (waitingEvents.length === 0) return;

    const updates = new Map<string, SocialEvent>();
    const replays: SocialEvent[] = [];
    waitingEvents.forEach((event) => {
      const replyEvents = makeReplyEvents(event, currentClowns);
      if (!replyEvents) return;
      const [replied, replay] = replyEvents;
      updates.set(event.id, replied);
      replays.push(replay);
    });

    if (updates.size === 0) return;
    setEvents((current) => withBoundedEvents([...current.map((event) => updates.get(event.id) ?? event), ...replays]));
    const lastReplied = Array.from(updates.values()).at(-1);
    if (lastReplied) setActiveEventId(lastReplied.id);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentClowns = clownsRef.current;
      if (currentClowns.length < 2) return;

      tickCountRef.current += 1;
      const from = randomItem(currentClowns);
      const targetPool = currentClowns.filter((clown) => clown.id !== from.id);
      const to = randomItem(targetPool);
      const poi = nearestPoi(to.position);
      const event: SocialEvent = {
        id: makeId("auto"),
        title: randomItem(tickTitles),
        from: from.id,
        to: to.id,
        poiId: poi.id,
        summary: randomItem(tickLines),
        type: randomItem(tickTypes),
        moodDelta: 1 + tickCountRef.current % 3,
        createdAt: nowIso(),
        status: "live",
        path: [from.position, offsetPosition(poi.position, 0.00016), to.position],
        mapPath: [from.mapPoint, offsetMapPoint(poi.mapPoint, 26), to.mapPoint]
      };

      setEvents((current) =>
        withBoundedEvents([
          ...current.map((item) => (item.status === "live" ? { ...item, status: "done" as const } : item)),
          event
        ])
      );
      setActiveEventId(event.id);
    }, 6500);

    return () => window.clearInterval(timer);
  }, []);

  const activeEvent = events.find((event) => event.id === activeEventId) ?? events[events.length - 1] ?? null;

  return {
    clowns,
    events,
    activeEvent,
    rosterLoaded,
    joinPark,
    joinWave,
    dropBalloon,
    ensureMatchedBalloon,
    replyToEvent,
    replyWaitingBalloons,
    focusEvent,
    addJokerToPark
  };
}
