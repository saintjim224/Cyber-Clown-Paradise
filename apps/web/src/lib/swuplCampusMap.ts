import { generatedOsmCampusMaps } from "./generatedOsmCampusMaps";

export type CampusTile =
  | "grass"
  | "tree"
  | "path"
  | "road"
  | "water"
  | "building"
  | "dorm"
  | "court"
  | "plaza"
  | "gate"
  | "landmark"
  | "social";

export type CampusPoiType = "gate" | "study" | "social" | "sport" | "lake" | "dorm" | "service";

export type CampusPoi = {
  id: string;
  label: string;
  type: CampusPoiType;
  x: number;
  y: number;
  note: string;
  amapKeyword?: string;
};

export type CampusPixelMap = {
  id: string;
  name: string;
  alias?: string;
  address: string;
  role: string;
  color: string;
  width: number;
  height: number;
  amapKeyword: string;
  fallbackCenter: [number, number];
  fallbackZoom: number;
  metersPerTile: number;
  dataStatus: "playable-abstraction" | "ready-for-authorized-import";
  sourceNotes: string[];
  importPlan: string[];
  rows: string[];
  pois: CampusPoi[];
  sourceUrls: string[];
};

type TileSymbol = "G" | "T" | "P" | "R" | "W" | "B" | "D" | "C" | "M" | "S" | "L" | "X";

export const tileLegend: Record<string, CampusTile> = {
  G: "grass",
  T: "tree",
  P: "path",
  R: "road",
  W: "water",
  B: "building",
  D: "dorm",
  C: "court",
  M: "plaza",
  S: "gate",
  L: "landmark",
  X: "social"
};

const officialHome = "https://www.swupl.edu.cn/";
const officialCharter =
  "https://fzgh.swupl.edu.cn/docs//2022-11/74fb2c3fdcc54f9e8dcf43245ab0d046.pdf";

const commonSourceNotes = [
  "校区地址来自西南政法大学公开信息与学校章程类公开资料。",
  "当前像素地图是为黑客松 demo 绘制的原创游戏化抽象，不复制未授权校园地图截图或商业瓦片。",
  "要做到与原校区地图一比一还原，需要接入授权底图、OSM/高德等可用数据，或由学校提供建筑/道路轮廓数据。"
];

const commonImportPlan = [
  "用授权底图或高德/OSM 数据取得校区边界、道路、建筑、水体和 POI 坐标。",
  "把经纬度投影到本组件的 tile 坐标系，按 metersPerTile 栅格化成像素层。",
  "保留 POI、路径、事件点为独立图层，让小丑社交事件可以绑定到真实地点。",
  "用美术同学提供的地块贴图替换当前纯 CSS tile，地图交互层保持不变。"
];

function makeGrid(width: number, height: number, fill: TileSymbol = "G") {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function fillRect(grid: TileSymbol[][], x1: number, y1: number, x2: number, y2: number, tile: TileSymbol) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  for (let y = Math.max(0, y1); y <= Math.min(height - 1, y2); y += 1) {
    for (let x = Math.max(0, x1); x <= Math.min(width - 1, x2); x += 1) {
      grid[y][x] = tile;
    }
  }
}

function fillEllipse(grid: TileSymbol[][], cx: number, cy: number, rx: number, ry: number, tile: TileSymbol) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, Math.ceil(cx + rx)); x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) grid[y][x] = tile;
    }
  }
}

function drawLine(grid: TileSymbol[][], startX: number, startY: number, endX: number, endY: number, tile: TileSymbol, thickness = 1) {
  const steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY), 1);
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(startX + ((endX - startX) * step) / steps);
    const y = Math.round(startY + ((endY - startY) * step) / steps);
    fillRect(grid, x - thickness, y - thickness, x + thickness, y + thickness, tile);
  }
}

