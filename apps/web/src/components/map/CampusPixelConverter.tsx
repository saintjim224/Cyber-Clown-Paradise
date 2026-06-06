"use client";

import { Download, FileJson, Grid3X3, Image as ImageIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { campusPixelMaps, tileLegend, type CampusPixelMap, type CampusPoiType, type CampusTile } from "@/lib/swuplCampusMap";

type PixelStyle = "soft" | "crisp" | "night";

type TilePalette = {
  base: string;
  shade: string;
  highlight: string;
  accent?: string;
};

const tilePalettes: Record<PixelStyle, Record<CampusTile, TilePalette>> = {
  soft: {
    grass: { base: "#76c95a", shade: "#4fa23e", highlight: "#9be36d" },
    tree: { base: "#2f7b38", shade: "#1d5a2b", highlight: "#61b84b" },
    path: { base: "#d9b66a", shade: "#b98748", highlight: "#f2d88a" },
    road: { base: "#6b686f", shade: "#484750", highlight: "#aaa5a4", accent: "#f2d36b" },
    water: { base: "#42a6e8", shade: "#2476b9", highlight: "#89d8ff" },
    building: { base: "#d56f3f", shade: "#9b4729", highlight: "#f29a61" },
    dorm: { base: "#bd7754", shade: "#82432c", highlight: "#e0a06f" },
    court: { base: "#386dd2", shade: "#244993", highlight: "#8ab1ff" },
    plaza: { base: "#e5be63", shade: "#b9843f", highlight: "#ffe18a" },
    gate: { base: "#7b4a2a", shade: "#4d2f1d", highlight: "#c07a42" },
    landmark: { base: "#ffd84a", shade: "#c59024", highlight: "#fff09a" },
    social: { base: "#f05a3d", shade: "#b7332a", highlight: "#ffd84a" }
  },
  crisp: {
    grass: { base: "#5fbf49", shade: "#2f8a36", highlight: "#b6e85f" },
    tree: { base: "#1f6a31", shade: "#123f25", highlight: "#4fa943" },
    path: { base: "#c99748", shade: "#8d6230", highlight: "#f0c46d" },
    road: { base: "#52545b", shade: "#30323a", highlight: "#9da1a8", accent: "#ffd84a" },
    water: { base: "#2c90d2", shade: "#175f9d", highlight: "#73d5ff" },
    building: { base: "#c45635", shade: "#7f321f", highlight: "#f07d4f" },
    dorm: { base: "#a96144", shade: "#6f3827", highlight: "#cf8b61" },
    court: { base: "#285cc0", shade: "#173a83", highlight: "#6ea4ff" },
    plaza: { base: "#dca843", shade: "#93652c", highlight: "#ffd86a" },
    gate: { base: "#6c4027", shade: "#3b2418", highlight: "#b76c3a" },
    landmark: { base: "#ffce35", shade: "#a8731d", highlight: "#fff07a" },
    social: { base: "#de4334", shade: "#8e261e", highlight: "#ffd84a" }
  },
  night: {
    grass: { base: "#4c8f4b", shade: "#2a6233", highlight: "#77b862" },
    tree: { base: "#1f5531", shade: "#143724", highlight: "#3e8a48" },
    path: { base: "#9e7e4f", shade: "#6e5237", highlight: "#d0ad70" },
    road: { base: "#3f4353", shade: "#282b36", highlight: "#777b8c", accent: "#f0ce5c" },
    water: { base: "#246c9e", shade: "#15486e", highlight: "#55b7df" },
    building: { base: "#9e4c36", shade: "#642d24", highlight: "#c86c4f" },
    dorm: { base: "#8b563f", shade: "#543126", highlight: "#b17959" },
    court: { base: "#274a94", shade: "#18305f", highlight: "#587fcb" },
    plaza: { base: "#ad8644", shade: "#725530", highlight: "#d9b55e" },
    gate: { base: "#5b3826", shade: "#332017", highlight: "#95633d" },
    landmark: { base: "#d8af3a", shade: "#8c681f", highlight: "#ffe56f" },
    social: { base: "#b94036", shade: "#742923", highlight: "#f1c84d" }
  }
};

const poiTypeLabel: Record<CampusPoiType, string> = {
  gate: "入口",
  study: "学习",
  social: "社交",
  sport: "运动",
  lake: "湖畔",
  dorm: "宿舍",
  service: "补给"
};

const tileLabel: Record<CampusTile, string> = {
  grass: "草地",
  tree: "树木",
  path: "小路",
  road: "道路",
  water: "水体",
  building: "建筑",
  dorm: "宿舍",
  court: "运动场",
  plaza: "广场",
  gate: "校门",
  landmark: "地标",
  social: "社交点"
};

const legendTiles: CampusTile[] = ["grass", "tree", "path", "road", "water", "building", "dorm", "court", "plaza", "gate", "landmark", "social"];
const tileSize = 14;

function variantSeed(x: number, y: number, salt = 0) {
  return Math.abs((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791));
}

function fillPixel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
}

