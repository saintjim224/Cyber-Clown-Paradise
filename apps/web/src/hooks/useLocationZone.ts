"use client";

import { useMemo } from "react";
import { chatZoneForPoint, type ChatZone, type ImagePointTuple } from "@/lib/socialMapData";

export function useLocationZone(point: ImagePointTuple | null | undefined): ChatZone | null {
  return useMemo(() => chatZoneForPoint(point), [point]);
}
