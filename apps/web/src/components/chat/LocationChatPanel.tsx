"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Bus,
  ChevronDown,
  Drama,
  Home,
  Landmark,
  MapPin,
  MessageCircle,
  Send,
  TreePine,
  Users,
  Utensils
} from "lucide-react";
import { useChatRoom } from "@/hooks/useChatRoom";
import { apiFetch, type ChatLocationPresence, type ChatRoom, type JokerBrief, type RelationshipRecord } from "@/lib/api";
import type { ChatZone, ChatZoneIcon } from "@/lib/socialMapData";

type LocationChatPanelProps = {
  zone: ChatZone | null;
  currentJoker: JokerBrief | null;
  occupancy: number;
  privateUnlocks?: RelationshipRecord[];
  onOpenPrivateChat?: (joker: JokerBrief) => void;
};

type PendingSend = {
  content: string;
  sentAt: number;
};

const zoneIcons: Record<ChatZoneIcon, typeof MapPin> = {
  school: Landmark,
  utensils: Utensils,
  book: BookOpen,
  activity: Activity,
  tree: TreePine,
  theater: Drama,
  bus: Bus,
  home: Home
};

function senderName(sender: JokerBrief | null | undefined, currentJoker: JokerBrief | null) {
  if (!sender) return "匿名小丑";
  if (currentJoker && sender.id === currentJoker.id) return sender.nickname || "我";
  return sender.nickname || sender.id;
}

function avatarText(sender: JokerBrief | null | undefined) {
  const name = sender?.nickname || sender?.mbti || "J";
  return name.slice(0, 1).toUpperCase();
}

function messageTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function canClearPending(messageCreatedAt: string, pending: PendingSend) {
  const timestamp = Date.parse(messageCreatedAt);
  return Number.isNaN(timestamp) || timestamp >= pending.sentAt - 2000;
}