function fillRectPixel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function strokeInset(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color = "rgb(31 34 48 / 0.18)") {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

function drawTile(ctx: CanvasRenderingContext2D, tile: CampusTile, x: number, y: number, size: number, palette: Record<CampusTile, TilePalette>) {
  const colors = palette[tile];
  const px = x * size;
  const py = y * size;
  const seed = variantSeed(x, y, tile.length);

  fillPixel(ctx, px, py, size, colors.base);
  fillRectPixel(ctx, px, py, size, 1, colors.highlight);
  fillRectPixel(ctx, px, py, 1, size, colors.highlight);
  fillRectPixel(ctx, px, py + size - 2, size, 2, colors.shade);
  fillRectPixel(ctx, px + size - 2, py, 2, size, colors.shade);

  if (tile === "grass") {
    fillPixel(ctx, px + 3, py + 4, 2, colors.highlight);
    fillPixel(ctx, px + 9, py + 9, 2, seed % 2 === 0 ? colors.shade : colors.highlight);
    fillPixel(ctx, px + 5, py + 11, 2, "#4f9e3e");
  }
  if (tile === "tree") {
    fillRectPixel(ctx, px + 1, py + 2, size - 2, size - 5, colors.shade);
    fillRectPixel(ctx, px + 3, py + 1, size - 6, 5, colors.highlight);
    fillRectPixel(ctx, px + 5, py + 8, 4, 5, "#6b4b2a");
    fillRectPixel(ctx, px + 2, py + 7, 4, 3, "#2f7434");
  }
  if (tile === "path") {
    fillPixel(ctx, px + 2, py + 4, 3, colors.highlight);
    fillPixel(ctx, px + 8, py + 9, 3, colors.shade);
    fillPixel(ctx, px + 6, py + 2, 2, "#f1d68d");
  }
  if (tile === "road") {
    fillRectPixel(ctx, px + 2, py + 3, 3, 2, colors.highlight);
    fillRectPixel(ctx, px + 8, py + 8, 3, 2, colors.shade);
    fillRectPixel(ctx, px + 4, py + 11, 2, 2, "#f1d68d");
  }
  if (tile === "water") {
    fillPixel(ctx, px + 2, py + 4 + (seed % 2), 5, colors.highlight);
    fillPixel(ctx, px + 8, py + 9, 4, colors.shade);
    fillRectPixel(ctx, px, py, size, 1, "#b7edff");
  }
  if (tile === "building" || tile === "dorm") {
    fillRectPixel(ctx, px + 1, py + 1, size - 2, 3, tile === "dorm" ? "#d49361" : "#f0a35c");
    fillPixel(ctx, px + 3, py + 5, 3, "#ffe7a3");
    fillPixel(ctx, px + 8, py + 5, 3, "#4e3b46");
    fillPixel(ctx, px + 5, py + 10, 4, colors.shade);
    strokeInset(ctx, px, py, size);
  }
  if (tile === "court") {
    strokeInset(ctx, px + 2, py + 2, size - 4, "#fff8dc");
    fillRectPixel(ctx, px + 1, py + 6, size - 2, 1, "#fff8dc");
    fillRectPixel(ctx, px + 6, py + 1, 1, size - 2, "#fff8dc");
  }
  if (tile === "plaza") {
    fillPixel(ctx, px + 3, py + 3, 2, colors.highlight);
    fillPixel(ctx, px + 9, py + 3, 2, colors.shade);
    fillPixel(ctx, px + 6, py + 9, 2, colors.highlight);
    strokeInset(ctx, px, py, size, "rgb(123 80 41 / 0.24)");
  }
  if (tile === "gate") {
    fillRectPixel(ctx, px + 2, py + 2, 3, 10, colors.highlight);
    fillRectPixel(ctx, px + 9, py + 2, 3, 10, colors.highlight);
    fillRectPixel(ctx, px + 2, py + 3, 10, 3, colors.shade);
  }
  if (tile === "landmark") {
    fillRectPixel(ctx, px + 4, py + 2, 6, 3, "#fff8dc");
    fillRectPixel(ctx, px + 5, py + 5, 4, 6, colors.shade);
    strokeInset(ctx, px + 3, py + 1, 8, "#1f2230");
  }
  if (tile === "social") {
    fillRectPixel(ctx, px + 5, py + 2, 3, 10, "#e23d2f");
    fillRectPixel(ctx, px + 2, py + 6, 10, 3, "#2c67c7");
    fillPixel(ctx, px + 5, py + 6, 3, "#ffd84a");
  }
}

function drawPoi(ctx: CanvasRenderingContext2D, poiX: number, poiY: number, type: CampusPoiType, label: string, scale: number) {
  const x = poiX * scale;
  const y = poiY * scale;
  ctx.fillStyle = "#1f2230";
  ctx.fillRect(x + 3, y - 10, 10, 10);
  ctx.fillStyle = type === "social" ? "#e23d2f" : type === "lake" ? "#3aa7ff" : type === "sport" ? "#2c67c7" : type === "dorm" ? "#ffd84a" : "#fff8dc";
  ctx.fillRect(x + 5, y - 8, 6, 6);
  ctx.fillStyle = "#fff8dc";
  ctx.fillRect(x + 14, y - 13, Math.min(88, label.length * 11 + 10), 15);
  ctx.strokeStyle = "#1f2230";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 14, y - 13, Math.min(88, label.length * 11 + 10), 15);
  ctx.fillStyle = "#1f2230";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillText(label.slice(0, 7), x + 19, y - 3);
}

