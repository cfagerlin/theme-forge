// Step 0 spike for v0.23 source-binding: validates @shopify/liquid-html-parser
// covers the AST nodes the algorithm needs, and that the offset→line mapper
// produces correct citations.
//
// Run: bun tests/liquid-parser-spike.test.ts
//
// This spike answers Eng-review questions BEFORE we commit to the parser:
// - Does Position expose per-node character offsets we can map to lines? (yes/no)
// - Does RenderMarkup expose snippet / alias / variable / args? (yes/no)
// - Does {% liquid %} tag body parse as LiquidStatement[] (not raw string)? (yes/no)
// - Does {% if %}/{% elsif %} expose branches as child LiquidBranch nodes? (yes/no)
// - Does {% raw %} keep its body as opaque RawMarkup (so we don't walk into it)? (yes/no)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { toLiquidHtmlAST, walk, NodeTypes } from "@shopify/liquid-html-parser";
import { buildLineMap } from "../intake-anchors/lib/offset-to-line.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures/liquid-parser-spike.liquid");

type Citation = { line: number; column: number };
type Match = { kind: string; detail: string; cite: Citation };

const source = readFileSync(FIXTURE, "utf8");
const ast = toLiquidHtmlAST(source, {
  allowUnclosedDocumentNode: false,
  mode: "tolerant",
});
const lineMap = buildLineMap(source);
const cite = (pos: { start: number }): Citation => lineMap.lineAt(pos.start);

const matches: Match[] = [];
const seenNodeTypes = new Set<string>();

walk(ast, (node) => {
  seenNodeTypes.add(node.type as string);

  switch (node.type) {
    case NodeTypes.LiquidVariableOutput: {
      // {{ product.title }} — we care about the root variable name.
      const n = node as any;
      const markup = n.markup;
      let rootName: string | null = null;
      if (typeof markup === "object" && markup?.expression?.type === NodeTypes.VariableLookup) {
        rootName = markup.expression.name;
        const lookups = (markup.expression.lookups ?? [])
          .map((l: any) => (l.type === NodeTypes.String ? l.value : `[${l.type}]`))
          .join(".");
        rootName = lookups ? `${rootName}.${lookups}` : rootName;
      } else if (typeof markup === "string") {
        rootName = markup.trim();
      }
      matches.push({ kind: "output", detail: rootName ?? "<complex>", cite: cite(node.position) });
      break;
    }
    case NodeTypes.LiquidTag: {
      const n = node as any;
      if (n.name === "render" || n.name === "include") {
        // RenderMarkup exposes snippet / alias / variable / args.
        const mu = n.markup;
        const snippet = mu.snippet?.value ?? "<dynamic>";
        const alias = mu.alias?.value ?? null;
        const variable = mu.variable
          ? `${mu.variable.kind} ${mu.variable.name?.name ?? "<expr>"}`
          : null;
        const args = (mu.args ?? []).map((a: any) => a.name).join(", ");
        const detail = `snippet=${snippet}${variable ? ` ${variable}` : ""}${alias ? ` as ${alias}` : ""}${args ? ` [${args}]` : ""}`;
        matches.push({ kind: "render", detail, cite: cite(node.position) });
      } else if (n.name === "liquid") {
        // Critical test: {% liquid %} markup should be LiquidStatement[] (NOT a raw string).
        const innerTags = Array.isArray(n.markup) ? n.markup.map((s: any) => s.name).filter(Boolean) : "STRING";
        matches.push({
          kind: "liquid-tag",
          detail: `body=${Array.isArray(n.markup) ? innerTags.join(",") : "STRING (regression!)"}`,
          cite: cite(node.position),
        });
      } else if (n.name === "if" || n.name === "unless") {
        const branches = (n.children ?? []).filter((c: any) => c.type === NodeTypes.LiquidBranch).length;
        matches.push({ kind: `if-${branches}-branches`, detail: n.name, cite: cite(node.position) });
      }
      break;
    }
    case NodeTypes.LiquidRawTag: {
      const n = node as any;
      matches.push({ kind: "raw-tag", detail: `name=${n.name}`, cite: cite(node.position) });
      break;
    }
    case NodeTypes.HtmlElement: {
      const n = node as any;
      // Form elements with action="/cart/add" — primary_atc signal.
      if (Array.isArray(n.name) && n.name[0]?.value === "form") {
        const actionAttr = (n.attributes ?? []).find((a: any) => {
          const name = Array.isArray(a.name) ? a.name[0]?.value : a.name;
          return name === "action";
        });
        const actionVal = actionAttr?.value?.[0]?.value ?? "<dynamic>";
        matches.push({ kind: "form", detail: `action=${actionVal}`, cite: cite(node.position) });
      }
      break;
    }
  }
});

