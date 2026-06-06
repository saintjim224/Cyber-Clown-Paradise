export type LngLatTuple = [number, number];

export type CampusPoiType =
  | "gate"
  | "study"
  | "social"
  | "sport"
  | "lake"
  | "dorm"
  | "service";

export type DemoClown = {
  id: string;
  name: string;
  role: string;
  energy: "I" | "E" | "A";
  status: string;
  line: string;
  action: string;
  position: LngLatTuple;
  color: string;
  accent: string;
  image?: string;
};

export type LiangjiangPoi = {
  id: string;
  label: string;
  type: CampusPoiType;
  note: string;
  position: LngLatTuple;
};

export type SocialEvent = {
  id: string;
  title: string;
  from: string;
  to?: string;
  poiId?: string;
  summary: string;
  type: "balloon" | "wave" | "walk" | "cheer" | "reply" | "gift";
  moodDelta: number;
  createdAt: string;
  status: "live" | "waiting" | "done" | "replay";
  path?: LngLatTuple[];
};

export const liangjiangCampus = {
  id: "liangjiang-campus",
  name: "西南政法大学两江校区",
  shortName: "西政两江校区",
  address: "重庆市两江新区宝圣大道301号",
  center: [106.59422, 29.66408] as LngLatTuple,
  zoom: 17.6,
  amapKeyword: "西南政法大学 两江校区"
};

export const liangjiangPois: LiangjiangPoi[] = [
  {
    id: "lj-main-gate",
    label: "宝圣大道中门入口",
    type: "gate",
    note: "沿宝圣大道入校，适合做展台扫码入园和首次投放小丑的位置。",
    position: [106.59358, 29.66248]
  },
  {
    id: "lj-study-zone",
    label: "图书馆与学习楼群",
    type: "study",
    note: "靠近图书馆、致知楼和教学楼群，适合安静对话和回访卡。",
    position: [106.59238, 29.66458]
  },
  {
    id: "lj-social-square",
    label: "法治大道社交点",
    type: "social",
    note: "位于法治大道和中心连廊附近，适合气球投递和短句搭话。",
    position: [106.59325, 29.66362]
  },
  {
    id: "lj-dorm-zone",
    label: "北园生活宿舍区",
    type: "dorm",
    note: "贴近北园 7 栋至 11 栋宿舍片区，承接夜间回访和私密气球。",
    position: [106.59662, 29.66536]
  },
  {
    id: "lj-sport-field",
    label: "北苑运动场",
    type: "sport",
    note: "严格落在校区东北侧田径场内部，适合加油、转圈和鼓掌事件。",
    position: [106.59576, 29.66492]
  },
  {
    id: "lj-canteen",
    label: "西政 1 食堂",
    type: "service",
    note: "靠近西政 1 食堂和宿舍楼群，适合做补给与碰头任务。",
    position: [106.59203, 29.66478]
  },
  {
    id: "lj-lake-walk",
    label: "毓秀湖湖畔",
    type: "lake",
    note: "落在毓秀湖步道边，适合 I 人低压陪走和一句话回访。",
    position: [106.59392, 29.66294]
  }
];

export const demoClowns: DemoClown[] = [
  {
    id: "demo-clown-01",
    name: "糖鼻邮差",
    role: "气球投递",
    energy: "E",
    status: "正在找一个不尴尬的开场白",
    line: "我先替你打个招呼，气球已经递过去了。",
    action: "给社交广场附近的小丑递出一只蓝色气球",
    position: [106.59358, 29.66248],
    color: "#e23d2f",
    accent: "#ffd84a"
  },
  {
    id: "demo-clown-02",
    name: "湖边听筒",
    role: "安静陪走",
    energy: "I",
    status: "在湖边收集没说出口的话",
    line: "你不用马上回答，我在旁边走一会儿。",
    action: "把一条短句挂到湖畔回访卡",
    position: [106.59392, 29.66294],
    color: "#2c67c7",
    accent: "#9be36d"
  },
  {
    id: "demo-clown-03",
    name: "彩带搭子",
    role: "主动社交",
    energy: "E",
    status: "在广场发起 8 秒钟社交盲盒",
    line: "别怕，我已经替你笑了一下。",
    action: "向最近的小丑发起挥手和转圈动作",
    position: [106.59325, 29.66362],
    color: "#ff5f8f",
    accent: "#27f5d4"
  },
  {
    id: "demo-clown-04",
    name: "书库影子",
    role: "慢热观察",
    energy: "I",
    status: "在学习楼群旁边做社交笔记",
    line: "我替你记住了，对方喜欢被认真听完。",
    action: "记录一次低压对话并生成一句回访判词",
    position: [106.59238, 29.66458],
    color: "#7c5cff",
    accent: "#ffe096"
  },
  {
    id: "demo-clown-05",
    name: "操场鼓手",
    role: "气氛补给",
    energy: "A",
    status: "在运动场给陌生人鼓掌",
    line: "我不认识你，但我刚刚给你加油了。",
    action: "把一次鼓掌事件推送到回放时间线",
    position: [106.59576, 29.66492],
    color: "#26b86d",
    accent: "#ffd84a"
  },
  {
    id: "demo-clown-06",
    name: "夜灯糖纸",
    role: "回访记录",
    energy: "I",
    status: "在宿舍区整理今天的社交回放",
    line: "今天你没有消失，你只是让小丑先出门了。",
    action: "把宿舍区的匿名回访写进时间线",
    position: [106.59662, 29.66536],
    color: "#f08a24",
    accent: "#b7f7ff"
  }
];

