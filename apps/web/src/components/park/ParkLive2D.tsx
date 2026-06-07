"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle, Clock, Heart, History, MapPin, Radio, Reply, Send, Sparkles, Trophy, X } from "lucide-react";
import { ClownSprite } from "@/components/pixel/ClownSprite";
import { LiangjiangRealtimeMap } from "@/components/park/LiangjiangRealtimeMap";
import { useLiveSocialEvents } from "@/hooks/useLiveSocialEvents";
import { clearActiveJoker, loadActiveJoker, saveActiveJoker } from "@/lib/clownAssets";
import { apiFetch, type Balloon, type ClownVoteSummary, type HealAction, type Joker, type MatchRequest, type MatchResult } from "@/lib/api";
import {
  eventStatusText,
  eventTypeText,
  liangjiangPois,
  poiTypeText,
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

type ReplyComposerOptions = {
  eventId?: string;
  preferredAction?: ReplyActionType;
  targetOwnerId?: string;
  targetClownName?: string;
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

function getEventPoi(event: SocialEvent) {
  return event.poiId ? liangjiangPois.find((item) => item.id === event.poiId) ?? null : null;
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

export function ParkLive2D() {
  const { clowns, events, activeEvent, dropBalloon, ensureMatchedBalloon, replyToEvent, focusEvent, addJokerToPark, syncParkJokers } = useLiveSocialEvents();
  const [selected, setSelected] = useState<Selection>({ kind: "event", id: activeEvent?.id ?? events[0]?.id ?? "" });
  const [activeModule, setActiveModule] = useState<SocialEvent["status"]>("live");
  const [balloonText, setBalloonText] = useState("");
  const [mood, setMood] = useState(moodOptions[0]);
  const [activeJoker, setActiveJoker] = useState<Joker | null>(null);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [voteSummary, setVoteSummary] = useState<ClownVoteSummary>({ items: [], voted_clown_id: null });
  const [voteSubmittingId, setVoteSubmittingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);

  const activateSessionJoker = useCallback(
    (joker: Joker) => {
      setActiveJoker(joker);
      const clown = addJokerToPark(joker);
      setSelected({ kind: "clown", id: clown.id });
      return clown;
    },
    [addJokerToPark]
  );

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
        const parkJokers = await apiFetch<Joker[]>("/api/park/jokers");
        if (!cancelled) syncParkJokers(parkJokers);
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
  }, [syncParkJokers]);

  const focusedEvent = selected.kind === "event" ? events.find((event) => event.id === selected.id) ?? activeEvent : activeEvent;
  const focusedClown = selected.kind === "clown" ? clowns.find((clown) => clown.id === selected.id) ?? null : null;
  const focusedPoi = selected.kind === "poi" ? liangjiangPois.find((poi) => poi.id === selected.id) ?? null : null;
  const focusedClownIsDemo = Boolean(focusedClown && isDemoClownId(focusedClown.id));
  const focusedClownIsSelf = Boolean(activeJoker && focusedClown?.id === activeJoker.id);
  const canReplyToFocusedClown = Boolean(activeJoker && focusedClown && !focusedClownIsDemo && !focusedClownIsSelf);
  const waitingEvent = events.find((event) => event.status === "waiting");
  const bucketEvents = events.filter((event) => event.status === activeModule).slice(-6).reverse();
  const waitingEvents = events.filter((event) => event.status === "waiting").slice(-5).reverse();
  const replayEvents = events.filter((event) => event.status === "replay").slice(-4).reverse();
  const latestEvents = events.slice(-4).reverse();
  const waitingCount = events.filter((event) => event.status === "waiting").length;
  const recentCount = Math.max(events.filter(isRecent).length, events.slice(-5).filter((event) => event.status === "live").length);
  const relayCount = events.filter((event) => event.to || event.status === "done" || event.status === "replay").length;
  const voteableClowns = useMemo(
    () => clowns.filter((clown) => !clown.id.startsWith("demo-clown-")),
    [clowns]
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

  function selectEvent(event: SocialEvent) {
    setSelected({ kind: "event", id: event.id });
    setActiveModule(event.status);
    focusEvent(event.id);
  }

  async function handleLocateMyJoker() {
    if (commandLoading) return;
    setCommandLoading(true);
    setCommandError(null);
    try {
      const { clown } = await ensureSessionJoker();
      setSelected({ kind: "clown", id: clown.id });
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
      ensureMatchedBalloon(match);
      const targetEventId = eventId && eventId === match.balloon_id ? eventId : match.balloon_id;
      setReplyDraft({
        eventId: targetEventId,
        match,
        actionType,
        cheerText: defaultReplyText(actionType)
      });
      setActiveModule("waiting");
      setSelected({ kind: "event", id: targetEventId });
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
      ensureMatchedBalloon(replyDraft.match);
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
      setReplyDraft(null);
      setActiveModule("done");
      setSelected({ kind: "event", id: replyDraft.eventId });
    } catch (err) {
      setCommandError(commandErrorMessage(err, "提交回应失败"));
    } finally {
      setCommandLoading(false);
    }
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

  function eventMeta(event: SocialEvent) {
    const poi = getEventPoi(event);
    return `${timeLabel(event.createdAt)} · ${eventTypeText[event.type]} · ${poi?.label ?? "两江校区"}`;
  }

  function eventIsFocused(event: SocialEvent) {
    return focusedEvent?.id === event.id || selected.kind === "event" && selected.id === event.id;
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

          <section className="park-favorite-board" aria-label="小丑喜爱排行榜">
            <div className="park-favorite-board__header">
              <div>
                <span className="pixel-kicker">FAVORITES</span>
                <h2>小丑人气榜</h2>
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
                    <article
                      className="park-favorite-row"
                      data-winner={isWinner}
                      data-voted={voted}
                      key={clown.id}
                    >
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

          <LiangjiangRealtimeMap joker={activeJoker} events={events} clowns={clowns} />
        </section>

        <aside className="park-live2d__side" aria-label="游园互动控制台">
          <section className="pixel-panel park-command-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">JOIN</span>
                <h2>多人互动</h2>
              </div>
            </div>

            <button type="button" className="primary-button" disabled={commandLoading} onClick={() => void handleLocateMyJoker()}>
              <MapPin size={17} aria-hidden />
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
    </section>
  );
}
