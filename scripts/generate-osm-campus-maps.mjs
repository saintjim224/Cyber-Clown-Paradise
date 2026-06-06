import fs from "node:fs/promises";
import path from "node:path";

const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter"
];

const campuses = [
  {
    id: "liangjiang",
    name: "两江校区",
    alias: "渝北校区",
    address: "重庆市两江新区宝圣大道301号",
    role: "主线出生点",
    color: "#3aa7ff",
    amapKeyword: "西南政法大学 两江校区",
    fallbackCenter: [106.592743, 29.664056],
    fallbackZoom: 17,
    metersPerTile: 14,
    radiusMeters: 920,
    pois: [
      ["lj-west-gate", "宝圣大道西门", "gate", 1, 24, "展台出生点，适合作为扫码入园入口。", "西南政法大学 两江校区 宝圣大道入口"],
      ["lj-east-gate", "东侧通勤口", "gate", 70, 24, "后续可绑定校车、校外路线。", "西南政法大学 两江校区 东门"],
      ["lj-lake", "湖畔会合点", "lake", 34, 18, "I 人气球漂流和低压社交事件点。", "西南政法大学 两江校区 湖"],
      ["lj-library", "法学书库", "study", 33, 18, "灵魂草案、判词和安静对话发生地。", "西南政法大学 两江校区 图书馆"],
      ["lj-square", "彩带广场", "social", 36, 25, "小丑主动社交、盲盒匹配和回放主舞台。", "西南政法大学 两江校区 广场"],
      ["lj-dorm-a", "宿舍灯塔 A", "dorm", 29, 37, "夜间回访和私密心情收纳点。", "西南政法大学 两江校区 宿舍"],
      ["lj-sport", "运动补给区", "sport", 53, 41, "E 人动作治愈、跳舞和加油事件点。", "西南政法大学 两江校区 操场"],
      ["lj-canteen", "糖果补给铺", "service", 18, 31, "后续可接校园商店式任务。", "西南政法大学 两江校区 食堂"]
    ]
  },
  {
    id: "shapingba",
    name: "沙坪坝校区",
    address: "重庆市沙坪坝区壮志路2号",
    role: "老校区支线",
    color: "#e85d3f",
    amapKeyword: "西南政法大学 沙坪坝校区",
    fallbackCenter: [106.4449, 29.5734],
    fallbackZoom: 17,
    metersPerTile: 10,
    radiusMeters: 720,
    pois: [
      ["spb-west-gate", "壮志路入口", "gate", 1, 23, "老校区支线起点。", "西南政法大学 沙坪坝校区 壮志路入口"],
      ["spb-east-gate", "东侧街巷口", "gate", 70, 23, "适合做校外偶遇事件。", "西南政法大学 沙坪坝校区 东门"],
      ["spb-archive", "老校史碎片", "study", 36, 15, "沉浸式记忆、校史彩蛋和判词地点。", "西南政法大学 沙坪坝校区"],
      ["spb-square", "午后社交格", "social", 36, 23, "小丑替身在这里短句互动。", "西南政法大学 沙坪坝校区 广场"],
      ["spb-court", "操场回声", "sport", 36, 34, "动作回放和轻运动场景。", "西南政法大学 沙坪坝校区 操场"],
      ["spb-dorm", "宿舍灯塔", "dorm", 28, 39, "适合生成夜晚回访卡。", "西南政法大学 沙坪坝校区 宿舍"],
      ["spb-canteen", "老校补给铺", "service", 18, 31, "后续可扩成校园任务 NPC。", "西南政法大学 沙坪坝校区 食堂"]
    ]
  },
  {
    id: "baoshenghu",
    name: "宝圣湖校区",
    address: "重庆市两江新区兴科二路1号",
    role: "湖畔事件副本",
    color: "#26b86d",
    amapKeyword: "西南政法大学 宝圣湖校区",
    fallbackCenter: [106.6347, 29.6924],
    fallbackZoom: 17,
    metersPerTile: 12,
    radiusMeters: 920,
    pois: [
      ["bsh-west-gate", "兴科二路入口", "gate", 1, 23, "湖畔副本入口。", "西南政法大学 宝圣湖校区 兴科二路入口"],
      ["bsh-east-gate", "东侧步道口", "gate", 70, 23, "后续可接环湖路线。", "西南政法大学 宝圣湖校区 东门"],
      ["bsh-lake", "宝圣湖边", "lake", 36, 11, "情绪气球漂流、湖边短句和惊喜事件。", "宝圣湖"],
      ["bsh-social", "湖畔盲盒点", "social", 37, 25, "陌生小丑互相靠近的主事件点。", "西南政法大学 宝圣湖校区 广场"],
      ["bsh-study", "产业楼补给", "study", 56, 12, "适合后续接专业/社团标签。", "西南政法大学 宝圣湖校区 教学楼"],
      ["bsh-dorm", "湖畔宿舍灯", "dorm", 51, 33, "回放页可用的夜间停靠点。", "西南政法大学 宝圣湖校区 宿舍"],
      ["bsh-court", "放风小操场", "sport", 47, 41, "E 人互动动作练习区。", "西南政法大学 宝圣湖校区 操场"]
    ]
  }
];

