// Validates lib/liquid-parser.js extractSignals against the spike fixture.
// Run: bun tests/liquid-parser.test.ts

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseLiquidFile,
  parseLiquidSource,
  extractSignals,
  hashRenderArgs,
  clearLiquidCache,
} from "../intake-anchors/lib/liquid-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures/liquid-parser-spike.liquid");

function expect(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

clearLiquidCache();
const parsed = parseLiquidFile(FIXTURE);
const { outputs, renders, forms } = extractSignals(parsed);

console.log("\n── outputs ──");
for (const o of outputs) {
  console.log(`  [${o.cite.line}:${o.cite.column}] {{ ${o.variable} }}`);
}
expect(
  outputs.some((o) => o.variable === "product.title"),
  "extracts product.title"
);
expect(
  outputs.some((o) => o.variable === "product.description"),
  "extracts product.description"
);
expect(
  outputs.some((o) => o.variable === "product.subtitle"),
  "extracts product.subtitle (inside if)"
);
expect(
  !outputs.some((o) => o.variable?.startsWith("this.is.raw")),
  "does NOT extract variables inside {% raw %}"
);

console.log("\n── renders ──");
for (const r of renders) {
  const scope = r.variable ? ` ${r.variable.kind} ${r.variable.path}` : "";
  const alias = r.alias ? ` as ${r.alias}` : "";
  const argList = Object.entries(r.args)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  console.log(`  [${r.cite.line}:${r.cite.column}] ${r.snippet}${scope}${alias} {${argList}}`);
}
expect(
  renders.some((r) => r.snippet === "price" && r.args.product === "product"),
  "render 'price' with product: product arg"
);
expect(
  renders.some(
    (r) =>
      r.snippet === "product-form" &&
      r.variable?.path === "product" &&
      r.alias === "item"
  ),
  "render 'product-form' with product as item"
);
expect(
  renders.some((r) => r.snippet === "legacy-reviews"),
  "include 'legacy-reviews'"
);

console.log("\n── forms ──");
for (const f of forms) {
  console.log(`  [${f.cite.line}:${f.cite.column}] action=${f.action}`);
}
expect(
  forms.some((f) => f.action === "/cart/add"),
  "form action=/cart/add"
);

console.log("\n── hashRenderArgs ──");
const h1 = hashRenderArgs({
  snippet: "price",
  alias: null,
  variable: null,
  args: { product: "product" },
});
const h2 = hashRenderArgs({
  snippet: "price",
  alias: null,
  variable: null,
  args: { product: "product" },
});
const h3 = hashRenderArgs({
  snippet: "price",
  alias: null,
  variable: null,
  args: { product: "card_product" },
});
expect(h1 === h2, "same scope → same hash");
expect(h1 !== h3, "different scope (card_product vs product) → different hash");

console.log("\n── inline-source parse ──");
const inline = parseLiquidSource(
  `<div>{{ product.vendor }}{% render 'price' %}</div>`,
  "<inline>"
);
const inlineSignals = extractSignals(inline);
expect(
  inlineSignals.outputs.some((o) => o.variable === "product.vendor"),
  "parseLiquidSource extracts inline output"
);
expect(
  inlineSignals.renders.some((r) => r.snippet === "price"),
  "parseLiquidSource extracts inline render"
);

if (process.exitCode === 1) {
  console.log("\n✗ LIQUID-PARSER FAILED\n");
} else {
  console.log("\n✓ LIQUID-PARSER PASSED\n");
}
