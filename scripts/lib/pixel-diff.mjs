// pixel-diff.mjs — pixel-perfect PNG diff with region clustering.
//
// The model's image-input pipeline downscales any PNG to a few hundred
// pixels wide before the model sees it. A 1px border on a 2560px capture
// averages into the surrounding pixels and disappears. This module gives
// agents a text-based verification path: read mismatched-pixel counts and
// bounding-box regions instead of trying to see the image.
//
// Usage:
//   bun run scripts/lib/pixel-diff.mjs \
//     --a path/to/a.png --b path/to/b.png \
//     --out-json path/to/diff.json \
//     --out-png  path/to/diff.png \
//     [--threshold 0.1] [--alpha 0.1] [--include-aa]
//
// Output JSON shape:
//   {
//     status: "ok" | "size_mismatch",
//     width, height,
//     totalPixels, mismatchedPixels, ratio,
//     regions: [{ x, y, w, h, pixels }],   // bounding boxes of clusters
//     a: { path, sha256 }, b: { path, sha256 }
//   }

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Default threshold is 0.05, not pixelmatch's 0.1. At 0.1 a 1px #e8e8e8
// hairline on #fcfcfc background reports zero mismatched pixels because
// the YIQ delta is squared into pixelmatch's max-delta budget. 0.05
// catches it while still ignoring jpeg-style noise. Calibrated against
// the bamako breadcrumb-border case.
function parseArgs(argv) {
  const args = { threshold: 0.05, alpha: 0.1, includeAA: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--a") args.a = argv[++i];
    else if (k === "--b") args.b = argv[++i];
    else if (k === "--out-json") args.outJson = argv[++i];
    else if (k === "--out-png") args.outPng = argv[++i];
    else if (k === "--threshold") args.threshold = parseFloat(argv[++i]);
    else if (k === "--alpha") args.alpha = parseFloat(argv[++i]);
    else if (k === "--include-aa") args.includeAA = true;
  }
  if (!args.a || !args.b) {
    throw new Error("--a and --b are required");
  }
  return args;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readPng(path) {
  return PNG.sync.read(readFileSync(path));
}

// Cluster mismatched pixels into bounding boxes via flood-fill on a
// downsampled grid (8px tiles). Keeps the algorithm linear in image size
// while merging adjacent diffs into one region instead of N spurious
// 1-pixel "regions" per anti-aliasing stipple.
function clusterRegions(diffMask, width, height, tileSize = 8) {
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const tiles = new Uint32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (diffMask[y * width + x]) {
        tiles[Math.floor(y / tileSize) * cols + Math.floor(x / tileSize)]++;
      }
    }
  }
  const visited = new Uint8Array(cols * rows);
  const regions = [];
  const stack = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (!tiles[idx] || visited[idx]) continue;
      let minC = c, maxC = c, minR = r, maxR = r, pixels = 0;
      stack.push(idx);
      visited[idx] = 1;
      while (stack.length) {
        const cur = stack.pop();
        const cr = Math.floor(cur / cols);
        const cc = cur % cols;
        pixels += tiles[cur];
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nidx = nr * cols + nc;
          if (visited[nidx] || !tiles[nidx]) continue;
          visited[nidx] = 1;
          stack.push(nidx);
        }
      }
      regions.push({
        x: minC * tileSize,
        y: minR * tileSize,
        w: (maxC - minC + 1) * tileSize,
        h: (maxR - minR + 1) * tileSize,
        pixels,
      });
    }
  }
  regions.sort((a, b) => b.pixels - a.pixels);
  return regions;
}

export function diffPngs({ a, b, outJson, outPng, threshold = 0.05, alpha = 0.1, includeAA = false }) {
  const aPng = readPng(a);
  const bPng = readPng(b);
  if (aPng.width !== bPng.width || aPng.height !== bPng.height) {
    const out = {
      status: "size_mismatch",
      a: { path: a, width: aPng.width, height: aPng.height, sha256: sha256(a) },
      b: { path: b, width: bPng.width, height: bPng.height, sha256: sha256(b) },
    };
    if (outJson) writeFileSync(outJson, JSON.stringify(out, null, 2));
    return out;
  }
  const { width, height } = aPng;
  const diffPng = new PNG({ width, height });
  const mismatched = pixelmatch(
    aPng.data,
    bPng.data,
    diffPng.data,
    width,
    height,
    { threshold, alpha, includeAA, diffColor: [255, 0, 0] }
  );
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    if (diffPng.data[off] === 255 && diffPng.data[off + 1] === 0 && diffPng.data[off + 2] === 0) {
      mask[i] = 1;
    }
  }
  const regions = clusterRegions(mask, width, height);
  const total = width * height;
  const out = {
    status: "ok",
    width,
    height,
    totalPixels: total,
    mismatchedPixels: mismatched,
    ratio: mismatched / total,
    regions,
    a: { path: a, sha256: sha256(a) },
    b: { path: b, sha256: sha256(b) },
  };
  if (outPng) writeFileSync(outPng, PNG.sync.write(diffPng));
  if (outJson) writeFileSync(outJson, JSON.stringify(out, null, 2));
  return out;
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const result = diffPngs(args);
  if (result.status === "size_mismatch") {
    console.error(`size_mismatch: a=${result.a.width}x${result.a.height} b=${result.b.width}x${result.b.height}`);
    process.exit(2);
  }
  console.log(JSON.stringify(result));
}
