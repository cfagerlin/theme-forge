// Step 2.3.5 — DOM subtree matcher.
//
// Bridge between the Liquid-side locus map (source-binding.js) and the DOM
// side (rendered HTML). For each role:
//   1. Turn the locus's enclosingElement into a CSS selector using stable attrs.
//   2. Query the rendered DOM for matching subtrees.
//   3. For each candidate, classify as confirmed | rejected | inconclusive
//      based on DOM-tree descent.
//
// See plans/v0.23-source-binding.md § Step 2.3.5.

import { parse as parseHTML } from "node-html-parser";

// Stability-ranked attrs. A locus that exposes any of these can be matched in
// the DOM; otherwise we fall back to class patterns, and then to inconclusive.
const STABLE_ATTRS = [
  "data-block-id",
  "data-shopify-editor-id",
  "data-section-id",
  "id",
];

/**
 * Build a CSS selector that locates the locus's enclosing element in the DOM.
 *
 * Returns null if the enclosingElement has no stable identifying attribute.
 * In that case, the role is "inconclusive" on this DOM (the Liquid template
 * declares the binding but the rendered output has no stable hook).
 *
 * @param {{ tagName?: string, attrs?: Record<string, string> }} enclosingElement
 * @returns {string|null}
 */
export function locusSelector(enclosingElement) {
  if (!enclosingElement) return null;
  const attrs = enclosingElement.attrs ?? {};
  const tag = enclosingElement.tagName ?? "*";

  for (const name of STABLE_ATTRS) {
    const v = attrs[name];
    if (v && typeof v === "string") {
      return `${tag}[${name}="${cssEscape(v)}"]`;
    }
  }

  // Class-based fallback — only when the class looks distinctive
  // (single, not a utility). Heuristic: single-class attr, not generic.
  const cls = attrs.class;
  if (cls && typeof cls === "string") {
    const classes = cls.trim().split(/\s+/).filter(Boolean);
    if (classes.length === 1 && isDistinctiveClass(classes[0])) {
      return `${tag}.${cssEscape(classes[0])}`;
    }
  }

  return null;
}

/**
 * Classify each candidate against a set of role loci.
 *
 * @param {Object} args
 * @param {string} args.html - Rendered DOM
 * @param {Array<{enclosingElement?: {tagName?: string, attrs?: Record<string,string>}, cite?: object}>} args.loci - Loci from resolveRoleLocus. All of them are "OR"ed: candidate inside any locus subtree → confirmed.
 * @param {Array<{id: string, selector: string, baseScore: number}>} args.candidates - DOM candidates with their base scores.
 * @returns {{
 *   classified: Array<{id: string, baseScore: number, sourceBindingMatch: "confirmed"|"rejected"|"inconclusive", locusCitation?: object}>,
 *   locusReason: null|"no_locus"|"no_stable_selector"|"selector_not_in_dom"
 * }}
 */
export function classifyCandidates({ html, loci, candidates }) {
  const root = parseHTML(html);

  if (!loci || loci.length === 0) {
    return {
      classified: candidates.map((c) => ({ ...c, sourceBindingMatch: "inconclusive" })),
      locusReason: "no_locus",
    };
  }

  const locusSubtrees = [];
  let anySelectorFailed = false;
  let anySelectorResolved = false;

  for (const locus of loci) {
    const selector = locusSelector(locus.enclosingElement);
    if (!selector) {
      anySelectorFailed = true;
      continue;
    }
    const matched = root.querySelectorAll(selector);
    if (matched.length === 0) {
      anySelectorFailed = true;
      continue;
    }
    anySelectorResolved = true;
    for (const node of matched) {
      locusSubtrees.push({ node, citation: locus.cite ?? null });
    }
  }

  if (!anySelectorResolved) {
    return {
      classified: candidates.map((c) => ({ ...c, sourceBindingMatch: "inconclusive" })),
      locusReason: anySelectorFailed ? "selector_not_in_dom" : "no_stable_selector",
    };
  }

  const classified = candidates.map((c) => {
    const node = root.querySelector(c.selector);
    if (!node) {
      return { ...c, sourceBindingMatch: "inconclusive" };
    }
    const hit = locusSubtrees.find(({ node: sub }) => isDescendantOrSelf(node, sub));
    if (hit) {
      return { ...c, sourceBindingMatch: "confirmed", locusCitation: hit.citation };
    }
    return {
      ...c,
      sourceBindingMatch: "rejected",
      locusCitation: locusSubtrees[0].citation,
    };
  });

  return { classified, locusReason: null };
}

function isDescendantOrSelf(node, ancestor) {
  let cur = node;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parentNode;
  }
  return false;
}

function isDistinctiveClass(cls) {
  if (cls.length < 4) return false;
  const generic = new Set([
    "container", "row", "col", "wrapper", "inner", "outer", "content",
    "item", "flex", "grid", "block", "card", "link", "button", "btn",
    "text", "title", "label", "hidden", "visible", "small", "large",
  ]);
  return !generic.has(cls.toLowerCase());
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, (ch) => "\\" + ch);
}
