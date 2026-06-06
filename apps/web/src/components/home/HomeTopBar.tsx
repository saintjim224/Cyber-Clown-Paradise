import type { Joker } from "@/lib/api";
import { SiteHeader } from "./SiteHeader";

export function HomeTopBar({ joker, faceQuality }: { joker: Joker | null; faceQuality: string }) {
  return <SiteHeader joker={joker} faceQuality={faceQuality} />;
}
