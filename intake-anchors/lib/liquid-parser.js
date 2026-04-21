// Parses Shopify Liquid files (via @shopify/liquid-html-parser) and extracts
// source-binding signals: variable outputs, render/include calls, and form actions.
// Each signal carries a citation {filepath, line, column} for decision reports.
//
// {% raw %} bodies are opaque by construction — the parser stores them as RawMarkup,
// so variables inside {% raw %} never surface in extracted outputs. This is correct
// behavior (they render literally, not as bindings).

import { readFileSync, statSync } from "node:fs";
import { toLiquidHtmlAST, NodeTypes, nonTraversableProperties, isLiquidHtmlNode } from "@shopify/liquid-html-parser";
import { buildLineMap } from "./offset-to-line.js";

// Custom AST walk that carries an ancestor stack. The upstream `walk` exposes only
// a single parentNode, but the enclosing HTML element for a Liquid output can be
// many nodes up (div > p > {{ product.title }}). We need the nearest HtmlElement
// ancestor to build a stable DOM locus.
function walkWithAncestors(node, visit, ancestors = []) {
  visit(node, ancestors);
  const nextAncestors = ancestors.concat(node);
  for (const key of Object.keys(node)) {
    if (nonTraversableProperties.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isLiquidHtmlNode(child)) walkWithAncestors(child, visit, nextAncestors);
      }
    } else if (isLiquidHtmlNode(value)) {
      walkWithAncestors(value, visit, nextAncestors);
    }
  }
}

const STABLE_ATTRS = new Set([
  "id",
  "class",
  "data-section-id",
  "data-block-id",
  "data-shopify-editor-id",
]);

function attrName(attr) {
  return Array.isArray(attr.name) ? attr.name[0]?.value : attr.name;
}

function attrStaticValue(attr) {
  const values = attr.value ?? [];
  if (values.length === 1 && values[0].type === NodeTypes.TextNode) {
    return values[0].value;
  }
  return null;
}

function describeEnclosingElement(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a.type !== NodeTypes.HtmlElement) continue;
    const tagName = Array.isArray(a.name) ? a.name[0]?.value : a.name;
    if (!tagName) continue;
    const attrs = {};
    for (const attr of a.attributes ?? []) {
      const name = attrName(attr);
      if (!STABLE_ATTRS.has(name)) continue;
      const value = attrStaticValue(attr);
      if (value !== null) attrs[name] = value;
    }
    return { tagName, attrs };
  }
  return null;
}

// AST cache keyed on (filepath, mtime). Repeated parses of an unchanged snapshot
// return the same entry — matters for multi-hop resolution where a base snippet
// (e.g. price.liquid) is reached via many chains in a single run.
const astCache = new Map();

export function parseLiquidFile(filepath) {
  const stat = statSync(filepath);
  const key = `${filepath}:${stat.mtimeMs}`;
  const cached = astCache.get(key);
  if (cached) return cached;

  const source = readFileSync(filepath, "utf8");
  const entry = parseLiquidSource(source, filepath);
  astCache.set(key, entry);
  return entry;
}

export function parseLiquidSource(source, filepath = "<inline>") {
  const ast = toLiquidHtmlAST(source, {
    allowUnclosedDocumentNode: false,
    mode: "tolerant",
  });
  const lineMap = buildLineMap(source);
  return { ast, lineMap, source, filepath };
}

export function clearLiquidCache() {
  astCache.clear();
}

function resolveVariablePath(expr) {
  if (!expr || expr.type !== NodeTypes.VariableLookup) return null;
  const parts = [expr.name];
  for (const lookup of expr.lookups ?? []) {
    if (lookup.type === NodeTypes.String) {
      parts.push(lookup.value);
    } else {
      return null;
    }
  }
  return parts.join(".");
}

function extractOutput(markup) {
  if (typeof markup !== "object" || !markup?.expression) return null;
  return resolveVariablePath(markup.expression);
}

function extractRender(markup) {
  const snippet = markup?.snippet?.value ?? null;
  if (!snippet) return null;
  const alias = markup?.alias?.value ?? null;
  const variable = markup?.variable
    ? {
        kind: markup.variable.kind,
        path: resolveVariablePath(markup.variable.name) ?? null,
      }
    : null;
  const args = {};
  for (const arg of markup?.args ?? []) {
    if (!arg.name) continue;
    const path = resolveVariablePath(arg.value);
    args[arg.name] = path ?? "<dynamic>";
  }
  return { snippet, alias, variable, args };
}

export function extractSignals({ ast, lineMap, filepath }) {
  const outputs = [];
  const renders = [];
  const forms = [];

  const cite = (pos) => {
    const { line, column } = lineMap.lineAt(pos.start);
    return { filepath, line, column };
  };

  walkWithAncestors(ast, (node, ancestors) => {
    switch (node.type) {
      case NodeTypes.LiquidVariableOutput: {
        const variable = extractOutput(node.markup);
        if (variable) {
          outputs.push({
            variable,
            enclosingElement: describeEnclosingElement(ancestors),
            cite: cite(node.position),
          });
        }
        break;
      }
      case NodeTypes.LiquidTag: {
        if (node.name === "render" || node.name === "include") {
          const r = extractRender(node.markup);
          if (r) {
            renders.push({
              ...r,
              enclosingElement: describeEnclosingElement(ancestors),
              cite: cite(node.position),
            });
          }
        } else if (node.name === "echo") {
          const variable = extractOutput(node.markup);
          if (variable) {
            outputs.push({
              variable,
              enclosingElement: describeEnclosingElement(ancestors),
              cite: cite(node.position),
            });
          }
        }
        break;
      }
      case NodeTypes.HtmlElement: {
        if (!Array.isArray(node.name) || node.name[0]?.value !== "form") break;
        const actionAttr = (node.attributes ?? []).find((a) => attrName(a) === "action");
        const action = actionAttr ? attrStaticValue(actionAttr) : null;
        // Only static-string actions count. Interpolated actions
        // (e.g. action="{{ routes.cart_add_url }}") are left to runtime.
        if (action !== null) {
          const attrs = {};
          for (const attr of node.attributes ?? []) {
            const name = attrName(attr);
            if (!STABLE_ATTRS.has(name)) continue;
            const value = attrStaticValue(attr);
            if (value !== null) attrs[name] = value;
          }
          forms.push({
            action,
            enclosingElement: { tagName: "form", attrs },
            cite: cite(node.position),
          });
        }
        break;
      }
    }
  });

  return { outputs, renders, forms };
}

// Stable hash of a render call's args + variable scope. Used as part of the
// cycle-detection key (filename, render_args_hash) — snippet B rendered with
// different `with` scopes produces different semantics, so we don't dedup by
// filename alone.
export function hashRenderArgs(render) {
  const argKeys = Object.keys(render.args).sort();
  const canonicalArgs = {};
  for (const k of argKeys) canonicalArgs[k] = render.args[k];
  const canonical = {
    variable: render.variable
      ? { kind: render.variable.kind, path: render.variable.path }
      : null,
    alias: render.alias,
    args: canonicalArgs,
  };
  return JSON.stringify(canonical);
}
