"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Balloon, HealAction, Joker, MatchResult } from "@/lib/api";
import { getClownAssets } from "@/lib/clownAssets";
import {
  demoClowns,
  demoEvents,
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
  joinPark: () => DemoClown;
  joinWave: (count?: number) => DemoClown[];
  dropBalloon: (options: DropBalloonOptions) => SocialEvent;
  ensureMatchedBalloon: (match: MatchResult) => SocialEvent;
  replyToEvent: (options: ReplyOptions) => void;
  replyWaitingBalloons: () => void;
  focusEvent: (eventId: string) => void;
  addJokerToPark: (joker: Joker) => DemoClown;
  syncParkJokers: (jokers: Joker[]) => DemoClown[];
};

const nicknames = ["纸杯礼帽", "红鼻便利贴", "星星鞋带", "汽水泡泡", "午后鼓点", "薄荷口哨", "奶油信封", "像素风筝"];
const roles = ["气球投手", "接力回应", "低压搭话", "路线观察", "回放记录", "掌声补给"];
const catchphrases = [
  "我先把尴尬打个蝴蝶结。",
  "别急，今天先赢一厘米。",
  "坏运气排队，我先插个队。",
  "我替你挥手，不替你越界。",
  "接住这句，电量慢慢回来。",
  "先别慌，我把沉默折成气球。"
];
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

function poiById(id: string): LiangjiangPoi {
  return liangjiangPois.find((poi) => poi.id === id) ?? liangjiangPois[0];
}

