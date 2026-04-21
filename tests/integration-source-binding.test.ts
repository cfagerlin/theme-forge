// End-to-end integration test for multi-hop source-binding resolution.
// Exercises a 5-hop Dawn-style PDP chain:
//   dawn-main-product → dawn-product-form → dawn-buy-buttons → dawn-variant-picker → dawn-variant-options
//
// Validates the full role-to-locus map for a typical product-information section,
// proving that deep chains resolve correctly under the default maxDepth=10 budget.
//
// Run: bun tests/integration-source-binding.test.ts

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { resolveRoleLocus } from "../intake-anchors/lib/source-binding.js";
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
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

clearLiquidCache();
const root = resolve(FIXTURES, "dawn-main-product.liquid");

// Roles whose bindings we expect to resolve on this fixture. The fixture uses
// `dawn-*` prefixes for non-shared snippets to avoid colliding with earlier tests;
// role-bindings.json lists canonical names ("product-form", "variant-picker", etc.),
// so snippet-name matches on non-shared snippets don't fire here. That's fine —
// variables + form_action still exercise the full multi-hop chain.
const EXPECTED_ROLES = [
  "product_title",
  "description",
  "detail_price",
  "primary_atc",
];

console.log("── Dawn 5-hop fixture: role resolution map ──");
const results: Record<string, ReturnType<typeof resolveRoleLocus>> = {};
for (const role of Object.keys(ROLE_BINDINGS.bindings)) {
  results[role] = resolveRoleLocus(role, root, ROLE_BINDINGS, { resolveSnippet });
}

for (const role of EXPECTED_ROLES) {
  const r = results[role];
  console.log(
    `  ${role}: ${r.status} (${r.loci.length} loci, ${r.warnings.length} warnings)`
  );
  expect(r.status === "found", `${role} resolved`);
}

console.log("\n── chain depths ──");
{
  const primary = results.primary_atc;
  // primary_atc binding includes snippet 'product-form' and 'buy-buttons' and form_action '/cart/add'.
  // NOTE: role-bindings.json lists "product-form" and "buy-buttons" (not "dawn-product-form"),
  // so snippet-name matches rely on exact name equality. For this Dawn fixture using "dawn-*"
  // names, only form_action will match (depth 2 in our fixture). That's expected.
  const formLocus = primary.loci.find((l) => l.source === "form_action");
  expect(!!formLocus, "form_action locus present");
  expect(formLocus!.chain.length === 2, `form locus chain length 2 (got ${formLocus!.chain.length})`);
  expect(
    formLocus!.cite.filepath.endsWith("dawn-product-form.liquid"),
    "form_action located in dawn-product-form.liquid"
  );
}

console.log("\n── no cycle or depth warnings on happy path ──");
{
  const allWarnings = EXPECTED_ROLES.flatMap((role) => results[role].warnings);
  const bad = allWarnings.filter(
    (w) => w.kind === "cycle_detected" || w.kind === "depth_exceeded"
  );
  expect(bad.length === 0, `no cycle/depth warnings (got ${bad.length})`);
}

console.log("\n── enclosing-element capture across hops ──");
{
  const title = results.product_title.loci[0];
  expect(title.enclosingElement?.tagName === "h1", "product_title enclosed in h1");
  expect(
    title.enclosingElement?.attrs?.["data-block-id"] === "title",
    "product_title has data-block-id=title"
  );

  const desc = results.description.loci[0];
  expect(
    desc.enclosingElement?.attrs?.["data-block-id"] === "description",
    "description has data-block-id=description"
  );
}

console.log("\n── role-to-locus cardinality: multi-hop produces chain citations ──");
{
  // detail_price should resolve via 'price' snippet render + {{ product.price }} inside price.liquid.
  const price = results.detail_price;
  expect(price.loci.length >= 2, `detail_price has ≥2 loci (got ${price.loci.length})`);
  const chainDepths = price.loci.map((l) => l.chain.length);
  expect(
    Math.min(...chainDepths) < Math.max(...chainDepths),
    `loci span multiple depths (${chainDepths.join(",")})`
  );
  // Shallowest locus listed first.
  expect(
    chainDepths[0] === Math.min(...chainDepths),
    "loci sorted shallowest-first"
  );
}

if (process.exitCode === 1) {
  console.log("\n✗ INTEGRATION FAILED\n");
} else {
  console.log("\n✓ INTEGRATION PASSED\n");
}
