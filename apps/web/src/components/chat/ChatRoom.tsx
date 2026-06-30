"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useChatRoom } from "@/hooks/useChatRoom";
import type { ChatRoom as ChatRoomType, JokerBrief } from "@/lib/api";

type ChatRoomProps = {
  room: ChatRoomType;
  currentJoker: JokerBrief;
  onClose: () => void;
};

function displayName(joker: JokerBrief | null | undefined) {
  if (!joker) return "私聊";
  return joker.nickname || joker.id;
}

function messageTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function confirmedAfter(value: string, timestamp: number) {
  const createdAt = Date.parse(value);
  return Number.isNaN(createdAt) || createdAt >= timestamp - 2000;
}

export function ChatRoom({ room, currentJoker, onClose }: ChatRoomProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<{ content: string; sentAt: number } | null>(null);
  const { messages, status, error, sendMessage } = useChatRoom(room.id);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const confirmed = messages.some(
      (message) => message.sender_id === currentJoker.id && confirmedAfter(message.created_at, pending.sentAt)
    );
    if (!confirmed) return;
    pendingRef.current = null;
    setDraft((current) => (current.trim() === pending.content ? "" : current));
  }, [currentJoker.id, messages]);

  useEffect(() => {
    if (error) pendingRef.current = null;
  }, [error]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    pendingRef.current = { content, sentAt: Date.now() };
    const created = await sendMessage(content);
    if (created && created.sender_id === currentJoker.id) {
      pendingRef.current = null;
      setDraft((current) => (current.trim() === content ? "" : current));
    }
  }

  return (
    <div className="chat-room-shell" role="dialog" aria-modal="true" aria-label="私聊窗口">
      <section className="chat-room-card">
        <header className="chat-room-header">
          <span>
            <MessageCircle size={17} aria-hidden />
            私聊
          </span>
          <strong>{displayName(room.peer)}</strong>
          <button type="button" className="icon-button" title="关闭私聊" onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="chat-room-messages" ref={listRef}>
          {messages.length === 0 ? (
            <p className="chat-room-empty">房间已解锁，可以开始聊天。</p>
          ) : null}
          {messages.map((message) => {
            const mine = message.sender_id === currentJoker.id;
            return (
              <article className="chat-message" data-mine={mine} key={message.id}>
                <p>{message.content_safe || ""}</p>
                <time>{messageTime(message.created_at)}</time>
              </article>
            );
          })}
        </div>

        {error ? <p className="chat-room-error">{error}</p> : null}

        <form className="chat-room-compose" onSubmit={handleSubmit}>
          <input
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={status === "open" ? "输入消息..." : "正在连接..."}
          />
          <button type="submit" className="primary-button" disabled={draft.trim().length === 0}>
            <Send size={16} aria-hidden />
            发送
          </button>
        </form>
      </section>
    </div>
  );
}
