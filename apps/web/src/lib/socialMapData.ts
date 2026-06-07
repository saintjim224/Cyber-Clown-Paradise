export type LngLatTuple = [number, number];
export type ImagePointTuple = [number, number];

export const liangjiangMapImage = {
  src: "/maps/liangjiang-campus.png",
  width: 1672,
  height: 941,
  alt: "两江校区地图"
} as const;

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
  mapPoint: ImagePointTuple;
  color: string;
  accent: string;
  image?: string;
  spriteUrl?: string;
  frameSize?: number;
  spriteActions?: Record<string, { start: number; frames: number; fps: number }>;
};

export type LiangjiangPoi = {
  id: string;
  label: string;
  type: CampusPoiType;
  note: string;
  position: LngLatTuple;
  mapPoint: ImagePointTuple;
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
  mapPath?: ImagePointTuple[];
};

export const liangjiangCampus = {
  id: "liangjiang-campus",
  name: "西南政法大学两江校区",
  shortName: "西政两江校区",
  address: "重庆市两江新区宝圣大道301号",
  center: [106.59302, 29.66433] as LngLatTuple,
  zoom: 16.85,
  amapKeyword: "西南政法大学 两江校区"
};

// /map 使用高德真实经纬度；/park 的 PNG 示意图继续使用 mapPoint，不做互相换算。
export const liangjiangAmapPositions = {
  "lj-main-gate": [106.592743, 29.664056],
  "lj-south-gate": [106.594963, 29.660786],
  "lj-north-gate": [106.59645, 29.66637],
  "lj-small-north-gate": [106.597529, 29.668975],
  "lj-library": [106.593184, 29.661393],
  "lj-zhizhi-building": [106.590965, 29.661645],
  "lj-duxing-building": [106.59308, 29.66418],
  "lj-jingye-building": [106.591871, 29.660743],
  "lj-qinye-building": [106.593431, 29.664553],
  "lj-boxue-building": [106.59488, 29.66615],
  "lj-roman-square": [106.593847, 29.663281],
  "lj-north-dorm": [106.592805, 29.668753],
  "lj-west-dorm": [106.59002, 29.662572],
  "lj-east-dorm": [106.59292, 29.65963],
  "lj-north-sport-field": [106.595741, 29.667902],
  "lj-south-sport-field": [106.588145, 29.660842],
  "lj-north-playground": [106.59642, 29.66754],
  "lj-north-canteen": [106.592448, 29.666999],
  "lj-west-canteen": [106.589235, 29.661853],
  "lj-east-canteen": [106.591742, 29.659873],
  "lj-yuxiu-lake": [106.593997, 29.66272],
  "lj-activity-center": [106.594621, 29.667054],
  "lj-school-hospital": [106.596451, 29.666728]
} satisfies Record<string, LngLatTuple>;

const liangjiangAmapRoutePoints = {
  "main-gate-to-lake": [106.59348, 29.66324],
  "roman-to-main-gate": [106.59336, 29.66367],
  "library-to-lake": [106.59358, 29.66212],
  "north-field-to-roman": [106.59486, 29.66572],
  "north-dorm-to-library": [106.59382, 29.66632]
} satisfies Record<string, LngLatTuple>;

function amapPosition(id: keyof typeof liangjiangAmapPositions): LngLatTuple {
  return liangjiangAmapPositions[id];
}

function amapRoutePoint(id: keyof typeof liangjiangAmapRoutePoints): LngLatTuple {
  return liangjiangAmapRoutePoints[id];
}

