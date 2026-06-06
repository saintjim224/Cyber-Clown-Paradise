import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repoRoot, "小丑素材");
const publicRoot = path.join(repoRoot, "apps", "web", "public", "clowns");
const generatedModulePath = path.join(repoRoot, "apps", "web", "src", "lib", "generatedClownAssets.ts");
const gridSize = 5;
const frameSize = 64;

const pools = [
  {
    pool: "I",
    slug: "i",
    sourceDir: path.join(sourceRoot, "小丑素材i人版")
  },
  {
    pool: "E",
    slug: "e",
    sourceDir: path.join(sourceRoot, "小丑素材e人版")
  }
];

const actions = {
  idle: { start: 0, frames: 1, fps: 1 },
  "walk-front": { start: 0, frames: 5, fps: 6 },
  "walk-side": { start: 5, frames: 5, fps: 6 },
  "walk-back": { start: 10, frames: 5, fps: 6 },
  special: { start: 15, frames: 10, fps: 5 }
};

function pixelOffset(width, x, y) {
  return (y * width + x) * 4;
}

function isBackgroundLike(r, g, b, a) {
  if (a < 24) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const average = (r + g + b) / 3;
  const neutralChecker = average >= 118 && average <= 248 && spread <= 50;
  const washedWhite = r >= 210 && g >= 210 && b >= 210 && spread <= 66;
  return neutralChecker || washedWhite;
}

function copyPixel(source, sx, sy, target, tx, ty) {
  const sourceOffset = pixelOffset(source.width, sx, sy);
  const targetOffset = pixelOffset(target.width, tx, ty);
  target.data[targetOffset] = source.data[sourceOffset];
  target.data[targetOffset + 1] = source.data[sourceOffset + 1];
  target.data[targetOffset + 2] = source.data[sourceOffset + 2];
  target.data[targetOffset + 3] = source.data[sourceOffset + 3];
}

function clearBackgroundByFloodFill(image) {
  const width = image.width;
  const height = image.height;
  const background = new Uint8Array(width * height);
  const queue = [];

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (background[index]) return;
    const offset = index * 4;
    if (!isBackgroundLike(image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3])) return;
    background[index] = 1;
    queue.push([x, y]);
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      if (background[index]) {
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 0;
        continue;
      }
      if (image.data[offset + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return maxX >= minX && maxY >= minY ? { minX, minY, maxX, maxY } : null;
}

function cropCell(source, row, column) {
  const startX = Math.round((column * source.width) / gridSize);
  const endX = Math.round(((column + 1) * source.width) / gridSize);
  const startY = Math.round((row * source.height) / gridSize);
  const endY = Math.round(((row + 1) * source.height) / gridSize);
  const width = Math.max(1, endX - startX);
  const height = Math.max(1, endY - startY);
  const cell = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      copyPixel(source, startX + x, startY + y, cell, x, y);
    }
  }

  return { cell, bounds: clearBackgroundByFloodFill(cell) };
}

function renderFrame(source, row, column) {
  const { cell, bounds } = cropCell(source, row, column);
  const target = new PNG({ width: frameSize, height: frameSize });
  if (!bounds) return target;

  const sourceWidth = bounds.maxX - bounds.minX + 1;
  const sourceHeight = bounds.maxY - bounds.minY + 1;
  const scale = Math.min(58 / sourceWidth, 58 / sourceHeight);
  const drawnWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawnHeight = Math.max(1, Math.round(sourceHeight * scale));
  const targetX = Math.round((frameSize - drawnWidth) / 2);
  const targetY = Math.max(0, frameSize - drawnHeight - 3);

  for (let y = 0; y < drawnHeight; y += 1) {
    for (let x = 0; x < drawnWidth; x += 1) {
      const sx = bounds.minX + Math.min(sourceWidth - 1, Math.floor(x / scale));
      const sy = bounds.minY + Math.min(sourceHeight - 1, Math.floor(y / scale));
      copyPixel(cell, sx, sy, target, targetX + x, targetY + y);
    }
  }

  return target;
}

function writeFrameToStrip(frame, strip, frameIndex) {
  const startX = frameIndex * frameSize;
  for (let y = 0; y < frameSize; y += 1) {
    for (let x = 0; x < frameSize; x += 1) {
      copyPixel(frame, x, y, strip, startX + x, y);
    }
  }
}

function assetIdFor(fileName, poolSlug, index) {
  const match = fileName.match(/clown-(\d+)/i);
  if (match) return `clown-${match[1].padStart(3, "0")}`;
  return `${poolSlug}-${String(index + 1).padStart(3, "0")}`;
}