function drawCampusToCanvas(canvas: HTMLCanvasElement, campus: CampusPixelMap, style: PixelStyle, showLabels: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = campus.width * tileSize;
  const height = campus.height * tileSize;
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  const palette = tilePalettes[style];
  campus.rows.forEach((row, y) => {
    row.split("").forEach((symbol, x) => {
      drawTile(ctx, tileLegend[symbol] ?? "grass", x, y, tileSize, palette);
    });
  });

  if (showLabels) {
    campus.pois.forEach((poi) => drawPoi(ctx, poi.x, poi.y, poi.type, poi.label, tileSize));
  }
}

function buildExportPayload(campus: CampusPixelMap, style: PixelStyle) {
  return {
    version: "swupl-pixel-campus-v1",
    source: campus.dataStatus === "ready-for-authorized-import" ? "openstreetmap-overpass-rasterized-campus-map" : "project-owned-structured-campus-map",
    attribution:
      campus.dataStatus === "ready-for-authorized-import"
        ? "Contains information from OpenStreetMap, which is made available under the Open Database License (ODbL). See https://www.openstreetmap.org/copyright."
        : "Generated from project-owned structured tile data.",
    note:
      campus.dataStatus === "ready-for-authorized-import"
        ? "This payload is generated by rasterizing OSM vector features into project-owned pixel tiles. Do not use scraped commercial map tiles as source art."
        : "This payload is generated from project-owned tile data. Do not use scraped commercial map tiles as source art.",
    campus: {
      id: campus.id,
      name: campus.name,
      address: campus.address,
      width: campus.width,
      height: campus.height,
      metersPerTile: campus.metersPerTile,
      fallbackCenter: campus.fallbackCenter
    },
    style,
    legend: tileLegend,
    sourceNotes: campus.sourceNotes,
    sourceUrls: campus.sourceUrls,
    rows: campus.rows,
    pois: campus.pois
  };
}

