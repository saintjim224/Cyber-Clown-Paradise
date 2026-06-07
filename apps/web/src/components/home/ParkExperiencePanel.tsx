"use client";

import { Map, Radio } from "lucide-react";
import { ParkSceneClient } from "@/components/ParkSceneClient";
import { LiangjiangRealtimeMap } from "@/components/park/LiangjiangRealtimeMap";
import type { Joker, ParkEvent } from "@/lib/api";

export function ParkExperiencePanel({ joker, events }: { joker: Joker | null; events: ParkEvent[] }) {
  return (
    <aside className="park-stack" aria-label="小丑乐园地图和实时舞台">
      <section className="map-panel">
        <div className="section-title">
          <div>
            <span className="pixel-kicker">CAMPUS MAP</span>
            <h2>两江小丑实时游园</h2>
            <p>直接使用两江校区地图。沙坪坝校区和宝圣湖校区暂未开放。</p>
          </div>
          <Map color="var(--color-leaf-dark)" aria-hidden />
        </div>
        <LiangjiangRealtimeMap joker={joker} events={events} compact allowCampusTabs />
      </section>

      <section className="stage-panel">
        <div className="section-title stage-panel__title">
          <div>
            <span className="pixel-kicker">LIVE STAGE</span>
            <h2>实时替身舞台</h2>
          </div>
          <Radio color="var(--color-red)" aria-hidden />
        </div>
        <ParkSceneClient joker={joker} events={events} />
      </section>
    </aside>
  );
}