function scatterTrees(grid: TileSymbol[][], points: Array<[number, number, number, number]>) {
  points.forEach(([x1, y1, x2, y2]) => {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        if ((x * 17 + y * 11) % 5 < 3) grid[y][x] = "T";
      }
    }
  });
}

function rowsFrom(grid: TileSymbol[][]) {
  return grid.map((row) => row.join(""));
}

function buildLiangjiangRows() {
  const grid = makeGrid(72, 48);
  scatterTrees(grid, [
    [0, 0, 15, 11],
    [55, 0, 71, 12],
    [0, 34, 14, 47],
    [57, 34, 71, 47],
    [23, 2, 29, 8],
    [45, 30, 54, 39]
  ]);

  fillRect(grid, 0, 23, 71, 26, "R");
  fillRect(grid, 34, 0, 38, 47, "P");
  drawLine(grid, 5, 39, 66, 9, "P", 1);
  drawLine(grid, 9, 12, 61, 36, "P", 1);
  fillEllipse(grid, 34, 18, 11, 8, "W");
  fillEllipse(grid, 43, 18, 7, 5, "W");
  drawLine(grid, 25, 24, 45, 24, "P", 1);
  fillRect(grid, 31, 17, 35, 20, "L");
  fillRect(grid, 37, 18, 40, 21, "L");

  fillRect(grid, 15, 7, 25, 14, "B");
  fillRect(grid, 47, 6, 58, 13, "B");
  fillRect(grid, 12, 28, 25, 35, "B");
  fillRect(grid, 46, 28, 59, 35, "B");
  fillRect(grid, 27, 30, 32, 42, "D");
  fillRect(grid, 40, 30, 45, 42, "D");
  fillRect(grid, 20, 38, 29, 44, "C");
  fillRect(grid, 48, 38, 58, 44, "C");
  fillRect(grid, 31, 24, 41, 29, "M");
  fillRect(grid, 35, 25, 37, 27, "X");
  fillRect(grid, 0, 22, 2, 27, "S");
  fillRect(grid, 69, 22, 71, 27, "S");
  return rowsFrom(grid);
}

function buildShapingbaRows() {
  const grid = makeGrid(72, 48);
  scatterTrees(grid, [
    [0, 0, 18, 14],
    [54, 0, 71, 13],
    [0, 37, 20, 47],
    [50, 36, 71, 47]
  ]);

  fillRect(grid, 0, 22, 71, 25, "R");
  fillRect(grid, 34, 0, 38, 47, "R");
  fillRect(grid, 18, 20, 53, 27, "M");
  drawLine(grid, 12, 8, 60, 39, "P", 1);
  drawLine(grid, 11, 38, 58, 9, "P", 1);
  fillRect(grid, 29, 13, 43, 18, "L");
  fillRect(grid, 31, 20, 40, 28, "X");

  fillRect(grid, 13, 5, 24, 13, "B");
  fillRect(grid, 47, 5, 59, 13, "B");
  fillRect(grid, 9, 28, 23, 35, "B");
  fillRect(grid, 49, 28, 63, 35, "B");
  fillRect(grid, 24, 34, 32, 44, "D");
  fillRect(grid, 39, 34, 47, 44, "D");
  fillRect(grid, 30, 31, 42, 38, "C");
  fillRect(grid, 0, 21, 2, 26, "S");
  fillRect(grid, 69, 21, 71, 26, "S");
  return rowsFrom(grid);
}

