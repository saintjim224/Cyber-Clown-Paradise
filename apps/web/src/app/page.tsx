import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Map, MessageCircle, QrCode, Radio, Sparkles, Ticket, UsersRound } from "lucide-react";
import { SiteHeader } from "@/components/home/SiteHeader";

const heroStats = [
  { value: "45s", label: "生成一只社交替身" },
  { value: "7 个", label: "西政两江真实点位" },
  { value: "扫码", label: "现场 Demo 与离线回放" }
];

const clownLineup = [
  {
    src: "/clowns/i/clown-001/preview.png",
    mode: "I 人",
    title: "湖边安静代聊",
    copy: "先观察现场气氛，再用低压力短句替用户开口。"
  },
  {
    src: "/clowns/i/clown-012/preview.png",
    mode: "I 人",
    title: "宿舍轻声开局",
    copy: "适合生活区、食堂和路上偶遇，不把社交做得太硬。"
  },
  {
    src: "/clowns/i/clown-024/preview.png",
    mode: "E 人",
    title: "主动破冰小队",
    copy: "切换高能人格后，替用户发起邀请、组队和互动任务。"
  }
];

const liveEvents = [
  { place: "宝圣大道中门", text: "替你向路过同学问好" },
  { place: "北苑运动场", text: "发起一局轻量搭子任务" },
  { place: "毓秀湖湖畔", text: "留下可扫码回放的偶遇片段" }
];

const signposts = [
  {
    href: "/workshop",
    label: "灵魂工坊",
    title: "生成你的像素小丑",
    copy: "录入性格、口头禅和社交边界，生成更贴近本人的 Q 版社交替身。",
    icon: Sparkles,
    tone: "red"
  },
  {
    href: "/map",
    label: "西政地图",
    title: "定位到真实校园点位",
    copy: "把小丑投放到图书馆、宿舍、运动场、食堂和湖畔等可识别地点。",
    icon: Map,
    tone: "green"
  },
  {
    href: "/park",
    label: "乐园直播",
    title: "看它替你社交",
    copy: "用直播视角看到小丑移动、说话、遇见谁，以及当前正在发生的互动。",
    icon: Radio,
    tone: "blue"
  },
  {
    href: "/replay/demo",
    label: "二维码回放",
    title: "离开展台后继续看",
    copy: "扫码打开回放页，快速复盘你的替身在校园里做过哪些互动。",
    icon: Ticket,
    tone: "gold"
  }
];

export default function HomePage() {
  return (
    <main className="app-shell game-home">
      <SiteHeader />

      <section className="game-hero" aria-label="赛博小丑乐园首页">
        <div className="pixel-sun" aria-hidden />
        <div className="pixel-cloud pixel-cloud--one" aria-hidden />
        <div className="pixel-cloud pixel-cloud--two" aria-hidden />
        <div className="hero-balloon hero-balloon--red" aria-hidden />
        <div className="hero-balloon hero-balloon--blue" aria-hidden />

        <div className="hero-copy">
          <span className="pixel-kicker">SWUPL SOCIAL RPG</span>
          <h1>让你的小丑替你社交</h1>
          <p>
            面向西南政法大学游园会的现场互动项目。用户生成一只带人格的小丑替身，
            把它投放到两江校区地图上，由它替你破冰、搭话、组队，并留下可扫码回看的校园轨迹。
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/park">
              进入乐园直播
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link className="secondary-button" href="/workshop">
              生成我的小丑
            </Link>
          </div>
          <div className="hero-proof-strip" aria-label="项目关键能力">
            {heroStats.map((item) => (
              <span className="hero-proof" key={item.label}>
                <strong>{item.value}</strong>
                <em>{item.label}</em>
              </span>
            ))}
          </div>
        </div>

        <div className="hero-stage">
          <div className="hero-stage__skyline" aria-hidden>
            <span />
            <span />
            <strong>SWUPL</strong>
            <span />
            <span />
          </div>

          <div className="hero-clown-roster" aria-label="小丑人格展示">
            {clownLineup.map((clown, index) => (
              <article className={`hero-clown-card hero-clown-card--${index + 1}`} key={clown.title}>
                <span>{clown.mode}</span>
                <Image
                  src={clown.src}
                  alt={`${clown.mode}${clown.title}`}
                  width={180}
                  height={180}
                  priority={index === 0}
                />
                <strong>{clown.title}</strong>
                <p>{clown.copy}</p>
              </article>
            ))}
          </div>

          <div className="hero-live-card">
            <div>
              <span className="pixel-kicker">LIVE MAP</span>
              <h2>两江校区实时偶遇</h2>
            </div>
            <ul>
              {liveEvents.map((event) => (
                <li key={event.place}>
                  <Map size={16} aria-hidden />
                  <span>
                    <strong>{event.place}</strong>
                    {event.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="hero-demo-card" aria-label="现场 Demo 方式">
            <QrCode size={34} aria-hidden />
            <span>
              <strong>现场扫码</strong>
              Demo / 回放 / 海报入口
            </span>
          </div>
          <div className="pixel-path" aria-hidden />
        </div>
      </section>

      <section className="home-loop" aria-label="现场体验流程">
        <article>
          <UsersRound size={22} aria-hidden />
          <strong>用户视角</strong>
          <p>我不想硬聊，但想参与现场互动，于是放出一只更懂分寸的小丑替我先开口。</p>
        </article>
        <article>
          <MessageCircle size={22} aria-hidden />
          <strong>系统视角</strong>
          <p>系统读取人格、点位和活动状态，生成合适的短句、动作和遇见事件。</p>
        </article>
        <article>
          <QrCode size={22} aria-hidden />
          <strong>展示视角</strong>
          <p>大屏看乐园直播，海报扫码进入 Demo，离开展台后还能回放自己的替身轨迹。</p>
        </article>
      </section>

      <section className="home-signpost-grid" aria-label="功能关卡入口">
        {signposts.map((item) => {
          const Icon = item.icon;
          return (
            <Link className={`home-signpost home-signpost--${item.tone}`} href={item.href} key={item.href}>
              <span className="home-signpost__label">{item.label}</span>
              <Icon size={22} aria-hidden />
              <strong>{item.title}</strong>
              <p>{item.copy}</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