function expect(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

console.log(`\nParsed ${FIXTURE}`);
console.log(`Total AST node types seen: ${seenNodeTypes.size}`);
console.log(`Matches extracted: ${matches.length}\n`);

console.log("── node coverage ──");
for (const required of [
  NodeTypes.LiquidVariableOutput,
  NodeTypes.LiquidTag,
  NodeTypes.LiquidBranch,
  NodeTypes.LiquidRawTag,
  NodeTypes.HtmlElement,
  NodeTypes.AttrDoubleQuoted,
  NodeTypes.TextNode,
]) {
  expect(seenNodeTypes.has(required as string), `saw ${required}`);
}

console.log("\n── variable outputs extracted ──");
const outputs = matches.filter((m) => m.kind === "output");
for (const m of outputs) {
  console.log(`  [${m.cite.line}:${m.cite.column}] {{ ${m.detail} }}`);
}
expect(
  outputs.some((m) => m.detail.startsWith("product.title")),
  "found {{ product.title }}"
);
expect(
  outputs.some((m) => m.detail.startsWith("product.description")),
  "found {{ product.description }}"
);

console.log("\n── renders extracted ──");
const renders = matches.filter((m) => m.kind === "render");
for (const m of renders) {
  console.log(`  [${m.cite.line}:${m.cite.column}] ${m.detail}`);
}
expect(
  renders.some((m) => m.detail.includes("snippet=price") && m.detail.includes("product")),
  "found render 'price' with product arg"
);
expect(
  renders.some((m) => m.detail.includes("snippet=product-form") && m.detail.includes("as item")),
  "found render 'product-form' with ... as item"
);
expect(
  renders.some((m) => m.detail.includes("snippet=legacy-reviews")),
  "found include 'legacy-reviews'"
);

console.log("\n── {% liquid %} block ──");
const liquidTags = matches.filter((m) => m.kind === "liquid-tag");
for (const m of liquidTags) {
  console.log(`  [${m.cite.line}:${m.cite.column}] ${m.detail}`);
}
expect(
  liquidTags.some((m) => !m.detail.includes("STRING")),
  "{% liquid %} body parses as LiquidStatement[] (not a raw string)"
);

console.log("\n── if/elsif branches ──");
const ifTags = matches.filter((m) => m.kind.startsWith("if-"));
for (const m of ifTags) {
  console.log(`  [${m.cite.line}:${m.cite.column}] ${m.kind} (${m.detail})`);
}
expect(ifTags.length > 0, "if tag observed");
expect(
  ifTags.some((m) => m.kind === "if-2-branches"),
  "if/elsif exposes 2 LiquidBranch children"
);

console.log("\n── raw tags (must NOT be walked into) ──");
const rawTags = matches.filter((m) => m.kind === "raw-tag");
for (const m of rawTags) {
  console.log(`  [${m.cite.line}:${m.cite.column}] ${m.detail}`);
}
expect(
  rawTags.some((m) => m.detail === "name=raw"),
  "{% raw %} surfaces as LiquidRawTag"
);
// The {{ this.is.raw }} inside {% raw %} should NOT appear in our outputs list.
expect(
  !outputs.some((m) => m.detail.startsWith("this.is.raw")),
  "variables inside {% raw %} are NOT extracted"
);

console.log("\n── form actions ──");
const forms = matches.filter((m) => m.kind === "form");
for (const m of forms) {
  console.log(`  [${m.cite.line}:${m.cite.column}] ${m.detail}`);
}
expect(
  forms.some((m) => m.detail === "action=/cart/add"),
  "found form action=/cart/add"
);

console.log("\n── offset→line mapper sanity ──");
// Empirical check: character 0 is line 1 col 1.
expect(lineMap.lineAt(0).line === 1 && lineMap.lineAt(0).column === 1, "offset 0 → 1:1");
// Character right after the first newline is line 2 col 1.
const firstNewline = source.indexOf("\n");
expect(
  lineMap.lineAt(firstNewline + 1).line === 2 && lineMap.lineAt(firstNewline + 1).column === 1,
  `offset ${firstNewline + 1} → 2:1`
);

if (process.exitCode === 1) {
  console.log("\n✗ SPIKE FAILED — parser coverage insufficient or mapper buggy.\n");
} else {
  console.log("\n✓ SPIKE PASSED — parser covers all v0.23 requirements.\n");
}