const width = 72;
const height = 48;
const cacheDir = path.resolve("data/osm");
const outputPath = path.resolve("apps/web/src/lib/generatedOsmCampusMaps.ts");

function makeGrid(fill = "G") {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

const tilePriority = {
  G: 0,
  T: 1,
  P: 2,
  R: 2,
  M: 3,
  W: 4,
  C: 4,
  B: 5,
  D: 5,
  L: 6,
  S: 7,
  X: 7
};

function writeCell(grid, x, y, tile, force = false) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const current = grid[y][x];
  if (!force && (tilePriority[tile] ?? 0) < (tilePriority[current] ?? 0)) return;
  grid[y][x] = tile;
}

function fillRect(grid, x1, y1, x2, y2, tile) {
  for (let y = Math.max(0, y1); y <= Math.min(height - 1, y2); y += 1) {
    for (let x = Math.max(0, x1); x <= Math.min(width - 1, x2); x += 1) {
      writeCell(grid, x, y, tile);
    }
  }
}

function drawLine(grid, a, b, tile, thickness = 0) {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(a.x + ((b.x - a.x) * step) / steps);
    const y = Math.round(a.y + ((b.y - a.y) * step) / steps);
    fillRect(grid, x - thickness, y - thickness, x + thickness, y + thickness, tile);
  }
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function fillPolygon(grid, polygon, tile) {
  if (polygon.length < 3) return;
  const minX = Math.max(0, Math.floor(Math.min(...polygon.map((p) => p.x))));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...polygon.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...polygon.map((p) => p.y))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...polygon.map((p) => p.y))));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon({ x: x + 0.5, y: y + 0.5 }, polygon)) writeCell(grid, x, y, tile);
    }
  }
}

function lngLatToTile(campus, lng, lat) {
  const [centerLng, centerLat] = campus.fallbackCenter;
  const metersPerLatDegree = 110_540;
  const metersPerLngDegree = 111_320 * Math.cos((centerLat * Math.PI) / 180);
  const dxMeters = (lng - centerLng) * metersPerLngDegree;
  const dyMeters = (centerLat - lat) * metersPerLatDegree;
  return {
    x: Math.round(width / 2 + dxMeters / campus.metersPerTile),
    y: Math.round(height / 2 + dyMeters / campus.metersPerTile)
  };
}

function classifyWay(tags = {}) {
  if (tags.natural === "water" || tags.water || tags.waterway) return "W";
  if (tags.leisure === "pitch" || tags.leisure === "track" || tags.leisure === "sports_centre" || tags.sport) return "C";
  if (tags.building) return tags.building === "dormitory" || /dorm|宿舍/.test(tags.name ?? "") ? "D" : "B";
  if (tags.highway) return ["footway", "path", "steps", "pedestrian", "cycleway"].includes(tags.highway) ? "P" : "R";
  if (tags.amenity) return ["school", "university", "library"].includes(tags.amenity) ? "L" : "M";
  if (tags.landuse === "forest" || tags.natural === "wood") return "T";
  if (["grass", "recreation_ground", "education", "residential"].includes(tags.landuse)) return "G";
  if (tags.leisure === "park" || tags.leisure === "garden") return "T";
  return null;
}

