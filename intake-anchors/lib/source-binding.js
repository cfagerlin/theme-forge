// Multi-hop source-binding resolver.
//
// Given a role name and a root Liquid file, walks the render/include chain to
// find every locus where the role's bindings (variables, snippets, form_action)
// surface. Returns an array of loci ranked by call-chain depth (shallowest first).
//
// Cycle detection: (filename, render_args_hash) pair. Snippet B rendered with
// different `with` scopes is NOT the same visit — hashing by filename alone
// loses coverage.
//
// Depth cap: 10 hops. Dawn's deepest chain is ~8 (main-product → product-form →
// buy-buttons → product-variant-picker → product-variant-options → ... → swatch-input).
// Cap 6 silently drops coverage; cap 10 is safely above observed ceiling.

import { parseLiquidFile, extractSignals, hashRenderArgs } from "./liquid-parser.js";

const DEFAULT_MAX_DEPTH = 10;

function matchesVariable(bindingVars, outputVariable) {
  // Exact-name matching only in v0.23. Prefix-match on dotted path means
  // `product.title` matches `product.title.whatever` (rare but valid — title
  // filters like `| escape` still output a string rooted at product.title).
  for (const v of bindingVars) {
    if (outputVariable === v) return v;
    if (outputVariable.startsWith(v + ".")) return v;
  }
  return null;
}

function normalizeBinding(binding) {
  return {
    variables: binding?.variables ?? [],
    snippets: binding?.snippets ?? [],
    form_action: binding?.form_action ?? null,
  };
}

export function resolveRoleLocus(roleName, rootFilepath, roleBindings, options = {}) {
  const {
    resolveSnippet,
    maxDepth = DEFAULT_MAX_DEPTH,
    onTrace = null,
  } = options;

  if (typeof resolveSnippet !== "function") {
    throw new Error("resolveRoleLocus: options.resolveSnippet is required");
  }
  const bindingRaw = roleBindings?.bindings?.[roleName];
  if (!bindingRaw) {
    return {
      loci: [],
      status: "unknown_role",
      reason: `no binding for role '${roleName}' in role-bindings.json`,
    };
  }
  const binding = normalizeBinding(bindingRaw);

  const loci = [];
  // Current call-stack frames, keyed `filepath::render_args_hash`. On entry we
  // check+add; on exit we remove. This detects recursion cycles (a→b→a) while
  // still letting the same snippet appear twice in distinct branches (e.g. a
  // sticky ATC + a main ATC both rendering product-form with the same args).
  const stack = new Set();
  const warnings = [];

  function visit(filepath, callerChain, renderArgsHash, scope) {
    const frameKey = `${filepath}::${renderArgsHash}`;
    if (stack.has(frameKey)) {
      warnings.push({ kind: "cycle_detected", filepath, chain: callerChain.slice() });
      return;
    }

    if (callerChain.length > maxDepth) {
      warnings.push({
        kind: "depth_exceeded",
        filepath,
        chain: callerChain.slice(),
        maxDepth,
      });
      return;
    }

    stack.add(frameKey);

    let parsed;
    try {
      parsed = parseLiquidFile(filepath);
    } catch (err) {
      warnings.push({
        kind: "parse_error",
        filepath,
        chain: callerChain.slice(),
        error: String(err?.message ?? err),
      });
      return;
    }

    if (onTrace) onTrace({ event: "enter", filepath, depth: callerChain.length, scope });

    const { outputs, renders, forms } = extractSignals(parsed);

    for (const out of outputs) {
      const matched = matchesVariable(binding.variables, out.variable);
      if (!matched) continue;
      loci.push({
        source: "variable",
        matchedVariable: matched,
        actualVariable: out.variable,
        enclosingElement: out.enclosingElement,
        cite: out.cite,
        chain: callerChain.concat(out.cite),
        scope: { ...scope },
      });
    }

    if (binding.form_action !== null) {
      for (const f of forms) {
        if (f.action !== binding.form_action) continue;
        loci.push({
          source: "form_action",
          matchedAction: f.action,
          enclosingElement: f.enclosingElement,
          cite: f.cite,
          chain: callerChain.concat(f.cite),
          scope: { ...scope },
        });
      }
    }

    for (const r of renders) {
      // Snippet-name match at the render call site — the enclosing HTML element
      // of the {% render %} is the locus (wrapper that owns the snippet's output).
      if (binding.snippets.includes(r.snippet)) {
        loci.push({
          source: "snippet",
          matchedSnippet: r.snippet,
          enclosingElement: r.enclosingElement,
          cite: r.cite,
          chain: callerChain.concat(r.cite),
          scope: { ...scope },
        });
      }

      // Recurse into snippet regardless of snippet-name match — deeper matches
      // (variables, forms inside the snippet) still count.
      const snippetPath = resolveSnippet(r.snippet);
      if (!snippetPath) {
        warnings.push({
          kind: "snippet_not_found",
          snippet: r.snippet,
          filepath,
          chain: callerChain.concat(r.cite),
        });
        continue;
      }

      const nextScope = nextRenderScope(scope, r);
      visit(
        snippetPath,
        callerChain.concat(r.cite),
        hashRenderArgs(r),
        nextScope
      );
    }

    if (onTrace) onTrace({ event: "exit", filepath, depth: callerChain.length });
    stack.delete(frameKey);
  }

  // Root entry is keyed as if it were rendered with empty args, so that a true
  // cycle (A→B→A with no args on either render) is detected on re-entry to A.
  // Using a "<root>" sentinel here would make the re-entry key differ and miss
  // the cycle until one frame deeper.
  const rootHash = hashRenderArgs({ variable: null, alias: null, args: {} });
  visit(rootFilepath, [], rootHash, {});

  // Rank by chain depth (shallowest first). Ties broken by line number.
  loci.sort((a, b) => {
    if (a.chain.length !== b.chain.length) return a.chain.length - b.chain.length;
    return a.cite.line - b.cite.line;
  });

  const status = loci.length > 0 ? "found" : "inconclusive";
  const result = { loci, status, warnings };
  if (status === "inconclusive") {
    result.reason = warnings.length > 0
      ? `no locus found (${warnings.length} warnings: ${warnings.map((w) => w.kind).join(",")})`
      : "no Liquid output, render, or form matched the role's bindings";
  }
  return result;
}

// Compute the symbol table visible inside a rendered snippet.
// {% render 'x' with Y as Z %} → inside x.liquid, Z refers to caller's Y
// {% render 'x', foo: bar %} → inside x.liquid, `foo` refers to caller's `bar`
// v0.23 records the scope (for traceability) but does NOT rewrite variable
// names inside the callee — exact-name matching only. v0.24+ may propagate
// rebindings (e.g. card_product.title → product.title).
function nextRenderScope(callerScope, render) {
  const scope = {};
  if (render.variable && render.alias) {
    // {% render 'x' with product as item %} — inside x, `item` = caller's `product`.
    scope[render.alias] = render.variable.path ?? "<dynamic>";
  }
  for (const [localName, callerPath] of Object.entries(render.args)) {
    scope[localName] = callerPath;
  }
  return scope;
}
