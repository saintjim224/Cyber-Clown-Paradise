import Link from "next/link";
import { Activity } from "lucide-react";
import type { Joker } from "@/lib/api";

type SiteHeaderProps = {
  joker?: Joker | null;
  faceQuality?: string;
};

export function SiteHeader({ joker = null, faceQuality = "fallback" }: SiteHeaderProps) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <div className="brand-mark">CJ</div>
        <div>
          <h1>赛博小丑乐园</h1>
          <p>西政像素地图里的社交替身</p>
        </div>
      </Link>
      <nav className="site-nav" aria-label="功能导航">
        <Link href="/">首页</Link>
        <Link href="/workshop">灵魂工坊</Link>
        <Link href="/map">校园地图</Link>
        <Link href="/park">乐园直播</Link>
      </nav>
      <span className="status-pill">
        <Activity size={16} aria-hidden />
        {joker ? `${joker.mbti} / ${joker.constellation}` : `脸谱 ${faceQuality}`}
      </span>
    </header>
  );
}
