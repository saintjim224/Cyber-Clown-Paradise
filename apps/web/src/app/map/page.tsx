import { SiteHeader } from "@/components/home/SiteHeader";
import { AmapCampusMap } from "@/components/map/AmapCampusMap";

export default function MapPage() {
  return (
    <main className="app-shell module-page map-full-page">
      <SiteHeader />

      <section className="map-full-layout">
        <AmapCampusMap />
      </section>
    </main>
  );
}
