"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { apiFetch, type ChatRoom as ChatRoomType, type Joker, type JokerBrief } from "@/lib/api";

type RelationshipChatButtonProps = {
  replayJoker: JokerBrief;
  peer: JokerBrief;
  unlocked: boolean;
};

export function RelationshipChatButton({ replayJoker, peer, unlocked }: RelationshipChatButtonProps) {
  const [room, setRoom] = useState<ChatRoomType | null>(null);
  const [currentJoker, setCurrentJoker] = useState<Joker | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openChat() {
    if (!unlocked) return;
    setLoading(true);
    setError(null);
    try {
      const current = await apiFetch<Joker>("/api/jokers/me");
      const otherJokerId =
        current.id === replayJoker.id
          ? peer.id
          : current.id === peer.id
            ? replayJoker.id
            : null;
      if (!otherJokerId) {
        setError("当前小丑不在这段关系里");
        setCurrentJoker(current);
        return;
      }
      const opened = await apiFetch<ChatRoomType>(`/api/chat/private/${otherJokerId}`, { method: "POST" });
      setCurrentJoker(current);
      setRoom(opened);
    } catch (err) {
      const message = err instanceof Error ? err.message : "open_chat_failed";
      setError(message === "no_active_joker" ? "先去灵魂工坊创建自己的小丑" : message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="chat-inline-button"
        disabled={!unlocked || loading}
        title={unlocked ? "打开私聊" : "亲密度达到 9 且互动 3 次后解锁"}
        onClick={() => void openChat()}
      >
        <MessageCircle size={15} aria-hidden />
        {loading ? "打开中" : "私聊"}
      </button>
      {error ? <span className="chat-inline-error">{error}</span> : null}
      {room && currentJoker ? (
        <ChatRoom room={room} currentJoker={currentJoker} onClose={() => setRoom(null)} />
      ) : null}
    </>
  );
}