function buildBaoshenghuRows() {
  const grid = makeGrid(72, 48);
  scatterTrees(grid, [
    [0, 0, 16, 13],
    [52, 0, 71, 15],
    [0, 35, 17, 47],
    [55, 35, 71, 47],
    [42, 24, 52, 34]
  ]);

  fillEllipse(grid, 35, 12, 18, 9, "W");
  fillEllipse(grid, 44, 19, 10, 7, "W");
  fillRect(grid, 0, 22, 71, 25, "R");
  fillRect(grid, 35, 16, 39, 47, "P");
  drawLine(grid, 8, 31, 65, 16, "P", 1);
  drawLine(grid, 10, 10, 64, 35, "P", 1);
  fillRect(grid, 32, 8, 40, 13, "L");
  fillRect(grid, 32, 23, 42, 28, "M");
  fillRect(grid, 36, 24, 38, 26, "X");

  fillRect(grid, 12, 6, 24, 14, "B");
  fillRect(grid, 52, 8, 63, 16, "B");
  fillRect(grid, 14, 28, 27, 36, "D");
  fillRect(grid, 45, 29, 58, 37, "D");
  fillRect(grid, 23, 38, 33, 44, "C");
  fillRect(grid, 42, 38, 53, 44, "C");
  fillRect(grid, 0, 21, 2, 26, "S");
  fillRect(grid, 69, 21, 71, 26, "S");
  return rowsFrom(grid);
}

