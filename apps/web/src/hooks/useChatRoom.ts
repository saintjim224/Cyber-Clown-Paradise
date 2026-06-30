"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiWebSocketUrl, type ChatMessage } from "@/lib/api";

type SocketMessage = {
  type: "chat_message" | "error" | "user_joined" | "user_left";
  message?: ChatMessage;
  detail?: string;
  joker?: ChatMessage["sender"];
  joker_id?: string;
};

const CHAT_HISTORY_LIMIT = 200;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export type ChatSystemEvent = {
  id: string;
  type: "user_joined" | "user_left";
  joker: ChatMessage["sender"];
  joker_id: string;
  created_at: string;
};

function messageTimestamp(message: ChatMessage) {
  const timestamp = Date.parse(message.created_at);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[], limit: number) {
  const byId = new Map<string, ChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((left, right) => {
      const timestampDiff = messageTimestamp(left) - messageTimestamp(right);
      return timestampDiff === 0 ? left.id.localeCompare(right.id) : timestampDiff;
    })
    .slice(-limit);
}

export function useChatRoom(roomId: string | null, options: { historyLimit?: number } = {}) {
  const historyLimit = options.historyLimit ?? CHAT_HISTORY_LIMIT;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [systemEvents, setSystemEvents] = useState<ChatSystemEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed">("idle");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const activeRoomRef = useRef<string | null>(roomId);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!roomId) {
      activeRoomRef.current = null;
      setMessages([]);
      setSystemEvents([]);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;
    activeRoomRef.current = roomId;
    setStatus("connecting");
    setError(null);
    setMessages([]);
    setSystemEvents([]);

    async function loadMessages() {
      try {
        const history = await apiFetch<ChatMessage[]>(`/api/chat/rooms/${roomId}/messages?limit=${historyLimit}`);
        if (!cancelled) setMessages((current) => mergeMessages(current, history, historyLimit));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "load_chat_failed");
      }
    }

    void loadMessages();

    function connect(attempt: number) {
      if (cancelled || activeRoomRef.current !== roomId) return;
      setStatus("connecting");
      const socket = new WebSocket(apiWebSocketUrl(`/ws/chat/${roomId}`));
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled || activeRoomRef.current !== roomId) return;
        setStatus("open");
        setError(null);
      };

      socket.onmessage = (event) => {
        if (cancelled || activeRoomRef.current !== roomId) return;
        let payload: SocketMessage;
        try {
          payload = JSON.parse(event.data) as SocketMessage;
        } catch {
          setError("invalid_chat_payload");
          return;
        }
        if (payload.type === "chat_message" && payload.message) {
          setMessages((current) => mergeMessages(current, [payload.message as ChatMessage], historyLimit));
        }
        if (payload.type === "user_joined" && payload.joker?.id) {
          const joker = payload.joker;
          const event: ChatSystemEvent = {
            id: `${joker.id}-joined-${Date.now()}`,
            type: "user_joined",
            joker,
            joker_id: joker.id,
            created_at: new Date().toISOString()
          };
          setSystemEvents((current) => [...current, event].slice(-20));
        }
        if (payload.type === "user_left" && payload.joker_id) {
          const jokerId = payload.joker_id;
          const event: ChatSystemEvent = {
            id: `${jokerId}-left-${Date.now()}`,
            type: "user_left",
            joker: null,
            joker_id: jokerId,
            created_at: new Date().toISOString()
          };
          setSystemEvents((current) => [...current, event].slice(-20));
        }
        if (payload.type === "error") setError(payload.detail ?? "chat_socket_error");
      };

      socket.onerror = () => {
        if (!cancelled) setError("chat_socket_error");
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (cancelled || activeRoomRef.current !== roomId) return;
        setStatus("closed");
        const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
        reconnectTimer = window.setTimeout(() => connect(attempt + 1), delay);
      };
    }

    connect(0);

    return () => {
      cancelled = true;
      activeRoomRef.current = null;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [historyLimit, roomId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!roomId) return null;
      const targetRoomId = roomId;
      const trimmed = content.trim();
      if (!trimmed) return null;
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ content: trimmed }));
        } catch {
          if (mountedRef.current && activeRoomRef.current === targetRoomId) setError("chat_socket_error");
        }
        return null;
      }
      try {
        const created = await apiFetch<ChatMessage>(`/api/chat/rooms/${targetRoomId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: trimmed })
        });
        if (mountedRef.current && activeRoomRef.current === targetRoomId) {
          setMessages((current) => mergeMessages(current, [created], historyLimit));
        }
        return created;
      } catch (err) {
        if (mountedRef.current && activeRoomRef.current === targetRoomId) {
          setError(err instanceof Error ? err.message : "send_chat_failed");
        }
        return null;
      }
    },
    [historyLimit, roomId]
  );

  return useMemo(
    () => ({
      messages,
      systemEvents,
      status,
      error,
      sendMessage
    }),
    [error, messages, sendMessage, status, systemEvents]
  );
}
