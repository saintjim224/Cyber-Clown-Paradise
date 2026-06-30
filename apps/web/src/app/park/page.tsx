import { SiteHeader } from "@/components/home/SiteHeader";
import { ParkLive2D } from "@/components/park/ParkLive2D";

export default function ParkPage() {
  return (
    <main className="app-shell module-page park-live-page">
      <SiteHeader />
      <ParkLive2D mode="user" />
    </main>
  );
}