function auditFrameForReachableBackground(image, frameStartX, frameWidth, frameHeight) {
  const visited = new Uint8Array(frameWidth * frameHeight);
  const queue = [];
  let reachableOpaqueBackground = 0;

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= frameWidth || y >= frameHeight) return;
    const localIndex = y * frameWidth + x;
    if (visited[localIndex]) return;
    const offset = pixelOffset(image.width, frameStartX + x, y);
    if (image.data[offset + 3] < 24) return;
    if (!isBackgroundLike(image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3])) return;
    visited[localIndex] = 1;
    reachableOpaqueBackground += 1;
    queue.push([x, y]);
  }

  for (let x = 0; x < frameWidth; x += 1) {
    enqueue(x, 0);
    enqueue(x, frameHeight - 1);
  }
  for (let y = 0; y < frameHeight; y += 1) {
    enqueue(0, y);
    enqueue(frameWidth - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return reachableOpaqueBackground;
}

async function auditPng(filePath) {
  const image = PNG.sync.read(await fs.readFile(filePath));
  const frameCount = Math.max(1, Math.round(image.width / frameSize));
  const frameHeight = image.height;
  const issues = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const count = auditFrameForReachableBackground(image, frameIndex * frameSize, frameSize, frameHeight);
    if (count > 80) issues.push({ frameIndex, count });
  }

  return issues;
}

function publicUrlToPath(url) {
  return path.join(repoRoot, "apps", "web", "public", url.replace(/^\//, ""));
}

async function auditGeneratedTransparency(manifest) {
  const failures = [];
  const assets = [...manifest.pools.I, ...manifest.pools.E];

  for (const asset of assets) {
    for (const [kind, url] of [["preview", asset.preview_url], ["sprite", asset.sprite_url]]) {
      const issues = await auditPng(publicUrlToPath(url));
      if (issues.length > 0) {
        failures.push({
          asset_id: asset.asset_id,
          asset_pool: asset.asset_pool,
          kind,
          frames: issues.slice(0, 5)
        });
      }
    }
  }

  if (failures.length > 0) {
    console.error("Transparency audit found reachable opaque gray/white background:");
    console.error(JSON.stringify(failures, null, 2));
    throw new Error(`Transparency audit failed for ${failures.length} generated PNG files.`);
  }
}

async function processPool({ pool, slug, sourceDir }) {
  const outDir = path.join(publicRoot, slug);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));

  const assets = [];
  for (const [index, fileName] of files.entries()) {
    const id = assetIdFor(fileName, slug, index);
    const sourcePath = path.join(sourceDir, fileName);
    const assetDir = path.join(outDir, id);
    await fs.mkdir(assetDir, { recursive: true });

    const source = PNG.sync.read(await fs.readFile(sourcePath));
    const strip = new PNG({ width: frameSize * gridSize * gridSize, height: frameSize });
    let preview = null;
    let frameIndex = 0;

    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const frame = renderFrame(source, row, column);
        if (frameIndex === 0) preview = frame;
        writeFrameToStrip(frame, strip, frameIndex);
        frameIndex += 1;
      }
    }

    await fs.writeFile(path.join(assetDir, "sprite.png"), PNG.sync.write(strip));
    await fs.writeFile(path.join(assetDir, "preview.png"), PNG.sync.write(preview ?? new PNG({ width: frameSize, height: frameSize })));

    assets.push({
      asset_id: id,
      asset_pool: pool,
      label: id,
      source_file: fileName,
      preview_url: `/clowns/${slug}/${id}/preview.png`,
      sprite_url: `/clowns/${slug}/${id}/sprite.png`,
      frame_size: frameSize,
      actions
    });
  }

  return assets;
}

async function main() {
  const manifest = {
    version: "clown-sprite-v1",
    frame_size: frameSize,
    frame_count: gridSize * gridSize,
    pools: {
      I: [],
      E: []
    }
  };

  await fs.mkdir(publicRoot, { recursive: true });
  for (const pool of pools) {
    manifest.pools[pool.pool] = await processPool(pool);
  }

  await fs.writeFile(path.join(publicRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(
    generatedModulePath,
    `export const generatedClownAssets = ${JSON.stringify(manifest, null, 2)} as const;\n`,
    "utf8"
  );

  await auditGeneratedTransparency(manifest);

  console.log(
    `Generated ${manifest.pools.I.length} I-pool and ${manifest.pools.E.length} E-pool clown sprite assets.`
  );
  console.log("Transparency audit passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
