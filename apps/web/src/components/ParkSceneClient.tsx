"use client";

import dynamic from "next/dynamic";
import type { Joker, ParkEvent } from "@/lib/api";

const DynamicParkScene = dynamic(
  () => import("@/components/ParkScene").then((module) => module.ParkScene),
  {
    ssr: false,
    loading: () => (
      <div className="park-panel">
        <div className="park-canvas camera-empty">
          <p className="helper">3D 乐园正在点亮灯牌。</p>
        </div>
      </div>
    )
  }
);

export function ParkSceneClient({ joker, events }: { joker: Joker | null; events: ParkEvent[] }) {
  return <DynamicParkScene joker={joker} events={events} />;
}