function classifyPoi(tags = {}) {
  const name = tags.name ?? "";
  if (!name) return null;
  if (tags.entrance || /门|入口|gate/i.test(name)) return "gate";
  if (tags.amenity === "library" || /图书|书|教学|学院|楼/.test(name)) return "study";
  if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food" || /食堂|餐|店|超市/.test(name)) return "service";
  if (tags.leisure === "pitch" || tags.leisure === "sports_centre" || /操场|体育|球场/.test(name)) return "sport";
  if (tags.natural === "water" || /湖|水/.test(name)) return "lake";
  if (/宿舍|公寓/.test(name)) return "dorm";
  if (tags.amenity || tags.shop || tags.tourism) return "service";
  return null;
}

function isClosedGeometry(geometry) {
  if (!geometry || geometry.length < 4) return false;
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  return Math.abs(first.lon - last.lon) < 1e-8 && Math.abs(first.lat - last.lat) < 1e-8;
}

function buildQuery(campus) {
  const [lng, lat] = campus.fallbackCenter;
  const radius = campus.radiusMeters;
  return `[out:json][timeout:30];
(
  way(around:${radius},${lat},${lng})[building];
  way(around:${radius},${lat},${lng})[highway];
  way(around:${radius},${lat},${lng})[natural=water];
  way(around:${radius},${lat},${lng})[waterway];
  way(around:${radius},${lat},${lng})[leisure~"pitch|sports_centre|park|garden|track"];
  way(around:${radius},${lat},${lng})[landuse~"grass|forest|recreation_ground|education|residential"];
  way(around:${radius},${lat},${lng})[amenity];
  node(around:${radius},${lat},${lng})[amenity];
  node(around:${radius},${lat},${lng})[shop];
  node(around:${radius},${lat},${lng})[tourism];
  node(around:${radius},${lat},${lng})[entrance];
  node(around:${radius},${lat},${lng})[name];
);
out tags geom qt;`;
}