export const liangjiangPois: LiangjiangPoi[] = [
  {
    id: "lj-main-gate",
    label: "中门",
    type: "gate",
    note: "地图底部中央校门，适合做展台扫码入园和首次投放小丑的位置。",
    position: amapPosition("lj-main-gate"),
    mapPoint: [767, 768]
  },
  {
    id: "lj-south-gate",
    label: "南门",
    type: "gate",
    note: "地图左下方校门，靠近东苑食堂和南侧主路。",
    position: amapPosition("lj-south-gate"),
    mapPoint: [62, 675]
  },
  {
    id: "lj-north-gate",
    label: "北门",
    type: "gate",
    note: "地图右下方校门，靠近生活活动中心和校医院。",
    position: amapPosition("lj-north-gate"),
    mapPoint: [1288, 846]
  },
  {
    id: "lj-small-north-gate",
    label: "小北门",
    type: "gate",
    note: "地图最右下角出入口，连通北苑宿舍和校外道路。",
    position: amapPosition("lj-small-north-gate"),
    mapPoint: [1582, 754]
  },
  {
    id: "lj-library",
    label: "图书馆",
    type: "study",
    note: "位于毓秀湖西侧，适合安静对话和回访卡。",
    position: amapPosition("lj-library"),
    mapPoint: [608, 488]
  },
  {
    id: "lj-zhizhi-building",
    label: "致知楼",
    type: "study",
    note: "地图中央偏上教学楼，靠近学习楼群主轴。",
    position: amapPosition("lj-zhizhi-building"),
    mapPoint: [756, 188]
  },
  {
    id: "lj-duxing-building",
    label: "笃行楼",
    type: "study",
    note: "地图中央偏右教学楼，位于罗马广场北侧。",
    position: amapPosition("lj-duxing-building"),
    mapPoint: [944, 188]
  },
  {
    id: "lj-jingye-building",
    label: "敬业楼",
    type: "study",
    note: "地图中央偏左教学楼，靠近图书馆北侧道路。",
    position: amapPosition("lj-jingye-building"),
    mapPoint: [636, 329]
  },
  {
    id: "lj-qinye-building",
    label: "勤业楼",
    type: "study",
    note: "地图中央偏右教学楼，位于罗马广场东侧。",
    position: amapPosition("lj-qinye-building"),
    mapPoint: [1058, 329]
  },
  {
    id: "lj-boxue-building",
    label: "博学楼",
    type: "study",
    note: "地图右中部教学楼，靠近生活活动中心北侧。",
    position: amapPosition("lj-boxue-building"),
    mapPoint: [1160, 411]
  },
  {
    id: "lj-roman-square",
    label: "罗马广场",
    type: "social",
    note: "地图中央广场，适合气球投递、短句搭话和多人社交事件。",
    position: amapPosition("lj-roman-square"),
    mapPoint: [907, 395]
  },
  {
    id: "lj-north-dorm",
    label: "北苑宿舍",
    type: "dorm",
    note: "地图右上方宿舍区，承接夜间回访和私密气球。",
    position: amapPosition("lj-north-dorm"),
    mapPoint: [1408, 159]
  },
  {
    id: "lj-west-dorm",
    label: "西苑宿舍",
    type: "dorm",
    note: "地图左上方宿舍区，靠近西苑食堂和南苑运动场。",
    position: amapPosition("lj-west-dorm"),
    mapPoint: [492, 88]
  },
  {
    id: "lj-east-dorm",
    label: "东苑宿舍",
    type: "dorm",
    note: "地图左中部宿舍区，靠近东苑食堂。",
    position: amapPosition("lj-east-dorm"),
    mapPoint: [330, 427]
  },
  {
    id: "lj-north-sport-field",
    label: "北苑运动场",
    type: "sport",
    note: "地图右上方田径场，适合加油、转圈和鼓掌事件。",
    position: amapPosition("lj-north-sport-field"),
    mapPoint: [1424, 276]
  },
  {
    id: "lj-south-sport-field",
    label: "南苑运动场",
    type: "sport",
    note: "地图左上方田径场，适合大型现场入园和队伍事件。",
    position: amapPosition("lj-south-sport-field"),
    mapPoint: [176, 66]
  },
  {
    id: "lj-north-playground",
    label: "北苑操场",
    type: "sport",
    note: "地图右中部沙地操场，适合轻运动和放风互动。",
    position: amapPosition("lj-north-playground"),
    mapPoint: [1424, 459]
  },
  {
    id: "lj-north-canteen",
    label: "北苑食堂",
    type: "service",
    note: "地图右上方食堂，靠近北苑宿舍。",
    position: amapPosition("lj-north-canteen"),
    mapPoint: [1214, 127]
  },
  {
    id: "lj-west-canteen",
    label: "西苑食堂",
    type: "service",
    note: "地图左上方食堂，靠近西苑宿舍。",
    position: amapPosition("lj-west-canteen"),
    mapPoint: [382, 185]
  },
  {
    id: "lj-east-canteen",
    label: "东苑食堂",
    type: "service",
    note: "地图左下方食堂，靠近东苑宿舍和南门。",
    position: amapPosition("lj-east-canteen"),
    mapPoint: [288, 562]
  },
  {
    id: "lj-yuxiu-lake",
    label: "毓秀湖湖畔",
    type: "lake",
    note: "地图中央偏下湖区，适合 I 人低压陪走和一句话回访。",
    position: amapPosition("lj-yuxiu-lake"),
    mapPoint: [845, 562]
  },
  {
    id: "lj-activity-center",
    label: "生活活动中心",
    type: "service",
    note: "地图右下方公共服务建筑，适合活动集合与回放墙入口。",
    position: amapPosition("lj-activity-center"),
    mapPoint: [1140, 650]
  },
  {
    id: "lj-school-hospital",
    label: "校医院",
    type: "service",
    note: "地图右下方校医院，适合安全提示和低压休息点。",
    position: amapPosition("lj-school-hospital"),
    mapPoint: [1336, 648]
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
    position: amapPosition("lj-main-gate"),
    mapPoint: [767, 768],
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
    position: amapPosition("lj-yuxiu-lake"),
    mapPoint: [845, 562],
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
    position: amapPosition("lj-roman-square"),
    mapPoint: [907, 395],
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
    position: amapPosition("lj-library"),
    mapPoint: [608, 488],
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
    position: amapPosition("lj-north-sport-field"),
    mapPoint: [1424, 276],
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
    position: amapPosition("lj-north-dorm"),
    mapPoint: [1408, 159],
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
    poiId: "lj-yuxiu-lake",
    summary: "糖鼻邮差把蓝色气球送到湖边听筒，双方只说了一句话。",
    type: "balloon",
    moodDelta: 2,
    createdAt: "2026-06-06T09:20:00.000+08:00",
    status: "done",
    path: [
      amapPosition("lj-main-gate"),
      amapRoutePoint("main-gate-to-lake"),
      amapPosition("lj-yuxiu-lake")
    ],
    mapPath: [
      [767, 768],
      [790, 650],
      [845, 562]
    ]
  },
  {
    id: "event-02",
    title: "广场盲盒",
    from: "demo-clown-03",
    to: "demo-clown-01",
    poiId: "lj-roman-square",
    summary: "彩带搭子在社交广场转圈，替用户发起一次低压搭话。",
    type: "wave",
    moodDelta: 3,
    createdAt: "2026-06-06T09:27:00.000+08:00",
    status: "live",
    path: [
      amapPosition("lj-roman-square"),
      amapRoutePoint("roman-to-main-gate"),
      amapPosition("lj-main-gate")
    ],
    mapPath: [
      [907, 395],
      [828, 560],
      [767, 768]
    ]
  },
  {
    id: "event-03",
    title: "安静回访",
    from: "demo-clown-04",
    to: "demo-clown-02",
    poiId: "lj-library",
    summary: "书库影子把湖边那句话写成回访卡。",
    type: "reply",
    moodDelta: 1,
    createdAt: "2026-06-06T09:33:00.000+08:00",
    status: "replay",
    path: [
      amapPosition("lj-library"),
      amapRoutePoint("library-to-lake"),
      amapPosition("lj-yuxiu-lake")
    ],
    mapPath: [
      [608, 488],
      [735, 540],
      [845, 562]
    ]
  },
  {
    id: "event-04",
    title: "操场加油",
    from: "demo-clown-05",
    to: "demo-clown-03",
    poiId: "lj-north-sport-field",
    summary: "操场鼓手给彩带搭子补了一段鼓掌动画。",
    type: "cheer",
    moodDelta: 4,
    createdAt: "2026-06-06T09:38:00.000+08:00",
    status: "done",
    path: [
      amapPosition("lj-north-sport-field"),
      amapRoutePoint("north-field-to-roman"),
      amapPosition("lj-roman-square")
    ],
    mapPath: [
      [1424, 276],
      [1180, 360],
      [907, 395]
    ]
  },
  {
    id: "event-05",
    title: "夜灯回收",
    from: "demo-clown-06",
    to: "demo-clown-04",
    poiId: "lj-north-dorm",
    summary: "夜灯糖纸收走一只没被打开的情绪气球，明天再投递。",
    type: "gift",
    moodDelta: 1,
    createdAt: "2026-06-06T09:45:00.000+08:00",
    status: "waiting",
    path: [
      amapPosition("lj-north-dorm"),
      amapRoutePoint("north-dorm-to-library"),
      amapPosition("lj-library")
    ],
    mapPath: [
      [1408, 159],
      [1058, 329],
      [608, 488]
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