export function CampusPixelConverter() {
  const [campusId, setCampusId] = useState(campusPixelMaps[0].id);
  const [style, setStyle] = useState<PixelStyle>("soft");
  const [showLabels, setShowLabels] = useState(true);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const campus = useMemo(() => campusPixelMaps.find((item) => item.id === campusId) ?? campusPixelMaps[0], [campusId]);
  const exportPayload = useMemo(() => buildExportPayload(campus, style), [campus, style]);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawCampusToCanvas(canvasRef.current, campus, style, showLabels);
  }, [campus, showLabels, style]);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${campus.id}-${style}-pixel-campus.png`;
    link.click();
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${campus.id}-pixel-campus.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="pixel-converter" aria-label="星露谷像素风地图转换器">
      <div className="pixel-converter__header">
        <div>
          <span className="pixel-kicker">PIXEL TILE CONVERTER</span>
          <h2>星露谷式校区转换器</h2>
          <p>把 OSM/Overpass 校区结构数据转换为自有像素 tile 层。高德用于真实比例参考，不把商业底图截图当素材复制。</p>
        </div>
        <Grid3X3 color="var(--color-red)" aria-hidden />
      </div>

      <div className="pixel-converter__controls">
        <div className="pixel-converter__tabs" role="tablist" aria-label="选择转换校区">
          {campusPixelMaps.map((item) => (
            <button key={item.id} type="button" data-active={item.id === campus.id} onClick={() => setCampusId(item.id)}>
              {item.name}
            </button>
          ))}
        </div>
        <div className="pixel-converter__segmented" aria-label="选择像素风格">
          {(["soft", "crisp", "night"] as PixelStyle[]).map((item) => (
            <button key={item} type="button" data-active={item === style} onClick={() => setStyle(item)}>
              {item === "soft" ? "柔合彩色" : item === "crisp" ? "清晰复古" : "夜游灯光"}
            </button>
          ))}
        </div>
        <label className="pixel-converter__toggle">
          <input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} />
          显示地点标识
        </label>
      </div>

      <div className="pixel-converter__stage">
        <div className="pixel-converter__canvas-wrap">
          <canvas ref={canvasRef} aria-label={`${campus.name} 星露谷像素风预览`} />
        </div>
        <aside className="pixel-converter__side">
          <div className="pixel-converter__metric">
            <strong>{campus.width} x {campus.height}</strong>
            <span>tile 网格</span>
          </div>
          <div className="pixel-converter__metric">
            <strong>{campus.metersPerTile}m / 格</strong>
            <span>当前比例尺</span>
          </div>
          <div className="pixel-converter__metric">
            <strong>{campus.pois.length}</strong>
            <span>地点标识</span>
          </div>
          <div className="pixel-converter__actions">
            <button type="button" onClick={downloadPng}>
              <ImageIcon size={16} aria-hidden />
              导出 PNG
            </button>
            <button type="button" onClick={downloadJson}>
              <Download size={16} aria-hidden />
              导出 JSON
            </button>
            <button type="button" onClick={copyJson}>
              <FileJson size={16} aria-hidden />
              {copied ? "已复制" : "复制数据"}
            </button>
          </div>
        </aside>
      </div>

      <div className="pixel-converter__legend" aria-label="像素地块图例">
        {legendTiles.map((tile) => (
          <span key={tile}>
            <i style={{ background: tilePalettes[style][tile].base, boxShadow: `inset -4px -4px 0 ${tilePalettes[style][tile].shade}` }} />
            {tileLabel[tile]}
          </span>
        ))}
      </div>

      <div className="pixel-converter__pipeline">
        <strong>OSM 转换状态</strong>
        <p>当前三个校区已用 OSM 要素生成像素 tile，导出 JSON 会保留 OSM/ODbL 署名。宝圣湖等覆盖稀疏区域仍用项目 POI 兜底，后续可直接替换为学校授权矢量数据。</p>
      </div>
    </section>
  );
}