async function fetchOverpass(campus) {
  await fs.mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${campus.id}.json`);
  const query = buildQuery(campus);
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: {
          Accept: "application/json",
          "User-Agent": "cyberjoker-hackathon-osm-import/0.1"
        }
      });
      const text = await response.text();
      if (!response.ok || !text.trim().startsWith("{")) {
        throw new Error(`${endpoint} returned ${response.status}: ${text.slice(0, 80).replace(/\s+/g, " ")}`);
      }
      const json = JSON.parse(text);
      await fs.writeFile(cachePath, JSON.stringify(json, null, 2), "utf8");
      return json;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    throw lastError ?? new Error(`Failed to fetch OSM data for ${campus.id}`);
  }
}

function rasterizeCampus(campus, osm) {
  const grid = makeGrid("G");
  const stats = { elements: osm.elements?.length ?? 0, ways: 0, nodes: 0, buildings: 0, roads: 0, paths: 0, water: 0, sport: 0, namedPois: 0 };

  for (const element of osm.elements ?? []) {
    const tags = element.tags ?? {};
    if (element.type === "way" && element.geometry?.length) {
      stats.ways += 1;
      const tile = classifyWay(tags);
      if (!tile) continue;
      const points = element.geometry.map((point) => lngLatToTile(campus, point.lon, point.lat));
      if (tile === "B" || tile === "D") stats.buildings += 1;
      if (tile === "R") stats.roads += 1;
      if (tile === "P") stats.paths += 1;
      if (tile === "W") stats.water += 1;
      if (tile === "C") stats.sport += 1;
      if (isClosedGeometry(element.geometry) && ["B", "D", "W", "C", "T", "G", "M", "L"].includes(tile)) {
        fillPolygon(grid, points, tile);
      }
      for (let index = 1; index < points.length; index += 1) {
        drawLine(grid, points[index - 1], points[index], tile, 0);
      }
    }
    if (element.type === "node") stats.nodes += 1;
  }

  const osmPois = [];
  for (const element of osm.elements ?? []) {
    const tags = element.tags ?? {};
    const type = classifyPoi(tags);
    if (!type || typeof element.lon !== "number" || typeof element.lat !== "number") continue;
    const { x, y } = lngLatToTile(campus, element.lon, element.lat);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    stats.namedPois += 1;
    osmPois.push({
      id: `${campus.id}-osm-${osmPois.length + 1}`,
      label: tags.name.slice(0, 12),
      type,
      x,
      y,
      note: "来自 OpenStreetMap 的公开 POI，已转换到像素地图坐标。",
      amapKeyword: `${campus.name} ${tags.name}`
    });
    if (type === "gate") writeCell(grid, x, y, "S", true);
    if (type === "study") writeCell(grid, x, y, "L", true);
    if (type === "sport") writeCell(grid, x, y, "C", true);
    if (type === "lake") writeCell(grid, x, y, "W", true);
    if (type === "dorm") writeCell(grid, x, y, "D", true);
    if (type === "service") writeCell(grid, x, y, "M", true);
  }

  for (const poi of campus.pois) {
    writeCell(grid, poi[3], poi[4], poi[2] === "gate" ? "S" : poi[2] === "study" ? "L" : poi[2] === "sport" ? "C" : poi[2] === "lake" ? "W" : poi[2] === "dorm" ? "D" : poi[2] === "social" ? "X" : "M", true);
  }

  return {
    rows: grid.map((row) => row.join("")),
    stats,
    osmPois: osmPois.slice(0, 8)
  };
}

function makePoi(tuple) {
  return {
    id: tuple[0],
    label: tuple[1],
    type: tuple[2],
    x: tuple[3],
    y: tuple[4],
    note: tuple[5],
    amapKeyword: tuple[6]
  };
}

function asTsString(value) {
  return JSON.stringify(value, null, 2).replace(/"([^"]+)":/g, "$1:");
}

async function main() {
  const maps = [];
  for (const campus of campuses) {
    const osm = await fetchOverpass(campus);
    const generated = rasterizeCampus(campus, osm);
    const poiByKey = new Map();
    for (const poi of [...campus.pois.map(makePoi), ...generated.osmPois]) {
      const key = `${poi.x}:${poi.y}:${poi.label}`;
      if (!poiByKey.has(key)) poiByKey.set(key, poi);
    }
    maps.push({
      id: campus.id,
      name: campus.name,
      ...(campus.alias ? { alias: campus.alias } : {}),
      address: campus.address,
      role: campus.role,
      color: campus.color,
      width,
      height,
      amapKeyword: campus.amapKeyword,
      fallbackCenter: campus.fallbackCenter,
      fallbackZoom: campus.fallbackZoom,
      metersPerTile: campus.metersPerTile,
      dataStatus: "ready-for-authorized-import",
      sourceNotes: [
        "底图结构由 OpenStreetMap 公开数据栅格化生成，遵守 ODbL，页面和导出物需保留 OSM 署名。",
        "OSM 覆盖度取决于社区数据完整度，校园内部楼名、道路和 POI 仍可能需要人工补绘或学校授权数据校准。",
        `本次导入 OSM 要素 ${generated.stats.elements} 个：way ${generated.stats.ways}、node ${generated.stats.nodes}、建筑 ${generated.stats.buildings}、道路 ${generated.stats.roads}、步道 ${generated.stats.paths}、水体 ${generated.stats.water}、运动 ${generated.stats.sport}、命名 POI ${generated.stats.namedPois}。`
      ],
      importPlan: [
        "用 Overpass API 拉取校区周边建筑、道路、步道、水体、运动场、POI。",
        "按校区中心点和 metersPerTile 投影到 72x48 像素网格。",
        "把 OSM way 栅格化为建筑、道路、水体、操场等 tile，把 POI 写入独立标识层。",
        "后续拿到学校授权 GeoJSON/CAD 后，用同一投影与栅格化规则替换 OSM 输入。"
      ],
      rows: generated.rows,
      pois: Array.from(poiByKey.values()),
      sourceUrls: [
        "https://www.openstreetmap.org/copyright",
        "https://overpass-api.de/",
        "https://www.swupl.edu.cn/"
      ],
      osmStats: generated.stats
    });
    console.log(`${campus.id}: ${generated.stats.elements} OSM elements, ${Array.from(poiByKey.values()).length} POIs`);
  }

  const header = `import type { CampusPixelMap } from "./swuplCampusMap";\n\n`;
  const body = `export const generatedOsmCampusMaps = ${asTsString(maps)} satisfies Array<CampusPixelMap & { osmStats?: Record<string, number> }>;\n`;
  await fs.writeFile(outputPath, header + body, "utf8");
  console.log(`wrote ${outputPath}`);
}

await main();
