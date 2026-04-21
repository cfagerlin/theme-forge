// Unit tests for lib/decision-report.js schema builder.
// Run: bun tests/decision-report.test.ts

import { buildDecisionReport, reportTierFromRank, buildSideReport } from "../intake-anchors/lib/decision-report.js";

function expect(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

function fakeRank(overrides: any = {}) {
  return {
    winner: { id: "w", baseScore: 0.7, sourceBindingMatch: "confirmed" },
    tier: "confirmed",
    inconclusiveReason: null,
    rejectedCandidates: [],
    warnings: [],
    ...overrides,
  };
}

console.log("── reportTierFromRank mapping ──");
{
  expect(reportTierFromRank(fakeRank()) === "confirmed", "confirmed → confirmed");
  expect(
    reportTierFromRank(fakeRank({ tier: "inconclusive", inconclusiveReason: "locus_unresolved" })) ===
      "inconclusive",
    "inconclusive + locus_unresolved → inconclusive"
  );
  expect(
    reportTierFromRank(fakeRank({ tier: "inconclusive", inconclusiveReason: "all_rejected" })) ===
      "rejected",
    "inconclusive + all_rejected → rejected (distinct signal)"
  );
  expect(
    reportTierFromRank(fakeRank({ tier: "inconclusive", inconclusiveReason: "veto_ignored" })) ===
      "inconclusive",
    "inconclusive + veto_ignored → inconclusive"
  );
}

console.log("\n── buildSideReport shape ──");
{
  const side = buildSideReport({
    rank: fakeRank({
      rejectedCandidates: [
        { id: "a.bad", baseScore: 0.8, citation: null },
        { id: "b.worse", baseScore: 0.7, citation: null },
      ],
    }),
    locusSelector: "h1[data-block-id='title']",
  });
  expect(side.tier === "confirmed", "tier passes through");
  expect(side.winner_in_locus === true, "winner_in_locus true when confirmed");
  expect(side.locus_selector === "h1[data-block-id='title']", "locus_selector passes through");
  expect(
    JSON.stringify(side.rejected_candidates) === JSON.stringify(["a.bad", "b.worse"]),
    "rejected_candidates lists ids"
  );
}

console.log("\n── buildSideReport: rejected tier means winner_in_locus false ──");
{
  const side = buildSideReport({
    rank: fakeRank({ tier: "inconclusive", inconclusiveReason: "all_rejected" }),
    locusSelector: "div[data-block-id='x']",
  });
  expect(side.tier === "rejected", "tier = rejected");
  expect(side.winner_in_locus === false, "winner_in_locus false when rejected");
}

console.log("\n── buildDecisionReport: single side (live only) ──");
{
  const report = buildDecisionReport({
    roles: {
      product_title: {
        live: { rank: fakeRank(), locusSelector: "h1" },
      },
    },
  });
  expect(report.roles.product_title.live !== undefined, "live block present");
  expect(report.roles.product_title.dev === undefined, "dev block absent");
  expect(report.roles.product_title.parity === null, "parity null when only one side");
  expect(report.source_binding_coverage.roles_confirmed === 1, "counted as confirmed");
}

console.log("\n── buildDecisionReport: dual side, both confirmed ──");
{
  const report = buildDecisionReport({
    roles: {
      product_title: {
        live: { rank: fakeRank(), locusSelector: "h1[data-block-id='title']" },
        dev: { rank: fakeRank(), locusSelector: "#MainProduct-title" },
      },
    },
  });
  expect(report.roles.product_title.parity === "both_confirmed", "parity = both_confirmed");
  expect(report.source_binding_coverage.parity_mismatches === 0, "no parity_mismatches");
}

console.log("\n── buildDecisionReport: parity mismatch counted ──");
{
  const confirmedRank = fakeRank();
  const rejectedRank = fakeRank({
    tier: "inconclusive",
    inconclusiveReason: "all_rejected",
    rejectedCandidates: [{ id: "x", baseScore: 0.6, citation: null }],
  });
  const report = buildDecisionReport({
    roles: {
      product_title: {
        live: { rank: confirmedRank, locusSelector: "h1" },
        dev: { rank: rejectedRank, locusSelector: "h1" },
      },
    },
  });
  expect(report.roles.product_title.parity === "mismatch", "parity = mismatch");
  expect(report.source_binding_coverage.parity_mismatches === 1, "parity_mismatches counted");
  expect(report.source_binding_coverage.roles_all_rejected === 1, "roles_all_rejected counted");
  expect(report.source_binding_coverage.candidates_vetoed === 1, "candidates_vetoed counted from dev side");
}

console.log("\n── buildDecisionReport: multi-role summary counters ──");
{
  const report = buildDecisionReport({
    roles: {
      a: { live: { rank: fakeRank(), locusSelector: "h1" } },
      b: { live: { rank: fakeRank(), locusSelector: "h2" } },
      c: {
        live: {
          rank: fakeRank({ tier: "inconclusive", inconclusiveReason: "locus_unresolved" }),
          locusSelector: null,
        },
      },
      d: {
        live: {
          rank: fakeRank({
            tier: "inconclusive",
            inconclusiveReason: "all_rejected",
            rejectedCandidates: [
              { id: "x", baseScore: 0.5, citation: null },
              { id: "y", baseScore: 0.4, citation: null },
            ],
          }),
          locusSelector: "div[data-block-id='z']",
        },
      },
    },
  });
  expect(report.source_binding_coverage.roles_confirmed === 2, "2 confirmed");
  expect(report.source_binding_coverage.roles_inconclusive === 1, "1 inconclusive");
  expect(report.source_binding_coverage.roles_all_rejected === 1, "1 all_rejected");
  expect(report.source_binding_coverage.candidates_vetoed === 2, "2 candidates vetoed");
}

if (process.exitCode === 1) {
  console.log("\n✗ DECISION-REPORT TESTS FAILED\n");
} else {
  console.log("\n✓ DECISION-REPORT TESTS PASSED\n");
}
