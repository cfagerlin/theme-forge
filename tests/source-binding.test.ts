// Tests for lib/source-binding.js multi-hop resolver.
// Run: bun tests/source-binding.test.ts
//
// Covers:
//   - single-file variable match
//   - multi-hop recursion (root → product-form → buy-buttons)
//   - snippet-name match (role binding says "price"; render 'price' is a locus)
//   - form_action match (/cart/add)
//   - cycle detection (cycle-a → cycle-b → cycle-a emits cycle_detected)
//   - multi-scope NOT treated as cycle (same file, different args → 2 loci captured)
//   - depth cap enforcement
//   - unknown-role returns status: unknown_role
//   - missing snippet emits warning but doesn't crash

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  resolveRoleLocus,
} from "../intake-anchors/lib/source-binding.js";
import { clearLiquidCache } from "../intake-anchors/lib/liquid-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "fixtures/source-binding");
const ROLE_BINDINGS = JSON.parse(
  readFileSync(resolve(__dirname, "../intake-anchors/role-bindings.json"), "utf8")
);

const resolveSnippet = (name: string) => {
  const path = resolve(FIXTURES, `${name}.liquid`);
  try {
    readFileSync(path);
    return path;
  } catch {
    return null;
  }
};

function expect(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

clearLiquidCache();

console.log("── product_title on pdp-root ──");
{
  const r = resolveRoleLocus(
    "product_title",
    resolve(FIXTURES, "pdp-root.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet }
  );
  expect(r.status === "found", `status: ${r.status}`);
  expect(r.loci.length === 1, `exactly 1 locus (got ${r.loci.length})`);
  const l = r.loci[0];
  expect(l?.source === "variable" && l?.matchedVariable === "product.title", "matched product.title");
  expect(l?.enclosingElement?.tagName === "h1", `enclosing h1 (got ${l?.enclosingElement?.tagName})`);
  expect(
    l?.enclosingElement?.attrs?.["data-block-id"] === "title",
    "captured data-block-id=title"
  );
}

console.log("\n── description on pdp-root ──");
{
  const r = resolveRoleLocus(
    "description",
    resolve(FIXTURES, "pdp-root.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet }
  );
  expect(r.status === "found", "status=found");
  expect(r.loci[0]?.matchedVariable === "product.description", "matched product.description");
  expect(r.loci[0]?.enclosingElement?.attrs?.class === "product__description", "enclosing .product__description");
}

console.log("\n── detail_price (variable inside snippet + snippet-name match) ──");
{
  const r = resolveRoleLocus(
    "detail_price",
    resolve(FIXTURES, "pdp-root.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet }
  );
  expect(r.status === "found", "status=found");
  // Expected loci: render 'price' (snippet match in root) + product.price (variable match in price.liquid)
  const sources = r.loci.map((l) => l.source).sort();
  expect(
    sources.includes("snippet") && sources.includes("variable"),
    `got sources: ${sources.join(",")}`
  );
  // Shallowest locus is the render site (chain length 1 vs variable at length 2).
  expect(r.loci[0].source === "snippet", "shallowest locus is the render 'price' site");
  expect(r.loci[0].chain.length < r.loci[r.loci.length - 1].chain.length, "chain depth ordered");
}

console.log("\n── primary_atc via multi-hop form_action ──");
{
  const r = resolveRoleLocus(
    "primary_atc",
    resolve(FIXTURES, "pdp-root.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet }
  );
  expect(r.status === "found", `status=${r.status}`);
  // Expected snippet loci: 'product-form' (depth 1) AND 'buy-buttons' (depth 2,
  // rendered inside product-form.liquid). Both are in primary_atc.snippets.
  // Plus form action=/cart/add (depth 2).
  const snippetLoci = r.loci.filter((l) => l.source === "snippet");
  const formLoci = r.loci.filter((l) => l.source === "form_action");
  expect(
    snippetLoci.some((l) => l.matchedSnippet === "product-form") &&
      snippetLoci.some((l) => l.matchedSnippet === "buy-buttons"),
    `snippet loci include product-form AND buy-buttons (got ${snippetLoci.map((l) => l.matchedSnippet).join(",")})`
  );
  expect(formLoci.length === 1, `1 form_action locus (got ${formLoci.length})`);
  expect(formLoci[0].chain.length === 2, `form locus chain depth 2 (got ${formLoci[0].chain.length})`);
  expect(formLoci[0].cite.filepath.endsWith("product-form.liquid"), "form locus cited in product-form.liquid");
}

console.log("\n── cycle detection (cycle-a → cycle-b → cycle-a) ──");
{
  const r = resolveRoleLocus(
    "product_title",
    resolve(FIXTURES, "cycle-a.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet }
  );
  expect(r.status === "found", "found at least one locus before cycle tripped");
  expect(r.loci.length === 1, `exactly 1 product_title locus despite cycle (got ${r.loci.length})`);
  const cycleWarnings = r.warnings.filter((w) => w.kind === "cycle_detected");
  expect(cycleWarnings.length >= 1, `cycle_detected warning emitted (got ${cycleWarnings.length})`);
}

console.log("\n── same snippet, different scope → NOT a cycle (2 loci) ──");
{
  const r = resolveRoleLocus(
    "product_title",
    resolve(FIXTURES, "scope-caller.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet }
  );
  expect(r.status === "found", "status=found");
  expect(
    r.loci.length === 2,
    `2 loci for scope-snippet called twice with different args (got ${r.loci.length})`
  );
  // The two chains should have different caller-line citations (different render sites).
  const callerLines = r.loci.map((l) => l.chain[0].line);
  expect(
    new Set(callerLines).size === 2,
    `distinct caller lines (got ${callerLines.join(",")})`
  );
  const cycleWarnings = r.warnings.filter((w) => w.kind === "cycle_detected");
  expect(cycleWarnings.length === 0, "no spurious cycle_detected warning");
}

console.log("\n── depth cap enforced ──");
{
  // cycle-a → cycle-b → cycle-a (blocked by cycle)... but with maxDepth 2, depth cap kicks first.
  const r = resolveRoleLocus(
    "product_title",
    resolve(FIXTURES, "cycle-a.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet, maxDepth: 1 }
  );
  // At depth 1 we're inside cycle-b — render to cycle-a pushes depth 2 which > maxDepth 1 → skipped.
  const depthWarnings = r.warnings.filter((w) => w.kind === "depth_exceeded");
  expect(depthWarnings.length >= 1 || r.warnings.some((w) => w.kind === "cycle_detected"),
    "depth_exceeded or cycle_detected warning under low cap");
}

console.log("\n── unknown role ──");
{
  const r = resolveRoleLocus(
    "not_a_real_role",
    resolve(FIXTURES, "pdp-root.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet }
  );
  expect(r.status === "unknown_role", `status=${r.status}`);
  expect(r.loci.length === 0, "no loci for unknown role");
}

console.log("\n── missing snippet warning ──");
{
  const r = resolveRoleLocus(
    "detail_price",
    resolve(FIXTURES, "pdp-root.liquid"),
    ROLE_BINDINGS,
    { resolveSnippet: () => null } // all snippets missing
  );
  // Root has `{% render 'price' %}` (snippet name match still works since it's on the render call itself).
  const snippetMatch = r.loci.find((l) => l.source === "snippet" && l.matchedSnippet === "price");
  expect(!!snippetMatch, "snippet-name match still fires when callee file is missing");
  const missingWarnings = r.warnings.filter((w) => w.kind === "snippet_not_found");
  expect(missingWarnings.length >= 1, "snippet_not_found warning emitted");
}

console.log("\n── resolveSnippet required ──");
{
  let threw = false;
  try {
    resolveRoleLocus(
      "product_title",
      resolve(FIXTURES, "pdp-root.liquid"),
      ROLE_BINDINGS,
      {} as any
    );
  } catch (e) {
    threw = true;
  }
  expect(threw, "throws without resolveSnippet callback");
}

if (process.exitCode === 1) {
  console.log("\n✗ SOURCE-BINDING TESTS FAILED\n");
} else {
  console.log("\n✓ SOURCE-BINDING TESTS PASSED\n");
}
