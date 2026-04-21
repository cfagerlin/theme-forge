// Tests for lib/scorer-adjustments.js v0.22 element-rule clamp.
// Run: bun tests/scorer-adjustments.test.ts
//
// v0.23 note: source-binding is applied as a three-tier veto in lib/ranker.js,
// not as a score delta. This module retains only the Stage 1 element-rule clamp
// used within a veto tier. See plans/v0.23-source-binding.md § "Ranking
// adjustment — veto, not a score delta".

import { applyScoreAdjustments, STAGE_1_FLOOR, STAGE_1_CEIL } from "../intake-anchors/lib/scorer-adjustments.js";

function approx(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

function expect(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

console.log("── element-rule clamp bounds ──");
{
  expect(STAGE_1_FLOOR === -0.2, `floor = -0.20 (got ${STAGE_1_FLOOR})`);
  expect(STAGE_1_CEIL === 0.15, `ceil = +0.15 (got ${STAGE_1_CEIL})`);
}

console.log("\n── delta within bounds passes through ──");
{
  const r = applyScoreAdjustments({ base: 0.6, elementRule: 0.1 });
  expect(approx(r.final, 0.7), `+0.10 element → 0.70 (got ${r.final})`);
  const r2 = applyScoreAdjustments({ base: 0.6, elementRule: -0.1 });
  expect(approx(r2.final, 0.5), `-0.10 element → 0.50 (got ${r2.final})`);
}

console.log("\n── delta beyond cap is clamped ──");
{
  const r1 = applyScoreAdjustments({ base: 0.5, elementRule: 0.5 });
  expect(approx(r1.final, 0.65), `+0.5 element clamped to +0.15 (got ${r1.final})`);
  const r2 = applyScoreAdjustments({ base: 0.5, elementRule: -0.5 });
  expect(approx(r2.final, 0.3), `-0.5 element clamped to -0.20 (got ${r2.final})`);
}

console.log("\n── zero delta leaves score unchanged ──");
{
  const r = applyScoreAdjustments({ base: 0.73, elementRule: 0 });
  expect(approx(r.final, 0.73), `+0 element → base (got ${r.final})`);
}

console.log("\n── default elementRule is 0 ──");
{
  const r = applyScoreAdjustments({ base: 0.42 });
  expect(approx(r.final, 0.42), `no elementRule → base (got ${r.final})`);
}

if (process.exitCode === 1) {
  console.log("\n✗ SCORER-ADJUSTMENTS FAILED\n");
} else {
  console.log("\n✓ SCORER-ADJUSTMENTS PASSED\n");
}
