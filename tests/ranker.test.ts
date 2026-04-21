// Tests for lib/ranker.js three-tier veto.
// Run: bun tests/ranker.test.ts
//
// Mirrors the five test-plan scenarios from plans/v0.23-source-binding.md § "Test plan":
//   1. Veto flips winner
//   2. All-rejected falls back to inconclusive
//   3. Parity mismatch on cross-verify
//   4. Inconclusive tier uses v0.22 scoring unchanged (no veto influence)
//   5. --ignore-source-binding escape hatch honored

import { rankWithVeto, sourceBindingParity } from "../intake-anchors/lib/ranker.js";

function expect(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

const CITE = { filepath: "sections/product.liquid", line: 12, column: 3 };

console.log("── 1. Veto flips winner (confirmed beats higher-scored rejected) ──");
{
  const r = rankWithVeto({
    candidates: [
      { id: "h1.wishlist", baseScore: 0.72, sourceBindingMatch: "rejected", locusCitation: CITE },
      { id: "h1.title", baseScore: 0.71, sourceBindingMatch: "confirmed", locusCitation: CITE },
    ],
  });
  expect(r.tier === "confirmed", `tier = "confirmed" (got ${r.tier})`);
  expect(r.winner?.id === "h1.title", `winner = h1.title (got ${r.winner?.id})`);
  expect(r.rejectedCandidates.length === 1, `1 rejected (got ${r.rejectedCandidates.length})`);
  expect(r.rejectedCandidates[0].id === "h1.wishlist", "rejected cites h1.wishlist");
  expect(
    r.rejectedCandidates[0].citation?.filepath === "sections/product.liquid",
    "rejected candidate carries vetoing-locus citation"
  );
  expect(r.warnings.length === 0, `no warnings on happy path (got ${r.warnings.length})`);
}

console.log("\n── 2. All-rejected falls back to inconclusive ──");
{
  const r = rankWithVeto({
    candidates: [
      { id: "a", baseScore: 0.6, sourceBindingMatch: "rejected", locusCitation: CITE },
      { id: "b", baseScore: 0.55, sourceBindingMatch: "rejected", locusCitation: CITE },
    ],
  });
  expect(r.tier === "inconclusive", `tier = "inconclusive" (got ${r.tier})`);
  expect(r.inconclusiveReason === "all_rejected", `reason = "all_rejected" (got ${r.inconclusiveReason})`);
  expect(r.winner?.id === "a", `winner falls through to top base-score (got ${r.winner?.id})`);
  expect(r.rejectedCandidates.length === 2, `both candidates listed as rejected (got ${r.rejectedCandidates.length})`);
  expect(
    r.warnings.some((w) => w.kind === "no_candidate_in_locus"),
    "emits no_candidate_in_locus warning"
  );
}

console.log("\n── 3a. Parity: both confirmed ──");
{
  const live = rankWithVeto({
    candidates: [{ id: "a", baseScore: 0.7, sourceBindingMatch: "confirmed" }],
  });
  const dev = rankWithVeto({
    candidates: [{ id: "b", baseScore: 0.7, sourceBindingMatch: "confirmed" }],
  });
  expect(sourceBindingParity(live, dev) === "both_confirmed", "both_confirmed");
}

console.log("\n── 3b. Parity: mismatch (confirmed vs all_rejected) ──");
{
  const live = rankWithVeto({
    candidates: [{ id: "a", baseScore: 0.7, sourceBindingMatch: "confirmed" }],
  });
  const dev = rankWithVeto({
    candidates: [{ id: "b", baseScore: 0.6, sourceBindingMatch: "rejected" }],
  });
  expect(sourceBindingParity(live, dev) === "mismatch", "mismatch");
}

console.log("\n── 3c. Parity: partial (confirmed vs inconclusive) ──");
{
  const live = rankWithVeto({
    candidates: [{ id: "a", baseScore: 0.7, sourceBindingMatch: "confirmed" }],
  });
  const dev = rankWithVeto({
    candidates: [{ id: "b", baseScore: 0.6, sourceBindingMatch: "inconclusive" }],
  });
  expect(sourceBindingParity(live, dev) === "partial", "partial");
}

console.log("\n── 3d. Parity: both_inconclusive ──");
{
  const live = rankWithVeto({
    candidates: [{ id: "a", baseScore: 0.5, sourceBindingMatch: "inconclusive" }],
  });
  const dev = rankWithVeto({
    candidates: [{ id: "b", baseScore: 0.5, sourceBindingMatch: "inconclusive" }],
  });
  expect(sourceBindingParity(live, dev) === "both_inconclusive", "both_inconclusive");
}

console.log("\n── 4. Inconclusive tier ranks by base score; veto does not influence ──");
{
  const r = rankWithVeto({
    candidates: [
      { id: "a", baseScore: 0.45, sourceBindingMatch: "inconclusive" },
      { id: "b", baseScore: 0.43, sourceBindingMatch: "inconclusive" },
    ],
  });
  expect(r.tier === "inconclusive", `tier = "inconclusive" (got ${r.tier})`);
  expect(r.inconclusiveReason === "locus_unresolved", `reason = "locus_unresolved" (got ${r.inconclusiveReason})`);
  expect(r.winner?.id === "a", `winner = top base-score (got ${r.winner?.id})`);
  expect(r.rejectedCandidates.length === 0, "no rejected candidates");
}

console.log("\n── 5. --ignore-source-binding: rejected candidate can win, diagnostics preserved ──");
{
  const r = rankWithVeto({
    candidates: [
      { id: "stale", baseScore: 0.8, sourceBindingMatch: "rejected", locusCitation: CITE },
      { id: "real", baseScore: 0.6, sourceBindingMatch: "confirmed" },
    ],
    ignoreVeto: true,
  });
  expect(r.tier === "inconclusive", `tier = "inconclusive" when veto ignored (got ${r.tier})`);
  expect(r.inconclusiveReason === "veto_ignored", `reason = "veto_ignored" (got ${r.inconclusiveReason})`);
  expect(r.winner?.id === "stale", `top base-score wins regardless of tier (got ${r.winner?.id})`);
  expect(r.rejectedCandidates.length === 1, "rejected list still recorded for diagnostics");
  expect(
    r.warnings.some((w) => w.kind === "veto_ignored"),
    "emits veto_ignored warning"
  );
}

console.log("\n── confirmed > inconclusive tier precedence ──");
{
  const r = rankWithVeto({
    candidates: [
      { id: "incon", baseScore: 0.9, sourceBindingMatch: "inconclusive" },
      { id: "conf", baseScore: 0.5, sourceBindingMatch: "confirmed" },
    ],
  });
  expect(r.tier === "confirmed", `confirmed tier wins despite lower score (got ${r.tier})`);
  expect(r.winner?.id === "conf", `winner = conf (got ${r.winner?.id})`);
}

console.log("\n── empty candidate array ──");
{
  const r = rankWithVeto({ candidates: [] });
  expect(r.winner === null, "winner is null on empty input");
  expect(r.tier === "inconclusive", "tier = inconclusive");
  expect(r.warnings.some((w) => w.kind === "no_candidates"), "emits no_candidates warning");
}

if (process.exitCode === 1) {
  console.log("\n✗ RANKER FAILED\n");
} else {
  console.log("\n✓ RANKER PASSED\n");
}
