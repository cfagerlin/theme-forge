// Wrong-pairing regression suite. Load-bearing safety net for the v0.23
// source-binding veto: v0.23 must not flip any of these known-correct
// pairings to a wrong answer.
//
// See tests/fixtures/v0.22-correct-pairings/README.md for case format.
// See plans/v0.23-source-binding.md § "Wrong-pairing regression suite".
//
// TODO: seed suite is Shopify-realistic but hand-crafted. Scope requires
// 20 real captures (Dawn, OS 2.0, customized, app-heavy) before v0.23 ships.
// Harness is fixture-driven — drop new case directories in to expand.
//
// Run: bun tests/wrong-pairing-regression.test.ts

import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { runSourceBindingForSide } from "../intake-anchors/lib/run-source-binding.js";
import { buildDecisionReport } from "../intake-anchors/lib/decision-report.js";
import { clearLiquidCache } from "../intake-anchors/lib/liquid-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = resolve(__dirname, "fixtures/v0.22-correct-pairings");
const ROLE_BINDINGS = JSON.parse(
  readFileSync(resolve(__dirname, "../intake-anchors/role-bindings.json"), "utf8")
);

function expect(cond: boolean, label: string) {
  if (cond) console.log(`    ✓ ${label}`);
  else {
    console.log(`    ✗ ${label}`);
    process.exitCode = 1;
  }
}

function listCases(root: string): string[] {
  return readdirSync(root)
    .filter((name) => {
      const full = join(root, name);
      return statSync(full).isDirectory();
    })
    .sort();
}

function makeSnippetResolver(caseDir: string) {
  return (snippetName: string) => {
    const path = join(caseDir, "snippets", `${snippetName}.liquid`);
    try {
      readFileSync(path);
      return path;
    } catch {
      return null;
    }
  };
}

const cases = listCases(SUITE_ROOT);
let passed = 0;
let failed = 0;

console.log(`── Running ${cases.length} wrong-pairing regression cases ──\n`);

for (const caseName of cases) {
  console.log(`  [${caseName}]`);
  clearLiquidCache();

  const caseDir = join(SUITE_ROOT, caseName);
  const expected = JSON.parse(readFileSync(join(caseDir, "expected.json"), "utf8"));
  const html = readFileSync(join(caseDir, "rendered.html"), "utf8");
  const rootLiquid = join(caseDir, "source.liquid");
  const resolveSnippet = makeSnippetResolver(caseDir);

  let caseFailed = false;

  const sideResults = runSourceBindingForSide({
    rootLiquid,
    html,
    candidates: expected.candidates,
    roleBindings: ROLE_BINDINGS,
    resolveSnippet,
  });

  const rolesForReport: Record<string, { live: any }> = {};
  for (const role of Object.keys(expected.candidates)) {
    rolesForReport[role] = { live: sideResults[role] };
  }
  const report = buildDecisionReport({ roles: rolesForReport });

  for (const role of Object.keys(expected.candidates)) {
    const expectedWinnerId = expected.expected_winner[role];
    const expectedTier = expected.expected_tier[role];
    const sideResult = sideResults[role];
    const reportEntry = report.roles[role].live;

    const preSlot = process.exitCode;
    expect(
      sideResult.rank.winner?.id === expectedWinnerId,
      `${role}: winner = ${expectedWinnerId} (got ${sideResult.rank.winner?.id ?? "none"})`
    );
    // Compare against the REPORT's tier (three-valued: confirmed | inconclusive | rejected).
    expect(
      reportEntry.tier === expectedTier,
      `${role}: report tier = ${expectedTier} (got ${reportEntry.tier})`
    );
    expect(
      reportEntry.winner_in_locus === (expectedTier === "confirmed"),
      `${role}: winner_in_locus = ${expectedTier === "confirmed"} (got ${reportEntry.winner_in_locus})`
    );
    if (process.exitCode !== preSlot) caseFailed = true;
  }

  if (caseFailed) failed++;
  else passed++;
  console.log("");
}

console.log(`── Regression suite: ${passed}/${cases.length} cases green ──`);
if (failed > 0) {
  console.log(`\n✗ WRONG-PAIRING REGRESSION FAILED: ${failed} case(s) flipped\n`);
} else {
  console.log("\n✓ WRONG-PAIRING REGRESSION PASSED\n");
}
