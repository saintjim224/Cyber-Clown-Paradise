"use client";

import { Map, Radio } from "lucide-react";
import { ParkSceneClient } from "@/components/ParkSceneClient";
import { PixelCampusMap } from "@/components/pixel/PixelCampusMap";
import type { Joker, ParkEvent } from "@/lib/api";

export function ParkExperiencePanel({ joker, events }: { joker: Joker | null; events: ParkEvent[] }) {
  return (
    <aside className="park-stack" aria-label="小丑乐园地图和实时舞台">
      <section className="map-panel">
        <div className="section-title">
          <div>
            <span className="pixel-kicker">CAMPUS MAP</span>
            <h2>西政像素地图</h2>
            <p>Mario 式界面，Stardew 式校园区域。当前为原创抽象地图。</p>
          </div>
          <Map color="var(--color-leaf-dark)" aria-hidden />
        </div>
        <PixelCampusMap joker={joker} events={events} />
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
