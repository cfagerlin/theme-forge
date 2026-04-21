// Pixel-diff regression. The model can't see a 1px hairline in a
// downscaled screenshot. This test proves pixel-diff catches it as text:
// build two synthetic 2560×1440 PNGs identical except for a 1px bottom
// border on a 600px-wide region, run the diff, assert region detection.
//
// Run: bun tests/pixel-diff.test.ts

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { diffPngs } from "../scripts/lib/pixel-diff.mjs";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
    failures.push(label);
  }
}

function makeBg(width: number, height: number, rgb: [number, number, number]): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    png.data[off] = rgb[0];
    png.data[off + 1] = rgb[1];
    png.data[off + 2] = rgb[2];
    png.data[off + 3] = 255;
  }
  return png;
}

function drawRect(png: PNG, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const off = (yy * png.width + xx) * 4;
      png.data[off] = rgb[0];
      png.data[off + 1] = rgb[1];
      png.data[off + 2] = rgb[2];
      png.data[off + 3] = 255;
    }
  }
}

const tmp = mkdtempSync(join(tmpdir(), "theme-forge-pixel-diff-"));

try {
  console.log("\n── 1. Identical PNGs report zero mismatch ──\n");
  {
    const a = makeBg(800, 600, [252, 252, 252]);
    const b = makeBg(800, 600, [252, 252, 252]);
    const aPath = join(tmp, "ident-a.png");
    const bPath = join(tmp, "ident-b.png");
    writeFileSync(aPath, PNG.sync.write(a));
    writeFileSync(bPath, PNG.sync.write(b));
    const result = diffPngs({ a: aPath, b: bPath });
    assert("status = ok", result.status === "ok", result.status);
    assert("mismatchedPixels = 0", result.mismatchedPixels === 0, String(result.mismatchedPixels));
    assert("regions = []", result.regions.length === 0, String(result.regions.length));
  }

  console.log("\n── 2. 1px hairline border on #fcfcfc bg (the bamako case) ──\n");
  {
    // 2560×1440 #fcfcfc background, draw a 1px high #e8e8e8 line spanning
    // x=200..800 at y=500. This is exactly the divider the agent could not
    // see in the downscaled screenshot.
    const a = makeBg(2560, 1440, [252, 252, 252]);
    const b = makeBg(2560, 1440, [252, 252, 252]);
    drawRect(b, 200, 500, 600, 1, [232, 232, 232]);
    const aPath = join(tmp, "hairline-a.png");
    const bPath = join(tmp, "hairline-b.png");
    writeFileSync(aPath, PNG.sync.write(a));
    writeFileSync(bPath, PNG.sync.write(b));
    const jsonOut = join(tmp, "hairline-diff.json");
    const result = diffPngs({ a: aPath, b: bPath, outJson: jsonOut });
    assert("status = ok", result.status === "ok");
    assert("detected ≥ 600 mismatched pixels", result.mismatchedPixels >= 600, `got ${result.mismatchedPixels}`);
    assert("ratio < 0.001 (sparse, but real)", result.ratio < 0.001 && result.ratio > 0, `ratio=${result.ratio.toExponential(2)}`);
    assert("exactly 1 region clustered", result.regions.length === 1, `got ${result.regions.length}`);
    if (result.regions[0]) {
      const r = result.regions[0];
      assert("region brackets the hairline x=[200,800)", r.x <= 200 && r.x + r.w >= 800, `x=${r.x} w=${r.w}`);
      assert("region brackets the hairline y=500", r.y <= 500 && r.y + r.h > 500, `y=${r.y} h=${r.h}`);
    }
    const onDisk = JSON.parse(readFileSync(jsonOut, "utf8"));
    assert("JSON written includes sha256s", typeof onDisk.a.sha256 === "string" && onDisk.a.sha256.length === 64);
  }

  console.log("\n── 3. Size mismatch returns size_mismatch (not crash) ──\n");
  {
    const a = makeBg(100, 100, [255, 255, 255]);
    const b = makeBg(200, 100, [255, 255, 255]);
    const aPath = join(tmp, "size-a.png");
    const bPath = join(tmp, "size-b.png");
    writeFileSync(aPath, PNG.sync.write(a));
    writeFileSync(bPath, PNG.sync.write(b));
    const result = diffPngs({ a: aPath, b: bPath });
    assert("status = size_mismatch", result.status === "size_mismatch", result.status);
    assert("a dimensions reported", result.a.width === 100 && result.a.height === 100);
    assert("b dimensions reported", result.b.width === 200 && result.b.height === 100);
  }

  console.log("\n── 4. Two separated regions cluster as two ──\n");
  {
    const a = makeBg(800, 600, [252, 252, 252]);
    const b = makeBg(800, 600, [252, 252, 252]);
    drawRect(b, 50, 50, 30, 30, [232, 232, 232]);
    drawRect(b, 500, 400, 30, 30, [232, 232, 232]);
    const aPath = join(tmp, "two-a.png");
    const bPath = join(tmp, "two-b.png");
    writeFileSync(aPath, PNG.sync.write(a));
    writeFileSync(bPath, PNG.sync.write(b));
    const result = diffPngs({ a: aPath, b: bPath });
    assert("two distinct regions", result.regions.length === 2, String(result.regions.length));
  }

  console.log(`\n── ${passed}/${passed + failed} assertions passed ──`);
  if (failed > 0) {
    console.log(`\n✗ PIXEL-DIFF FAILED: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\n✓ PIXEL-DIFF PASSED");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