function findPoiById(id: string | null | undefined): LiangjiangPoi | undefined {
  return id ? liangjiangPois.find((poi) => poi.id === id) : undefined;
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

function stableOffsetMapPoint(point: ImagePointTuple, seed: string, scale = 20): ImagePointTuple {
  return [
    Math.max(24, Math.min(liangjiangMapImage.width - 24, Math.round(point[0] + (stableUnit(seed, 1) - 0.5) * scale))),
    Math.max(24, Math.min(liangjiangMapImage.height - 24, Math.round(point[1] + (stableUnit(seed, 2) - 0.5) * scale)))
  ];
}

function stableOffsetPosition(position: LngLatTuple, seed: string, scale = 0.00008): LngLatTuple {
  return [
    Number((position[0] + (stableUnit(seed, 3) - 0.5) * scale).toFixed(6)),
    Number((position[1] + (stableUnit(seed, 4) - 0.5) * scale).toFixed(6))
  ];
}

function nearestPoi(position: LngLatTuple): LiangjiangPoi {
  return liangjiangPois.reduce((nearest, poi) => {
    const bestDistance = Math.hypot(nearest.position[0] - position[0], nearest.position[1] - position[1]);
    const distance = Math.hypot(poi.position[0] - position[0], poi.position[1] - position[1]);
    return distance < bestDistance ? poi : nearest;
  }, poiById("lj-main-gate"));
}

function defaultJokerPoi(joker: Joker): LiangjiangPoi {
  return joker.social_energy === "I" ? poiById("lj-yuxiu-lake") : poiById("lj-roman-square");
}

function jokerSpawnPoi(joker: Joker): LiangjiangPoi {
  return findPoiById(joker.desired_poi_id) ?? defaultJokerPoi(joker);
}

function clownHomePoi(clown: DemoClown): LiangjiangPoi {
  return findPoiById(clown.homePoiId) ?? nearestPoi(clown.position);
}

function makeJoinClown(index: number): DemoClown {
  const [color, accent] = palette[index % palette.length];
  const energy = randomItem<Energy>(["I", "E", "A"]);
  const spawnPoi = randomItem([poiById("lj-main-gate"), poiById("lj-roman-square"), poiById("lj-north-canteen")]);
  const assetPool = energy === "I" ? "I" : "E";
  const asset = randomItem(getClownAssets(assetPool));
  const catchphrase = randomItem(catchphrases);

  return {
    id: `guest-clown-${Date.now()}-${index}`,
    name: `${randomItem(nicknames)}${index}`,
    role: randomItem(roles),
    energy,
    status: "刚进园，正在找第一颗气球",
    line: energy === "I" ? "我先在旁边看一会儿。" : "我可以先替你挥手。",
    catchphrase,
    homePoiId: spawnPoi.id,
    action: "加入两江校区实时游园",
    position: offsetPosition(spawnPoi.position, 0.00026),
    mapPoint: offsetMapPoint(spawnPoi.mapPoint, 36),
    color,
    accent,
    image: asset?.preview_url,
    spriteUrl: asset?.sprite_url,
    frameSize: asset?.frame_size,
    spriteActions: asset?.actions
  };
}

function makeJokerClown(joker: Joker, index: number): DemoClown {
  const paletteTokens = joker.style_tokens?.palette;
  const spawnPoi = jokerSpawnPoi(joker);
  const offsetSeed = `${joker.id}:${joker.desired_poi_id ?? spawnPoi.id}`;
  const sampleLine = joker.soul_profile?.sample_lines?.[0] ?? joker.verdict;

  return {
    id: joker.id,
    name: joker.nickname || `${joker.social_energy} 人小丑`,
    role: joker.social_energy === "I" ? "低压游园" : "主动破冰",
    energy: joker.social_energy,
    status: "刚从灵魂工坊进入两江校区",
    line: sampleLine,
    catchphrase: joker.soul_profile?.catchphrase ?? sampleLine,
    homePoiId: spawnPoi.id,
    action: "正在播放自己的专属动作，准备加入实时游园",
    position: stableOffsetPosition(spawnPoi.position, offsetSeed),
    mapPoint: stableOffsetMapPoint(spawnPoi.mapPoint, offsetSeed),
    color: paletteTokens?.primary ?? palette[index % palette.length][0],
    accent: paletteTokens?.accent ?? palette[index % palette.length][1],
    image: joker.avatar_recipe?.preview_url,
    spriteUrl: joker.avatar_recipe?.sprite_url,
    frameSize: joker.avatar_recipe?.frame_size,
    spriteActions: joker.avatar_recipe?.actions
  };
}

function refreshJokerClown(existing: DemoClown, joker: Joker, index: number): DemoClown {
  const refreshed = makeJokerClown(joker, index);
  return {
    ...existing,
    name: refreshed.name,
    role: refreshed.role,
    energy: refreshed.energy,
    status: refreshed.status,
    line: refreshed.line,
    catchphrase: refreshed.catchphrase,
    homePoiId: refreshed.homePoiId,
    action: refreshed.action,
    position: refreshed.position,
    mapPoint: refreshed.mapPoint,
    color: refreshed.color,
    accent: refreshed.accent,
    image: refreshed.image,
    spriteUrl: refreshed.spriteUrl,
    frameSize: refreshed.frameSize,
    spriteActions: refreshed.spriteActions
  };
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
    summary: `${responder.name}回应：“${line}”`,
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
    summary: `${responder.name}把这次回应放进回放墙。`,
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
  const [clowns, setClowns] = useState<DemoClown[]>(demoClowns);
  const [events, setEvents] = useState<SocialEvent[]>(demoEvents);
  const [activeEventId, setActiveEventId] = useState(demoEvents.find((event) => event.status === "live")?.id ?? demoEvents[0]?.id ?? "");
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

  const focusEvent = useCallback((eventId: string) => {
    setActiveEventId(eventId);
  }, []);

  const addJokerToPark = useCallback((joker: Joker) => {
    const existing = clownsRef.current.find((clown) => clown.id === joker.id);
    if (existing) return existing;

    const clown = makeJokerClown(joker, clownsRef.current.length + 1);
    const poi = clownHomePoi(clown);
    const event: SocialEvent = {
      id: makeId("joker"),
      title: "专属小丑入园",
      from: clown.id,
      poiId: poi.id,
      summary: `${clown.name}从灵魂工坊进入两江校区，先做了一段专属动作。`,
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

  const syncParkJokers = useCallback((jokers: Joker[]) => {
    const incoming = jokers.filter((joker) => joker.id);
    if (incoming.length === 0) return [];

    const current = clownsRef.current;
    const byId = new Map(current.map((clown) => [clown.id, clown]));
    const next = [...current];
    const added: DemoClown[] = [];
    let changed = false;

    incoming.forEach((joker, index) => {
      const existing = byId.get(joker.id);
      if (existing) {
        const existingIndex = next.findIndex((clown) => clown.id === joker.id);
        if (existingIndex >= 0) {
          next[existingIndex] = refreshJokerClown(existing, joker, current.length + index + 1);
          changed = true;
        }
        return;
      }

      const clown = makeJokerClown(joker, next.length + 1);
      next.push(clown);
      byId.set(clown.id, clown);
      added.push(clown);
      changed = true;
    });

    if (!changed) return [];

    clownsRef.current = next;
    setClowns(next);

    if (added.length > 0) {
      const syncEvents = added.slice(0, 4).map((clown, index): SocialEvent => {
        const poi = clownHomePoi(clown);
        return {
          id: makeId(`shared-joker-${index}`),
          title: index === 0 ? "其他小丑入园" : "共享小丑上线",
          from: clown.id,
          poiId: poi.id,
          summary: `${clown.name}也进入了两江实时游园，正在同步到现场排行榜。`,
          type: "wave",
          moodDelta: 1,
          createdAt: nowIso(),
          status: index === 0 ? "live" : "done",
          path: [clown.position, poi.position],
          mapPath: [clown.mapPoint, poi.mapPoint]
        };
      });

      setEvents((currentEvents) =>
        withBoundedEvents([
          ...currentEvents.map((item) => (item.status === "live" ? { ...item, status: "done" as const } : item)),
          ...syncEvents
        ])
      );
      if (syncEvents[0]) setActiveEventId(syncEvents[0].id);
    }

    return added;
  }, []);

  const joinPark = useCallback(() => {
    joinedCountRef.current += 1;
    const clown = makeJoinClown(joinedCountRef.current);
    const poi = clownHomePoi(clown);
    const event: SocialEvent = {
      id: makeId("join"),
      title: "新朋友入园",
      from: clown.id,
      poiId: poi.id,
      summary: `${clown.name}从${poi.label}加入，先挥了挥手。`,
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
      const poi = clownHomePoi(clown);
      return {
        id: makeId(`wave-${index}`),
        title: index === 0 ? "一队小丑入园" : "现场人流加入",
        from: clown.id,
        poiId: poi.id,
        summary: `${clown.name}从${poi.label}加入，现场热度升了一格。`,
        type: index % 2 === 0 ? "wave" : "cheer",
        moodDelta: 1 + (index % 2),
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
      from: sender.id,
      poiId: poi.id,
      summary: `${sender.name}投放：“${options.balloon?.safe_summary ?? text}”`,
      type: "balloon",
      moodDelta: 1,
      createdAt: nowIso(),
      status: "waiting",
      path: [sender.position, poi.position],
      mapPath: [sender.mapPoint, poi.mapPoint]
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
      summary: owner ? `${owner.name}投放了一颗气球，等待接力回应。` : match.prompt,
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
      const poi = clownHomePoi(to);
      const event: SocialEvent = {
        id: makeId("auto"),
        title: randomItem(tickTitles),
        from: from.id,
        to: to.id,
        poiId: poi.id,
        summary: randomItem(tickLines),
        type: randomItem(tickTypes),
        moodDelta: 1 + (tickCountRef.current % 3),
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
    joinPark,
    joinWave,
    dropBalloon,
    ensureMatchedBalloon,
    replyToEvent,
    replyWaitingBalloons,
    focusEvent,
    addJokerToPark,
    syncParkJokers
  };
}