export const demoEvents: SocialEvent[] = [
  {
    id: "event-01",
    title: "气球试探",
    from: "demo-clown-01",
    to: "demo-clown-02",
    poiId: "lj-lake-walk",
    summary: "糖鼻邮差把蓝色气球送到湖边听筒，双方只说了一句话。",
    type: "balloon",
    moodDelta: 2,
    createdAt: "2026-06-06T09:20:00.000+08:00",
    status: "done",
    path: [
      [106.59358, 29.66248],
      [106.59358, 29.66312],
      [106.59392, 29.66294]
    ]
  },
  {
    id: "event-02",
    title: "广场盲盒",
    from: "demo-clown-03",
    to: "demo-clown-01",
    poiId: "lj-social-square",
    summary: "彩带搭子在社交广场转圈，替用户发起一次低压搭话。",
    type: "wave",
    moodDelta: 3,
    createdAt: "2026-06-06T09:27:00.000+08:00",
    status: "live",
    path: [
      [106.59325, 29.66362],
      [106.59342, 29.66306],
      [106.59358, 29.66248]
    ]
  },
  {
    id: "event-03",
    title: "安静回访",
    from: "demo-clown-04",
    to: "demo-clown-02",
    poiId: "lj-study-zone",
    summary: "书库影子把湖边那句话写成回访卡。",
    type: "reply",
    moodDelta: 1,
    createdAt: "2026-06-06T09:33:00.000+08:00",
    status: "replay",
    path: [
      [106.59238, 29.66458],
      [106.59318, 29.66372],
      [106.59392, 29.66294]
    ]
  },
  {
    id: "event-04",
    title: "操场加油",
    from: "demo-clown-05",
    to: "demo-clown-03",
    poiId: "lj-sport-field",
    summary: "操场鼓手给彩带搭子补了一段鼓掌动画。",
    type: "cheer",
    moodDelta: 4,
    createdAt: "2026-06-06T09:38:00.000+08:00",
    status: "done",
    path: [
      [106.59576, 29.66492],
      [106.59442, 29.66422],
      [106.59325, 29.66362]
    ]
  },
  {
    id: "event-05",
    title: "夜灯回收",
    from: "demo-clown-06",
    to: "demo-clown-04",
    poiId: "lj-dorm-zone",
    summary: "夜灯糖纸收走一只没被打开的情绪气球，明天再投递。",
    type: "gift",
    moodDelta: 1,
    createdAt: "2026-06-06T09:45:00.000+08:00",
    status: "waiting",
    path: [
      [106.59662, 29.66536],
      [106.59442, 29.66462],
      [106.59238, 29.66458]
    ]
  }
];

export const poiTypeText: Record<CampusPoiType, string> = {
  gate: "入口",
  study: "学习",
  social: "社交",
  sport: "运动",
  lake: "湖畔",
  dorm: "生活",
  service: "补给"
};

export const eventStatusText: Record<SocialEvent["status"], string> = {
  live: "正在发生",
  waiting: "等待回应",
  done: "已完成",
  replay: "回放"
};

export const eventTypeText: Record<SocialEvent["type"], string> = {
  balloon: "情绪气球",
  wave: "挥手",
  walk: "陪走",
  cheer: "加油",
  reply: "回应",
  gift: "礼物"
};