const handDrawnCampusPixelMaps: CampusPixelMap[] = [
  {
    id: "liangjiang",
    name: "两江校区",
    alias: "渝北校区",
    address: "重庆市两江新区宝圣大道301号",
    role: "主线出生点",
    color: "#3aa7ff",
    width: 72,
    height: 48,
    amapKeyword: "西南政法大学 两江校区",
    fallbackCenter: [106.592743, 29.664056],
    fallbackZoom: 17,
    metersPerTile: 14,
    dataStatus: "playable-abstraction",
    sourceNotes: commonSourceNotes,
    importPlan: commonImportPlan,
    rows: buildLiangjiangRows(),
    pois: [
      { id: "lj-west-gate", label: "宝圣大道西门", type: "gate", x: 1, y: 24, note: "展台出生点，适合作为扫码入园入口。", amapKeyword: "西南政法大学 两江校区 宝圣大道入口" },
      { id: "lj-east-gate", label: "东侧通勤口", type: "gate", x: 70, y: 24, note: "后续可绑定校车、校外路线。", amapKeyword: "西南政法大学 两江校区 东门" },
      { id: "lj-lake", label: "湖畔会合点", type: "lake", x: 34, y: 18, note: "I 人气球漂流和低压社交事件点。", amapKeyword: "西南政法大学 两江校区 湖" },
      { id: "lj-library", label: "法学书库", type: "study", x: 33, y: 18, note: "灵魂草案、判词和安静对话发生地。", amapKeyword: "西南政法大学 两江校区 图书馆" },
      { id: "lj-square", label: "彩带广场", type: "social", x: 36, y: 25, note: "小丑主动社交、盲盒匹配和回放主舞台。", amapKeyword: "西南政法大学 两江校区 广场" },
      { id: "lj-dorm-a", label: "宿舍灯塔 A", type: "dorm", x: 29, y: 37, note: "夜间回访和私密心情收纳点。", amapKeyword: "西南政法大学 两江校区 宿舍" },
      { id: "lj-sport", label: "运动补给区", type: "sport", x: 53, y: 41, note: "E 人动作治愈、跳舞和加油事件点。", amapKeyword: "西南政法大学 两江校区 操场" },
      { id: "lj-canteen", label: "糖果补给铺", type: "service", x: 18, y: 31, note: "后续可接校园商店式任务。", amapKeyword: "西南政法大学 两江校区 食堂" }
    ],
    sourceUrls: [officialHome, officialCharter]
  },
  {
    id: "shapingba",
    name: "沙坪坝校区",
    address: "重庆市沙坪坝区壮志路2号",
    role: "老校区支线",
    color: "#e85d3f",
    width: 72,
    height: 48,
    amapKeyword: "西南政法大学 沙坪坝校区",
    fallbackCenter: [106.4449, 29.5734],
    fallbackZoom: 17,
    metersPerTile: 10,
    dataStatus: "playable-abstraction",
    sourceNotes: commonSourceNotes,
    importPlan: commonImportPlan,
    rows: buildShapingbaRows(),
    pois: [
      { id: "spb-west-gate", label: "壮志路入口", type: "gate", x: 1, y: 23, note: "老校区支线起点。", amapKeyword: "西南政法大学 沙坪坝校区 壮志路入口" },
      { id: "spb-east-gate", label: "东侧街巷口", type: "gate", x: 70, y: 23, note: "适合做校外偶遇事件。", amapKeyword: "西南政法大学 沙坪坝校区 东门" },
      { id: "spb-archive", label: "老校史碎片", type: "study", x: 36, y: 15, note: "沉浸式记忆、校史彩蛋和判词地点。", amapKeyword: "西南政法大学 沙坪坝校区" },
      { id: "spb-square", label: "午后社交格", type: "social", x: 36, y: 23, note: "小丑替身在这里短句互动。", amapKeyword: "西南政法大学 沙坪坝校区 广场" },
      { id: "spb-court", label: "操场回声", type: "sport", x: 36, y: 34, note: "动作回放和轻运动场景。", amapKeyword: "西南政法大学 沙坪坝校区 操场" },
      { id: "spb-dorm", label: "宿舍灯塔", type: "dorm", x: 28, y: 39, note: "适合生成夜晚回访卡。", amapKeyword: "西南政法大学 沙坪坝校区 宿舍" },
      { id: "spb-canteen", label: "老校补给铺", type: "service", x: 18, y: 31, note: "后续可扩成校园任务 NPC。", amapKeyword: "西南政法大学 沙坪坝校区 食堂" }
    ],
    sourceUrls: [officialHome, officialCharter]
  },
  {
    id: "baoshenghu",
    name: "宝圣湖校区",
    address: "重庆市两江新区兴科二路1号",
    role: "湖畔事件副本",
    color: "#26b86d",
    width: 72,
    height: 48,
    amapKeyword: "西南政法大学 宝圣湖校区",
    fallbackCenter: [106.6347, 29.6924],
    fallbackZoom: 17,
    metersPerTile: 12,
    dataStatus: "playable-abstraction",
    sourceNotes: commonSourceNotes,
    importPlan: commonImportPlan,
    rows: buildBaoshenghuRows(),
    pois: [
      { id: "bsh-west-gate", label: "兴科二路入口", type: "gate", x: 1, y: 23, note: "湖畔副本入口。", amapKeyword: "西南政法大学 宝圣湖校区 兴科二路入口" },
      { id: "bsh-east-gate", label: "东侧步道口", type: "gate", x: 70, y: 23, note: "后续可接环湖路线。", amapKeyword: "西南政法大学 宝圣湖校区 东门" },
      { id: "bsh-lake", label: "宝圣湖边", type: "lake", x: 36, y: 11, note: "情绪气球漂流、湖边短句和惊喜事件。", amapKeyword: "宝圣湖" },
      { id: "bsh-social", label: "湖畔盲盒点", type: "social", x: 37, y: 25, note: "陌生小丑互相靠近的主事件点。", amapKeyword: "西南政法大学 宝圣湖校区 广场" },
      { id: "bsh-study", label: "产业楼补给", type: "study", x: 56, y: 12, note: "适合后续接专业/社团标签。", amapKeyword: "西南政法大学 宝圣湖校区 教学楼" },
      { id: "bsh-dorm", label: "湖畔宿舍灯", type: "dorm", x: 51, y: 33, note: "回放页可用的夜间停靠点。", amapKeyword: "西南政法大学 宝圣湖校区 宿舍" },
      { id: "bsh-court", label: "放风小操场", type: "sport", x: 47, y: 41, note: "E 人互动动作练习区。", amapKeyword: "西南政法大学 宝圣湖校区 操场" }
    ],
    sourceUrls: [officialHome, officialCharter]
  }
];

export const campusPixelMaps: CampusPixelMap[] =
  generatedOsmCampusMaps.length > 0 ? generatedOsmCampusMaps : handDrawnCampusPixelMaps;
