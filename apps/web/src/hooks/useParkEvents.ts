"use client";

import { useEffect, useState } from "react";
import { API_BASE, apiFetch, type ParkEvent } from "@/lib/api";

export function useParkEvents() {
  const [events, setEvents] = useState<ParkEvent[]>([]);

  useEffect(() => {
    let closed = false;
    async function loadEvents() {
      try {
        const data = await apiFetch<ParkEvent[]>("/api/park/events");
        if (!closed) setEvents(data);
      } catch {
        // Screens stay usable when the API is booting.
      }
    }

    void loadEvents();
    const timer = window.setInterval(loadEvents, 8000);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/park/stream`);
    source.addEventListener("park-event", (message) => {
      const parsed = JSON.parse((message as MessageEvent).data) as ParkEvent;
      setEvents((current) => [...current.filter((event) => event.id !== parsed.id), parsed].slice(-30));
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, []);

  return events;
}