export function LocationChatPanel({
  zone,
  currentJoker,
  occupancy,
  privateUnlocks = [],
  onOpenPrivateChat
}: LocationChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [presence, setPresence] = useState<ChatLocationPresence | null>(null);
  const [draft, setDraft] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingSendRef = useRef<PendingSend | null>(null);
  const observedMessageCountRef = useRef(0);
  const { messages, systemEvents, status, error, sendMessage } = useChatRoom(room?.id ?? null, { historyLimit: 500 });
  const Icon = zone ? zoneIcons[zone.icon] : MapPin;

  const unlocksByJokerId = useMemo(() => {
    const next = new Map<string, RelationshipRecord>();
    for (const relationship of privateUnlocks) next.set(relationship.joker.id, relationship);
    return next;
  }, [privateUnlocks]);

  useEffect(() => {
    let cancelled = false;
    if (!zone || !currentJoker) {
      setRoom(null);
      setRoomError(null);
      return;
    }
    const zoneId = zone.id;

    async function openRoom() {
      setRoomError(null);
      try {
        const opened = await apiFetch<ChatRoom>(`/api/chat/location/${zoneId}`, { method: "POST" });
        if (!cancelled) setRoom(opened);
      } catch (err) {
        if (!cancelled) {
          setRoom(null);
          setRoomError(err instanceof Error ? err.message : "open_location_chat_failed");
        }
      }
    }

    void openRoom();
    return () => {
      cancelled = true;
    };
  }, [currentJoker?.id, zone?.id]);

  useEffect(() => {
    setUnreadCount(0);
    setPresence(null);
    setNearbyOpen(false);
    pendingSendRef.current = null;
    observedMessageCountRef.current = 0;
  }, [room?.id]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function loadPresence() {
      if (!zone || !currentJoker) {
        setPresence(null);
        return;
      }
      try {
        const next = await apiFetch<ChatLocationPresence>(`/api/chat/location/${zone.id}/presence`);
        if (!cancelled) setPresence(next);
      } catch {
        if (!cancelled) setPresence(null);
      }
    }

    void loadPresence();
    timer = window.setInterval(() => void loadPresence(), 15000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [currentJoker?.id, messages.length, status, zone?.id]);

  useEffect(() => {
    if (!collapsed) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages.length, systemEvents.length, collapsed]);

  useEffect(() => {
    const pending = pendingSendRef.current;
    if (!pending || !currentJoker) return;
    const confirmed = messages.some(
      (message) => message.sender_id === currentJoker.id && canClearPending(message.created_at, pending)
    );
    if (!confirmed) return;
    pendingSendRef.current = null;
    setDraft((current) => (current.trim() === pending.content ? "" : current));
  }, [currentJoker, messages]);

  useEffect(() => {
    if (error) pendingSendRef.current = null;
  }, [error]);

  useEffect(() => {
    if (!collapsed) {
      observedMessageCountRef.current = messages.length;
      return;
    }
    const previous = observedMessageCountRef.current;
    if (messages.length > previous) {
      const incoming = messages
        .slice(previous)
        .filter((message) => !currentJoker || message.sender_id !== currentJoker.id).length;
      if (incoming > 0) setUnreadCount((current) => Math.min(99, current + incoming));
    }
    observedMessageCountRef.current = messages.length;
  }, [collapsed, currentJoker, messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !room) return;
    pendingSendRef.current = { content, sentAt: Date.now() };
    const created = await sendMessage(content);
    if (created && currentJoker && created.sender_id === currentJoker.id) {
      pendingSendRef.current = null;
      setDraft((current) => (current.trim() === content ? "" : current));
    }
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      if (!next) setUnreadCount(0);
      return next;
    });
  }

  function openPrivateChat(joker: JokerBrief) {
    if (joker.id === currentJoker?.id) return;
    onOpenPrivateChat?.(joker);
  }

  const disabled = !zone || !currentJoker || !room;
  const visibleError = roomError || error;
  const activeCount = presence?.active_count ?? occupancy;
  const nearbyJokers = presence?.active_jokers ?? [];
  const headerMeta = zone
    ? unreadCount > 0 && collapsed
      ? `${activeCount} 人在此 · ${unreadCount} 条新消息`
      : `${activeCount} 人在此 · ${status === "open" ? "已连接" : "连接中"}`
    : "走近区域自动加入";

  return (
    <section
      className="location-chat-panel"
      data-collapsed={collapsed}
      data-has-unread={unreadCount > 0}
      aria-label="区域公共聊天池"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="location-chat-header" aria-expanded={!collapsed} onClick={toggleCollapsed}>
        <span className="location-chat-zone-icon">
          <Icon size={17} aria-hidden />
        </span>
        <strong>{zone ? zone.label : "公共聊天池"}</strong>
        <small>{headerMeta}</small>
        <ChevronDown size={17} aria-hidden />
        {unreadCount > 0 ? <span className="location-chat-unread" aria-label={`${unreadCount} 条新消息`} /> : null}
      </button>

      {!collapsed ? (
        <div className="location-chat-body">
          {!currentJoker ? (
            <p className="location-chat-empty">先在灵魂工坊创建自己的小丑，再进入区域聊天。</p>
          ) : !zone ? (
            <p className="location-chat-empty">走近教学楼、食堂、图书馆等区域后，会自动加入对应公共池。</p>
          ) : (
            <>
              <div className="location-chat-presence">
                <button type="button" onClick={() => setNearbyOpen((current) => !current)}>
                  <Users size={15} aria-hidden />
                  <span>{activeCount} 人在附近</span>
                  <ChevronDown size={15} aria-hidden />
                </button>
                {nearbyOpen ? (
                  <div className="location-chat-nearby-list">
                    {nearbyJokers.length === 0 ? (
                      <span className="location-chat-nearby-empty">还没有最近活跃的小丑。</span>
                    ) : (
                      nearbyJokers.map((joker) => {
                        const relationship = unlocksByJokerId.get(joker.id);
                        const isMe = currentJoker.id === joker.id;
                        return (
                          <div className="location-chat-nearby-row" key={joker.id}>
                            <span className="location-chat-avatar">{avatarText(joker)}</span>
                            <div>
                              <strong>{senderName(joker, currentJoker)}</strong>
                              <small>
                                {isMe
                                  ? "你在这里"
                                  : relationship?.chat_unlocked
                                    ? `亲密度 ${relationship.affinity_score} · 可私聊`
                                    : "最近 5 分钟活跃"}
                              </small>
                            </div>
                            {!isMe && relationship?.chat_unlocked ? (
                              <button type="button" onClick={() => openPrivateChat(joker)}>
                                <MessageCircle size={14} aria-hidden />
                                私聊
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>

              <div className="location-chat-messages" ref={listRef}>
                {messages.length === 0 && systemEvents.length === 0 ? (
                  <p className="location-chat-empty">{zone.note}</p>
                ) : null}
                {systemEvents.slice(-4).map((event) => (
                  <p className="location-chat-system" key={event.id}>
                    {event.type === "user_joined"
                      ? `${senderName(event.joker, currentJoker)} 进入了${zone.label}`
                      : "有小丑离开了这里"}
                  </p>
                ))}
                {messages.map((message) => {
                  const mine = currentJoker.id === message.sender_id;
                  const relationship = message.sender ? unlocksByJokerId.get(message.sender.id) : null;
                  return (
                    <article className="location-chat-message" data-mine={mine} key={message.id}>
                      <span className="location-chat-avatar">{avatarText(message.sender)}</span>
                      <div>
                        <button
                          type="button"
                          className="location-chat-sender"
                          disabled={!message.sender || mine || !relationship?.chat_unlocked}
                          title={relationship?.chat_unlocked ? "打开私聊" : "亲密度达到 9 且互动 3 次后可私聊"}
                          onClick={() => message.sender && openPrivateChat(message.sender)}
                        >
                          {senderName(message.sender, currentJoker)}
                        </button>
                        <p>{message.content_safe || ""}</p>
                        <time>{messageTime(message.created_at)}</time>
                      </div>
                    </article>
                  );
                })}
              </div>

              {visibleError ? <p className="location-chat-error">{visibleError}</p> : null}

              <form className="location-chat-compose" onSubmit={handleSubmit}>
                <label className="sr-only" htmlFor="locationChatDraft">
                  区域聊天消息
                </label>
                <input
                  id="locationChatDraft"
                  value={draft}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={room ? "说点什么..." : "正在加入区域..."}
                />
                <button type="submit" className="primary-button" disabled={disabled || draft.trim().length === 0}>
                  <Send size={16} aria-hidden />
                  发送
                </button>
              </form>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
