---
name: intake-anchors
description: >
  Build a section's anchor map — semantic live↔dev selector pairs by role (product_title,
  detail_price, primary_atc, etc.) — so find-variances compares the right elements instead of
  positional slices. Replaces the fragile "heading-0, button-0, price-0" extraction that pairs
  live's real h1 with dev's sticky-ATC h3. Pairs with intake-cases for multi-archetype support.
  - MANDATORY TRIGGERS: theme-forge intake-anchors, intake anchors, anchor map, semantic selectors, fix false-positive variances, map live and dev selectors, rebaseline anchors
---

# intake-anchors — Build a Semantic Anchor Map for a Section

The canonical find-variances extractor slices the first-N elements inside `<main>` and records computed styles for each. That works when live and dev have the same DOM order. It breaks when a dev theme injects a sticky-ATC bar at the top of `<main>` — now live's first h1 is the real product title (28px/200) and dev's first h1 is the sticky ATC (16px/400). Extractor compares element-0 to element-0 and reports a fontSize variance that's really an element-mismatch.

The fix: pair selectors by semantic role, not position. This skill builds that map.

## Design principles (why the algorithm looks the way it does)

The v0.20.x first-run taught five lessons. The algorithm now follows them.

1. **Honest failure beats silent failure.** Never fabricate a selector. If a role can't be resolved, write `"live": null, "status": "no_match"`. find-variances surfaces these as "intake-anchors gaps" — visible, fixable, user-actionable.
2. **Score, don't first-match.** The first selector a heuristic finds is often wrong (sticky ATC h3 beats real h1). Score every candidate by size, y-position, text-content similarity, expected attributes, and pick the winner. Record runners-up.
3. **Probe every case, not just the first.** A variant-less product has no variant picker. One-case probing concludes the role doesn't exist. Multi-case probing aggregates: a role is present if ANY active case shows it. Divergent selectors across cases auto-surface as case overrides.
4. **Theme-family × section-type, not just section-type.** Live and dev often run different theme families (live: legacy, dev: Horizon). One library per section doesn't cover the selector vocabulary on both sides. The algorithm picks a theme-family library per side and cross-products it with the section-type library.
5. **Cross-verify pairings.** A live selector and a dev selector with the same role key must match on text content or position (or be explicitly flagged as differing). Blind pairing produces `"Dainty Chain"` on live paired with `"Filters (0)"` on dev because both happened to be the first-matching selector.

## When to run

- After `pull-section` on a theme with structural differences between live and dev.
- Before first `find-variances` run on a section — anchors drive extraction.
- After `find-variances` surfaces positional-mismatch false positives (variances on `heading-0` / `button-0` / `price-0` → bad pairing).
- When a new case is added to `intake-cases` and its archetype swaps which elements exist.

## Prerequisites

- `.theme-forge/config.json` exists (run `onboard` first)
- Dev server is running (auto-discover needs it)
- Section has been pulled (`pull-section <section>`)
- `.theme-forge/base-cache/sections/<section>.liquid` exists (auto-discover parses it for role generation)

## Arguments

```
/theme-forge intake-anchors <section-key> [--auto-discover] [--from <artifact>] [--list] [--add-case <key>] [--page <page>] [--theme-family-live <name>] [--theme-family-dev <name>] [--update-project] [--dry-run] [--ignore-source-binding <role>] [--no-source-binding] [--why <role>]
```

- `<section-key>` — required. Section filename without extension (e.g., `product-information-main`, `hero-1`).
- `--auto-discover` — probe live + dev with role heuristics, emit a draft anchors file, ask user to confirm. Default when no artifact given.
- `--from <artifact>` — path to a screenshot, CSV, or prose description. Overrides auto-discover.
- `--list` — pretty-print the existing anchors file.
- `--add-case <key>` — add a per-case override block to an existing anchors file.
- `--page <page>` — which page the section renders on. Required unless onboard wrote a default or section is in `_shared.json`.
- `--theme-family-live <name>` / `--theme-family-dev <name>` — explicit theme-family override. Skips auto-detection (Step 2.1). Values: any key under `intake-anchors/role-libraries/themes/`.
- `--update-project` — promote reverse-probe / discovered winners from this run into `.theme-forge/role-libraries/projects/<project_slug>.json` so the next run starts with them in the library. Requires user confirmation per promoted selector unless `--yes`.
- `--dry-run` — compute the full run but do not write the anchors file or the project library. Prints what WOULD be written. Pairs well with `--update-project` for reviewing project-layer changes before they land.
- `--ignore-source-binding <role>` (v0.23+) — fall back to pure v0.22 DOM scoring for one role. Use when `role-bindings.json` is wrong and vetoes a correct candidate. Repeatable. Records `"ignore_source_binding": "cli-flag"` in the decision report for auditability.
- `--no-source-binding` (v0.23+) — global kill-switch; skips Step 2.0.5 and Step 2.3.6 entirely for the whole run. Useful for isolating source-binding regressions or running against sections without a `role-bindings.json` entry.
- `--why <role>` (v0.23+) — read `.theme-forge/anchors/<section>.decision-report.json` and pretty-print the role's winner, rejected candidates, and source-binding citation. See Step 6.6.

## Workflow

### Step 1: Validate inputs

1. `<section-key>` required. Hard-error on missing:
   ```
   ERROR: intake-anchors requires a section key.
   Usage:
     /theme-forge intake-anchors <section-key> [--auto-discover]
   Example:
     /theme-forge intake-anchors product-information-main --auto-discover --page product
   ```

2. Resolve section classification (per-page vs shared) from `.theme-forge/mappings/sections/<section>.json`. Anchors file location is always flat: `.theme-forge/anchors/<section>.json`.

   If the mapping file is MISSING, auto-create a minimal stub (`{section, section_type: "unknown", selector: "#shopify-section-<section>"}`) and print a reminder — don't block. The v0.20.x run failed here because the mapping was required; v0.21 relaxes it because anchors are more valuable than strict mapping.

3. If `--list`, read and print, exit.

4. If `--add-case <key>`, read existing anchors file + cases file, run Step 2 scoped to the case URL, merge into `overrides[<key>]`, skip to Step 6.

5. Read `.theme-forge/cases/<page>.json` if it exists. Cases file presence enables multi-case probing (Step 2.3). Missing is fine — single-URL probe works for sections without case variation.

### Step 2: Auto-discover (default path)

The auto-discover pipeline has seven sub-stages. Each is independently useful; a user can stop after any stage and hand-edit the JSON.

#### 2.0.5 Build source-binding map (v0.23, per side)

Source-binding is the v0.23 primary disambiguation signal. Before library merge and scoring, parse each side's Liquid to derive a role-to-locus map. The locus is the enclosing HTML element where a role's Liquid variable / snippet / form is authored; DOM candidates outside that subtree are vetoed later in Step 2.3.6.

**Inputs:**
- Section's root `.liquid` file (from `base-cache/sections/<section>.liquid`).
- `intake-anchors/role-bindings.json` — maps role name → `{ variables, snippets, form_action }`.
- Snippet resolver — looks up snippet name → filesystem path under `base-cache/snippets/`.

**Driver:** `intake-anchors/lib/run-source-binding.js` → `runSourceBindingForSide({ rootLiquid, html, candidates, roleBindings, resolveSnippet, ignoreVetoRoles })` runs the full pipeline for one side. Returns map of roleName → `{ rank, locusSelector, locusReason, loci }`.

**Internals (all pure functions, all in `intake-anchors/lib/`):**

1. `liquid-parser.js` — parse Liquid via `@shopify/liquid-html-parser@2.9.2`. AST cache keyed on `(filepath, mtime)`. `clearLiquidCache()` resets between runs.
2. `source-binding.js` → `resolveRoleLocus(role, rootLiquid, roleBindings, { resolveSnippet })` walks the snippet chain transitively (depth cap 10, DFS, cycle detection on `(filename, render_args_hash)`) looking for variable outputs, `{% render %}` calls matching `snippets[]`, and form actions matching `form_action`. Returns `{ loci: [{ enclosingElement, stableAttrs, citation, callChain }], locusReason: null | "no_binding" | "no_locus_match" }`.
3. `dom-locus.js` → `classifyCandidates({ html, loci, candidates })` parses rendered HTML via `node-html-parser`, matches each locus to a DOM subtree using stable attrs (precedence: `data-block-id` > `data-shopify-editor-id` > `data-section-id` > `id` > distinctive class), and tags each candidate `sourceBindingMatch: "confirmed" | "rejected" | "inconclusive"`.

**Locus cardinality:** a role may have multiple loci (e.g., `primary_atc` in main form AND sticky mobile form). `resolveRoleLocus` returns all, sorted by call-chain depth (shallowest first). `locusSelector` picks the shallowest for the decision report's top-line selector.

**Inconclusive means:**
- The Liquid binding exists but resolves to a node with no stable attrs (bare `<h1>` inside a non-attributed wrapper).
- The snippet chain hits a client-side-rendered web component whose children aren't in the server HTML.
- The role has no entry in `role-bindings.json`.

Inconclusive is not a failure — it falls through to v0.22 element-type scoring in Step 2.3.6. This is intentional; source-binding is an *additional* signal, not a replacement.

**Escape hatches:**
- `--ignore-source-binding <role>` — CLI flag bypasses veto for named role(s). Collected into `ignoreVetoRoles` Set passed to the driver.
- `--no-source-binding` — skip Step 2.0.5 and Step 2.3.6 entirely; run pure v0.22.
- Project config `<role>: {"ignore_source_binding": true}` in `.theme-forge/config.json` → persistent per-project opt-out, merged into the Set.

**Unsupported section error:** if `role-bindings.json` has no entry for ANY role in the section library (e.g., cart, collection — not shipped in v0.23), hard-error:
```
ERROR: no role-bindings for section '<section-type>'. Add bindings to
intake-anchors/role-bindings.json, or run with --no-source-binding to
fall back to v0.22 scoring.
```

#### 2.1 Detect theme family (per side)

A theme family is a selector vocabulary (e.g., Horizon uses `variant-option`, `swatch-input`, `swatch-label`; the "legacy-jewelry" family uses `.variant-picker`, `.variant-material`, `[data-variant-picker]`). Two sites can use different families.

Detection order per side (stop at first hit):

1. **Explicit flag.** `--theme-family-live horizon` / `--theme-family-dev legacy-jewelry` wins over everything.
2. **Config hint.** `.theme-forge/config.json` → `theme_family.live` / `theme_family.dev` if set.
3. **Base-cache fingerprint.** Parse `base-cache/config/settings_schema.json` for a `theme_name` field. Known names map to families:
   - `Horizon` / `Horizon *` → `horizon`
   - `Dawn` / `Dawn *` → `dawn`
   - (anything else) → `unknown`
4. **DOM fingerprint.** Probe the live and dev home pages; run a fingerprint script that checks for known elements:
   ```javascript
   ({
     horizon: !!document.querySelector('variant-option, swatch-input, product-form-component'),
     dawn: !!document.querySelector('[class^="product__"], .product-form__buttons'),
     legacy_jewelry: !!document.querySelector('.variant-picker, [data-variant-material], .variant-material')
   })
   ```
   Pick the highest-confidence hit. Ties → `unknown`.

If both sides resolve to `unknown`, print a soft warning — extraction will still work with the section-type library alone, just with weaker priors.

Record the resolved families in the anchors file header:
```json
{ "theme_family": { "live": "legacy_jewelry", "dev": "horizon" } }
```

#### 2.2 Load merged role library

Load four layers and merge into a single role-list. **Candidates APPEND, sources are preserved** — later layers do NOT replace earlier candidates, they grow the candidate pool. The winning candidate is picked by scoring (Step 2.3), not by layer order.

Load order:

1. **Section-type library**: `intake-anchors/role-libraries/sections/<section_type>.json`. Baseline role list and candidates. Required — defines the role inventory.
2. **Theme-family library (live side)**: `intake-anchors/role-libraries/themes/<theme_family_live>.json`. Adds live-side theme candidates. Flagged `confidence: "speculative"` if not validated against real stores — these get a 0.5 weight multiplier.
3. **Theme-family library (dev side)**: `intake-anchors/role-libraries/themes/<theme_family_dev>.json`. Same, for dev.
4. **Project library** (optional): `.theme-forge/role-libraries/projects/<project_slug>.json`. Project-specific authored candidates. Created/updated by `intake-anchors --update-project` or hand-authored.

**Merge rules:**

- For each role, concatenate candidates from all four layers.
- If the same selector appears in multiple layers, collapse to a single entry with the highest weight and a union of sources (e.g., `["section:product-information", "project:<slug>"]`).
- Cross-section contamination filter: when loading a theme-family library, drop candidates whose role is not in the section library's `role_inventory` (prevents PDP libraries from leaking header/footer roles into a PDP run).
- **Speculative downweight**: when loading a theme-family library flagged `"confidence": "speculative"` (library-level or per-candidate), multiply each affected candidate's `weight` by 0.5 BEFORE collapsing duplicates. A project-layer entry with the same selector (`"source": "project:*"`, implicit `confidence: "validated"`) will then beat the speculative one on the duplicate-collapse step. Record the original weight as `weight_raw` and the applied multiplier as `confidence_multiplier` for the decision report.
- Missing files are skipped (section library is the only one required).

**Tie-break order (for Step 2.3 aggregator when scores are within ±0.01):**

`project > section > theme-family > discovered > reverse_probe`

This is the ONLY place layer order matters. Everywhere else, candidates compete purely on score.

Each role in the merged library looks like:
```json
{
  "role_name": "product_title",
  "element_type": "heading",
  "required": true,
  "candidates": [
    { "selector": "h1:not(.sticky-add-to-cart *)", "weight": 1.0, "source": "section:product-information" },
    { "selector": ".product-information h1", "weight": 0.9, "source": "theme:horizon" },
    { "selector": ".product-single__title h1", "weight": 0.85, "source": "theme:legacy_jewelry" }
  ],
  "expected_text_patterns": ["product name", "uppercase 1-5 words"],
  "expected_attributes": {}
}
```

#### 2.3 Multi-case probing

Instead of probing one URL, probe every active case in `cases/<page>.json` in parallel. If no cases file exists, treat the section's default URL as a single synthetic "default" case.

For each (case, side) pair:

1. Navigate to `${side_url}${case.path}`.
2. Wait for content to render (networkidle + 1s settle — the "probe ran before render" bug from v0.20.x).
3. Run the candidate-scoring script (below) for every role in the merged library.

**Progress streaming.** Probing N cases × 2 sides can take 30-60s on a large section. Don't leave the user staring at a blank terminal. Emit one line per (case, side) as each completes:

```
[ 1/8] dev   standard_product       18 roles scored (840ms)
[ 2/8] live  standard_product       18 roles scored (920ms)
[ 3/8] dev   full_personalizer      18 roles scored (810ms)
[ 4/8] live  full_personalizer      18 roles scored (1.1s)
...
[ 8/8] live  ready_to_ship          18 roles scored (900ms)

Step 2.4 aggregating across 4 cases ... done (120ms)
Step 2.4.5 reverse-probing 3 asymmetric roles ...
  reviews_summary: probe dev → no match (best 0.38 < 0.40)
  shipping_estimate: probe live → .shipping-estimator (score 0.71, passed tolerance)
  gift_wrapping: probe live → no match (best 0.28 < 0.40)
Step 2.4.5 done (2.1s)

Step 2.6 cross-verifying 15 resolved pairings ...
  product_title       passed (0.89)
  detail_price        passed (0.72)
  primary_atc         passed (0.94)
  shipping_estimate   FAILED (0.38 — text similarity 0.1)
  ...
Step 2.6 done (900ms)
```

This is the DX layer's "you can tell the thing is working" signal. It also gives users something to paste into a bug report when a role resolves wrong — the timing hotspot is usually visible in the stream.

**Candidate-scoring script.** For each role, query every `candidates[].selector` and score the matches. The scorer takes the full role entry (`role_name`, `element_type`, `required`, `expected_attributes`) so it can run element-type-aware checks without conflating `role_name` (`product_title`) with `element_type` (`heading`).

```javascript
((roleEntry, candidates, viewport) => {
  const { role_name, element_type, expected_attributes } = roleEntry;
  function collectAncestorClasses(el, depth = 6) {
    const out = [];
    let cur = el.parentElement;
    while (cur && depth-- > 0) {
      if (cur.className && typeof cur.className === 'string') {
        for (const cls of cur.className.trim().split(/\s+/)) if (cls) out.push(cls);
      }
      const tag = cur.tagName.toLowerCase();
      if (tag.includes('-')) out.push(tag);
      cur = cur.parentElement;
    }
    return out;
  }
  const scored = [];
  for (const c of candidates) {
    const els = [...document.querySelectorAll(c.selector)];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      // Skip invisible / off-screen above-fold elements unless role expects off-screen
      if (r.width < 2 || r.height < 2) continue;

      // Score components
      const sizeScore = Math.min(1, (r.width * r.height) / (viewport.width * 40));
      const positionScore = r.top < 1200 ? 1 : Math.max(0, 1 - (r.top - 1200) / 2000);
      const textLen = (el.textContent || '').trim().length;
      // textScore checks element_type (abstract category), not role_name (specific slot).
      // Roles with text-bearing element types reward non-empty, bounded-length text.
      const textScore = element_type === 'heading' || element_type === 'price' || element_type === 'button'
        ? (textLen > 0 && textLen < 80 ? 1 : 0.3)
        : 0.5;
      // attrScore uses role_name for role-specific DOM shape checks (add-to-cart is a primary_atc invariant).
      const attrScore = (role_name === 'primary_atc' && el.matches("button[name='add'], button[type='submit']")) ? 1 : 0.5;
      const weightScore = c.weight;

      const total = 0.25 * sizeScore + 0.25 * positionScore + 0.2 * textScore + 0.15 * attrScore + 0.15 * weightScore;
      scored.push({
        selector: c.selector,
        winning_selector: buildStableSelector(el),
        score: total,
        size: { w: Math.round(r.width), h: Math.round(r.height) },
        position: { x: Math.round(r.left), y: Math.round(r.top) },
        sample_text: (el.textContent || '').trim().slice(0, 80),
        // L6 element-type rule inputs (Step 2.3.5 reads these):
        tag: el.tagName,
        ancestor_classes: collectAncestorClasses(el),
        aria_label: el.getAttribute('aria-label') || null,
        role_attr: el.getAttribute('role') || null,
        input_type: el.tagName === 'INPUT' ? el.getAttribute('type') : null,
        has_src_or_dataset: (el.tagName === 'IMG' || el.tagName === 'PICTURE') ? !!(el.getAttribute('src') || Object.keys(el.dataset || {}).length) : null,
        child_count: el.children ? el.children.length : 0,
        source: c.source
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return { role_name, winner: scored[0] || null, runners_up: scored.slice(1, 4) };
})(ROLE_ENTRY, CANDIDATES_JSON, { width: innerWidth, height: innerHeight })
```

`ROLE_ENTRY` is the full role object from the merged library (including `role_name`, `element_type`, `required`, `expected_attributes`). `CANDIDATES_JSON` is `ROLE_ENTRY.candidates`.

`buildStableSelector(el)` prefers `id` → `data-*` attributes → class chain → tag + nth-of-type. Don't return positional-only selectors (`:nth-child(3)`) as primaries.

Run the scorer for every role, aggregate per case:

```
case: standard_product (/products/dainty-chain-necklace)
  product_title:           winner (score 0.94)  ".product-information h1"           "Dainty Chain Necklace"
  detail_price:            winner (score 0.89)  ".price-money:not([class*=sticky])" "$68"
  primary_atc:             winner (score 0.91)  "button[name='add']"                "Add to cart"
  variant_material:        no_match (best candidate scored 0.12 — below 0.4 threshold)
  reviews_summary:         winner (score 0.72)  "[class*=okendo]"                   "4.8 ★ (122)"
```

**No-guess rule:** if no candidate scores ≥ 0.4 (after Step 2.3.5 element-type adjustments), the role is `no_match`. Do NOT fabricate a selector.

#### 2.3.5 Apply element-type rules

The scorer output from Step 2.3 is a JSON object. Before picking the winner, apply element-type rules to each candidate. Rules live in `intake-anchors/element-type-rules.json` (read from disk — don't inline into the injected JS payload).

For each candidate:

1. Look up `rules[roleEntry.element_type]`. If absent, skip (no adjustment).
2. Evaluate each rule condition against the candidate's DOM sample (tag, text, ancestors, attributes — the Step 2.3 scorer must also capture `tag`, `ancestor_classes`, `aria_label`, `role_attr` fields for each candidate to feed this step).
3. Compute a signed adjustment: sum of per-condition pass/fail adjustments, then clamp to the library's `adjustment_cap` (default `[-0.2, +0.15]`).
4. Add the adjustment to `candidate.score`.
5. Record `candidate.element_type_adjustment` and `candidate.element_type_failures` (list of rule names that failed) for the decision report.

Rule summary (full spec in `intake-anchors/element-type-rules.json`):

| element_type | Strong signals | Blocked signals |
|---|---|---|
| `price` | Currency regex in text, allowed tags SPAN/DIV/P/PRICE-MONEY | `wishlist-product`, `cart-item`, `product-card` blobs |
| `heading` | H1-H4, 1-80 chars | Sticky-ATC ancestors, "Filters/Menu/Search/Cart" text |
| `button` | BUTTON tag or `role=button` or submit input, non-empty text or aria-label | product-card ancestors |
| `container` | ≥1 child, NOT matching price/heading/button rules | — |
| `image` | IMG or PICTURE with src or dataset | — |
| `swatch` | INPUT/LABEL/BUTTON/SPAN with value or aria-label | — |

After adjustments, re-sort the candidate list by `score` and update the winner. Then continue to Step 2.3.6.

**Adjustment cap rationale:** base scorer total sums to exactly 1.0 (0.25+0.25+0.2+0.15+0.15). An uncapped +0.2 or -0.3 would break the 0-1 range assumed by the 0.4 resolution threshold and the 0.5 cross-verify threshold. Cap at `[-0.2, +0.15]` preserves most of the signal while keeping the final score close to normalized.

#### 2.3.6 Source-binding veto (v0.23)

After Stage 1 scoring, apply the three-tier veto from Step 2.0.5's locus map. A determinate source-binding verdict is a **gate**, not a score nudge — there is no magic delta.

**Tiers (`intake-anchors/lib/ranker.js` → `rankWithVeto({ candidates, ignoreVeto })`):**

1. **Confirmed tier** — candidates with `sourceBindingMatch: "confirmed"` (inside the role's Liquid-derived DOM subtree). Rank first.
2. **Inconclusive tier** — candidates with `sourceBindingMatch: "inconclusive"`. Rank second, using the Stage 1 Element-rule-adjusted score. This is the only tier where screenshot fallback triggers.
3. **Rejected tier** — candidates with `sourceBindingMatch: "rejected"` (outside the locus). **Removed from consideration entirely** unless `ignoreVeto` is true.

Within each tier, candidates compete by Stage 1 score. The winner is the top-ranked candidate in the highest non-empty tier. Tier precedence: `confirmed > inconclusive`. Role-level tier never returns `"rejected"` — if every candidate is rejected, the ranker falls back to `tier: "inconclusive"` with `inconclusiveReason: "all_rejected"` and surfaces the failure in the decision report.

**Return shape:**
```js
{ winner, tier: "confirmed" | "inconclusive", inconclusiveReason: null | "locus_unresolved" | "all_rejected" | "veto_ignored", rejectedCandidates: [...], warnings: [...] }
```

**Worked example** (the canonical wrong-pairing case this veto was built for):
- Wrong candidate: base 0.74, element pass, source fail → **rejected**. Removed.
- Correct candidate: base 0.53, element fail, source pass → **confirmed**. Wins by default (only confirmed candidate).

**Why veto instead of a score delta:** Liquid variable bindings are the canonical definition of what a role *is*. A DOM candidate outside the role's Liquid-declared subtree is wrong by construction, not just low-scoring. Scoring-based tuning couldn't overcome base-score gaps around 0.21 in known wrong-pairing cases; veto eliminates the gap entirely.

**Escape hatches:**
- `--ignore-source-binding <role>` → sets `ignoreVeto: true` for that role. Rejected candidates are restored; ranking falls back to pure Stage 1 score. Ranker emits `warnings: ["veto_ignored"]` and tier = `"inconclusive"` with `inconclusiveReason: "veto_ignored"` so the decision report records the escape hatch was used.
- `--no-source-binding` → skips Steps 2.0.5 + 2.3.6 for the whole run.

**Load-bearing guardrail:** `tests/wrong-pairing-regression.test.ts` runs a fixture suite (`tests/fixtures/v0.22-correct-pairings/`) of v0.22-verified-correct pairings. Any binding misconfiguration that flips a correct pairing is caught there before ship.

#### 2.4 Aggregate across cases

For each role, combine per-case winners:

1. **Role presence**: present if ANY case has a winner scoring ≥ 0.4. Otherwise `no_match`.
2. **Base selector**: the selector that wins in the most cases. If there's a tie, prefer the one with higher average score.
3. **Case overrides**: any case whose winning selector differs from the base selector generates an `overrides[<case>].roles[<role>]` entry automatically.
4. **Absence override**: if a role has a winner in most cases but `no_match` in one, write `overrides[<case>].roles[<role>] = { present: false }` for that case.

Example:
```
role: primary_atc
  standard_product       → button[name='add']          (score 0.91)
  tag_personalizer       → button[name='add']          (score 0.92)
  full_personalizer      → .personalize-btn            (score 0.88)  ← override
  solid_gold_variant_sw  → .make-it-solid-gold-btn     (score 0.85)  ← override
  ready_to_ship          → button[name='add']          (score 0.90)

Base: button[name='add']
Overrides:
  full_personalizer: { live: ".personalize-btn", dev: ".personalize-btn" }
  solid_gold_variant_switching: { live: ".make-it-solid-gold-btn", dev: ".make-it-solid-gold-btn" }
```

#### 2.4.5 Asymmetric reverse-probe (L2)

**Why this step exists:** a real-world migration eval caught 0% live-side coverage — library candidates tuned for the dev theme missed on the live theme entirely. Rather than leave the role as `no_match_live`, take the dev winner's DOM fingerprint and search the live DOM for a matching element. This gets the live selector discovered, paired, and scored — feeding into Step 2.5 (discovery) as a `source: "reverse_probe"` candidate.

**When it runs:** for each role where Step 2.4 produced `status: "no_match_live"` OR `status: "no_match_dev"` (one side winner, the other absent). Do NOT run for `no_match` (both absent) or `resolved` (both present).

**Algorithm:**

1. **Pick the anchor side.** The side with the winner is the `anchor_side`. The side with no match is the `probe_side`.
2. **Extract the anchor fingerprint.** From the winner on `anchor_side`:
   - `text_norm` — trimmed, lowercased, whitespace-collapsed `textContent`, truncated to 80 chars.
   - `rect` — `{ top, left, width, height }` from `getBoundingClientRect()`.
   - `tag`, `role_attr`, `aria_label` — from the scorer's captured fields.
   - `viewport_ratio` — `top / viewport.height` (normalizes across the two viewports, which may differ).
3. **Probe the other side.** On `probe_side.page`, run a DOM-wide scan (NOT using `candidates[]`). Score every element:
   - Text similarity: normalized Levenshtein between `el.textContent` and `anchor.text_norm`. Weight 0.45.
   - Position similarity: `1 - |el.top/probe_viewport.height - anchor.viewport_ratio|` clamped `[0, 1]`. Weight 0.25.
   - Size similarity: `min(ratio, 1/ratio)` of area. Weight 0.15.
   - Tag / role agreement: exact tag match = 1, compatible (H1 vs H2 for heading) = 0.5, else 0. Weight 0.15.
4. **Tolerance per element_type.** Apply element-type-specific floors so the probe doesn't accept clearly-wrong elements:
   - `heading`: text similarity ≥ 0.8 (headings are short and stable).
   - `price`: text must match the currency regex from `element-type-rules.json` price rule (numeric value may drift across variants, so similarity threshold is 0.3 but the regex pass is required).
   - `button`: tag must be BUTTON or A or INPUT[type=submit], AND (aria_label similarity ≥ 0.6 OR text similarity ≥ 0.6).
   - `container`, `image`, `swatch`, `text`: fall back to the composite score ≥ 0.6 with no hard text floor.
5. **Emit a reverse-probe candidate.** The top-scoring element that passes the element-type floor becomes a new candidate with:
   - `selector`: built via `buildStableSelector(el)` (same helper Step 2.3 uses).
   - `weight`: the composite score (already `[0, 1]`).
   - `source`: `"reverse_probe"`.
   - `confidence`: `"derived"` (not validated against a theme library — surfaced in the decision report).
6. **Re-score through Step 2.3.** The reverse-probe candidate goes back through the standard scoring pipeline on `probe_side`, including Step 2.3.5 element-type adjustments. It wins only if it still scores ≥ 0.4 after all adjustments.
7. **Update the role status.** If the reverse-probe candidate wins, flip `status` from `no_match_*` to `resolved` AND tag `roles[<role>].live_source` or `dev_source` as `"reverse_probe"` (so the decision report and subsequent cross-verify can warn about lower-confidence pairings).

**Safeguards:**

- Reverse-probe never runs when BOTH sides are no-match (there's no fingerprint to probe with).
- Reverse-probe never overrides an existing winner — it only fills gaps.
- Tie-break order (Step 2.2) places `reverse_probe` below `discovered`, so a Step 2.5-discovered candidate with equal score wins.
- Every reverse-probed role still goes through Step 2.6 cross-verify. A reverse-probed pairing that fails cross-verify gets `cross_verify: "failed"` → find-variances emits its variances as `confidence: "rejected"` (per Step 2.6 rules).

**MVP scope:** this step is Loop 1 only — single-pass fingerprint match. Future iterations may add multi-anchor triangulation (use sibling roles as position constraints) but that's out of v0.22 scope.

#### 2.5 Generative role discovery from base-cache

Role libraries are finite. Real themes contain custom snippets that libraries won't predict (`{% render 'brand-pdp-shipping' %}`, `{% render 'special-request' %}`). Parse `base-cache/sections/<section>.liquid` for structural landmarks:

1. **Headings** — any `<h[1-6]>` in the template → propose a role named from the literal-string context or nearby `{% render %}` tag.
2. **Snippet renders** — every `{% render 'NAME' %}` or `{% include 'NAME' %}` → propose a role named `NAME` (stripped prefix, snake_cased). Pull the snippet's root element from `base-cache/snippets/<NAME>.liquid`; use its first significant element as the selector candidate.
3. **Form targets** — every `<button type="submit">` or named form input → propose a role.
4. **Data-* attributes** — `data-something` attributes that appear once in the template often name roles (e.g., `data-shipping-estimate` → `shipping_estimate` role).

Discovered roles go through the same scoring pipeline as library roles. Score them, propose them to the user in Step 4 as "discovered" roles (vs "library" roles). User confirms or drops them.

#### 2.6 Cross-verify pairings

For each role that has both a live selector and a dev selector, run a match-confidence check:

1. **Text match** — live's sample_text vs dev's sample_text. Normalized Levenshtein similarity.
2. **Position match** — y-coordinate within ±10% of viewport height.
3. **Size match** — width/height ratios within ±30%.

Score: `0.5 * text_match + 0.3 * position_match + 0.2 * size_match`.

If score < 0.5, flag the pairing as **cross_verify_failed**:

```
role: product_title
  live:  ".brand-product-title h1"      "Dainty Chain Necklace"
  dev:   ".product-information h1"      "Filters (0)"
  cross_verify: FAILED (text similarity 0.03, position match 0.1)

  Likely cause: dev's h1 is in a different section (filter sidebar).
  Action: review in Step 4, maybe adjust dev selector to scope under .product-information.
```

Cross-verify failures block auto-accept. They surface in Step 4's review prompt.

**v0.23 source-binding parity:** after both sides have run through Step 2.3.6, compute `source_binding_parity` per role (from `intake-anchors/lib/ranker.js` → `sourceBindingParity(liveRank, devRank)`):

- **`both_confirmed`** — both winners in their side's confirmed tier. Happy path; skip the v0.22 cross-verify score check (strong signal already).
- **`partial`** — one side confirmed, the other inconclusive. Warning in decision report; pairing is accepted but flagged.
- **`mismatch`** — one side confirmed, other side had its Stage 1 winner rejected by source-binding. Strongest wrong-pairing signal we have. Flagged for manual review; **not** auto-rejected (user may override via `--ignore-source-binding`).
- **`both_inconclusive`** — both sides inconclusive. Fall through to v0.22 cross-verify above.

Parity is a warning layer, not a hard block. The decision report surfaces the conflict; the user decides. `find-variances` honors `mismatch` as `NEEDS_REVIEW` rather than `FAIL` (see `find-variances/SKILL.md`).

### Step 3: Draft anchors file

Emit `.theme-forge/anchors/<section>.json`. New fields vs v0.20 schema:

```json
{
  "section": "product-information-main",
  "section_type": "product-information",
  "page": "product",
  "version": 2,
  "updated_at": "2026-04-20T22:00:00Z",
  "theme_family": { "live": "legacy_jewelry", "dev": "horizon" },
  "roles": {
    "product_title": {
      "live": ".product-single__title h1",
      "dev": ".product-information h1",
      "status": "resolved",
      "element_type": "heading",
      "capture": { "computed_styles": true, "text_content": true },
      "sample_text": { "live": "Dainty Chain Necklace", "dev": "Dainty Chain Necklace" },
      "score": { "live": 0.94, "dev": 0.91 },
      "cross_verify": "passed"
    },
    "reviews_summary": {
      "live": "[class*=okendo-widget-rating]",
      "dev": null,
      "status": "no_match_dev",
      "element_type": "container",
      "capture": { "computed_styles": true },
      "notes": "Okendo embed not rendered on dev — likely app_embed missing. Run find-variances to confirm."
    },
    "special_request_subheading": {
      "live": null,
      "dev": null,
      "status": "no_match",
      "element_type": "text",
      "capture": { "text_content": true },
      "notes": "No candidate scored above 0.4 on any case. May be case-scoped (see overrides)."
    }
  },
  "rhythm": {
    "anchor": "product_title",
    "order_source": "dom_y_coord",
    "order": ["product_title", "subtitle", "reviews_summary", "detail_price", "variant_material_container", "variant_size_container", "primary_atc"],
    "template_block_order": ["product_title", "subtitle", "reviews_summary", "detail_price", "variant_picker", "primary_atc"],
    "divergence": ["variant_material_container vs variant_picker — template_block_order has a single block; DOM splits it into material + size containers"]
  },
  "multi_state": {
    "variant_material_container": {
      "probe_selector": "input[type='radio'][name*='Material'], button[data-option-value]",
      "click_each": true,
      "capture_per_state": ["swatch_image_url", "inline_text", "computed_styles"]
    }
  },
  "overrides": {
    "full_personalizer": {
      "roles": {
        "primary_atc": { "live": ".personalize-btn", "dev": ".personalize-btn", "status": "resolved" },
        "native_atc": { "present": false }
      }
    }
  }
}
```

**New fields vs v1:**
- `theme_family` — records the detected families per side.
- `roles.<role>.status` — one of: `resolved`, `no_match`, `no_match_live`, `no_match_dev`, `case_scoped` (only present in some cases). Never `null` without a status explaining why.
- `roles.<role>.score` — the candidate-scoring result per side (0-1). High score = confident match.
- `roles.<role>.cross_verify` — `passed`, `failed`, `skipped`. `skipped` only when one side is null.
- `roles.<role>.sample_text` — per-side text (was a single string in v1).
- `roles.<role>.notes` — human-readable note on why a role is `no_match` or flagged.
- `rhythm.order_source` — `dom_y_coord` (inferred from y-coordinates in Step 2.6) or `hand_authored`.
- `rhythm.template_block_order` — the order derived from `templates/<page>.json` block_order for cross-reference.
- `rhythm.divergence` — human-readable notes when DOM order differs from template order.

### Step 4: User review (interactive)

Print a review table showing winners, runners-up, no-matches, and cross-verify failures:

```
ANCHOR MAP DRAFT: product-information-main
Theme: live=legacy_jewelry, dev=horizon
Cases probed: standard_product, tag_personalizer, full_personalizer, ready_to_ship (4 of 8 active)

RESOLVED ROLES (18)
  role                          | live selector                    | dev selector                | live score | cross-verify
  product_title                 | .product-single__title h1        | .product-information h1     | 0.94       | passed
  detail_price                  | .price-money:not([class*=stick]) | .price:not([class*=sticky]) | 0.89       | passed
  primary_atc                   | button[name='add']               | button[name='add']          | 0.91       | passed
  ... (15 more)

CASE OVERRIDES (6)
  case: full_personalizer       → primary_atc swaps to .personalize-btn (both sides)
  case: ready_to_ship           → special_request_subheading hidden
  ... (4 more)

DISCOVERED FROM BASE-CACHE (3)
  role                          | signal                                  | suggested selector
  brand_pdp_shipping            | {% render 'brand-pdp-shipping' %}       | .brand-pdp-shipping
  special_request_block         | {% render 'special-request' %}          | .special-request
  giving_block                  | {% render 'giving-block' %}             | [data-giving-block]

NO_MATCH ROLES (4) — need attention
  role                          | reason
  reviews_summary               | matched on live (Okendo), not on dev. Likely missing app embed.
  special_request_subheading    | scored < 0.4 on all probed cases. Hand-verify or mark case-scoped.
  loyalty_points                | library role; zero candidates matched on either side. Drop?
  installments_block            | library role; matched on live only.

CROSS-VERIFY FAILED (1)
  role                          | issue
  subtitle                      | live "RINGS" vs dev "Lifetime Guarantee" — position match 0.3. Likely wrong dev selector.

Options:
  A) Accept draft as-is (writes resolved + discovered + case overrides; keeps no_match roles with status flags)
  B) Review uncertain roles (I'll prompt you on no_match and cross_verify_failed one by one)
  C) Regenerate (different case URLs, different scoring thresholds)
  D) Abort
```

If B: walk through each uncertain role. For each, offer: keep as no_match, hand-edit selector, drop the role, mark case-scoped.

Cross-verify failures MUST be resolved before Step 6 (either keep-as-flagged with explicit user acknowledgement, or fix the selector).

### Step 5: Per-case overrides (auto-probed in Step 2.4, confirm here)

Overrides are already computed by the aggregation pass. This step just confirms them:

```
CASE OVERRIDES detected during probing:

  full_personalizer
    ✓ primary_atc: base="button[name='add']" → case=".personalize-btn" (both sides)
    ✓ native_atc: present=false (role exists in base but not on this case's DOM)

  solid_gold_variant_switching
    ✓ primary_atc: base="button[name='add']" → case=".make-it-solid-gold-btn"

  ready_to_ship
    ✓ special_request_subheading: present=false

Options:
  A) Accept all (default)
  B) Review one by one
  C) Skip overrides (use base roles for all cases; variance noise will surface divergences)
```

### Step 6: Write file + commit

Write `.theme-forge/anchors/<section>.json` pretty-printed.

Commit by default (parallel sessions share anchor definitions):

```bash
git add .theme-forge/anchors/<section>.json
git commit -m "intake-anchors: <section-key> — <N> resolved, <M> no_match, <K> case overrides"
git push -u origin $(git branch --show-current)
```

Respect `cases_commit_default` config flag.

### Step 6.5: Decision report

Every run writes `.theme-forge/anchors/<section>.decision-report.json` alongside the anchors file. This is the audit trail — NOT consumed by find-variances, but critical for debugging "why did X win?" and for the `--why <role>` query (below).

**Schema:**

```json
{
  "section": "product-information-main",
  "section_type": "product-information",
  "theme_family": { "live": "legacy_jewelry", "dev": "horizon" },
  "generated_at": "2026-04-20T22:00:00Z",
  "libraries_loaded": [
    { "path": "intake-anchors/role-libraries/sections/product-information.json", "confidence": "validated", "role_count": 14 },
    { "path": "intake-anchors/role-libraries/themes/legacy_jewelry.json", "confidence": "speculative", "role_count": 8, "weight_multiplier": 0.5 },
    { "path": "intake-anchors/role-libraries/themes/horizon.json", "confidence": "speculative", "role_count": 12, "weight_multiplier": 0.5 },
    { "path": ".theme-forge/role-libraries/projects/acme.json", "confidence": "validated", "role_count": 3 }
  ],
  "roles": {
    "product_title": {
      "status": "resolved",
      "winner": {
        "selector": ".brand-product-title h1",
        "source": "project:acme",
        "side": "live",
        "score": 0.94,
        "score_breakdown": {
          "size": 0.25, "position": 0.25, "text": 0.20, "attr": 0.075, "weight": 0.143,
          "element_type_adjustment": 0.02,
          "element_type_failures": []
        },
        "sample_text": "Dainty Chain Necklace"
      },
      "runners_up": [
        { "selector": ".product-information h1", "source": "theme:horizon", "score": 0.71, "confidence_multiplier": 0.5, "reason": "speculative theme library" },
        { "selector": "h1", "source": "section:product-information", "score": 0.58 }
      ],
      "rejected": []
    },
    "detail_price": {
      "status": "resolved",
      "winner": { "selector": ".price-money", "source": "section:product-information", "score": 0.82 },
      "rejected": [
        { "selector": "wishlist-product", "reason": "element_type_failures=[blocked_tags,blocked_ancestors]", "base_score": 0.73, "final_score": 0.53 }
      ]
    },
    "reviews_summary": {
      "status": "no_match_dev",
      "winner": { "selector": "[class*=okendo-widget-rating]", "source": "section:product-information", "side": "live", "score": 0.68 },
      "reverse_probe": {
        "attempted": true,
        "anchor_side": "live",
        "probe_side": "dev",
        "best_candidate": { "selector": ".reviews", "score": 0.38, "tolerance_pass": false, "text_similarity": 0.12 },
        "outcome": "no_match — best candidate 0.38 below 0.4 threshold"
      }
    }
  },
  "cross_verify": {
    "product_title": { "score": 0.89, "outcome": "passed", "text_similarity": 0.92, "position_match": 0.95, "size_match": 0.76 },
    "detail_price": { "score": 0.72, "outcome": "passed" }
  },
  "cases_probed": ["standard_product", "full_personalizer", "tag_personalizer", "ready_to_ship"],
  "elapsed_ms": { "total": 18420, "step_2_1": 320, "step_2_3": 14800, "step_2_4_5_reverse_probe": 2100, "step_2_6": 900 }
}
```

**v0.23 source-binding additions** (emitted by `intake-anchors/lib/decision-report.js` → `buildDecisionReport`):

Per role, add a `source_binding` block:
```json
"source_binding": {
  "live": {
    "locus_selector": "#shopify-section-product-template [data-block-id='title']",
    "tier": "confirmed",
    "winner_in_locus": true,
    "rejected_candidates": []
  },
  "dev": {
    "locus_selector": "#MainProduct-title",
    "tier": "confirmed",
    "winner_in_locus": true,
    "rejected_candidates": ["h2.related-title"]
  },
  "parity": "both_confirmed",
  "citation": { "filepath": "product-template.liquid", "line": 42, "column": 3, "call_chain": ["product-template.liquid:42"] }
}
```

`tier` is three-valued: `"confirmed"` | `"inconclusive"` | `"rejected"` (role-level `rejected` means the locus resolved but every candidate was outside it — a stronger failure signal than `inconclusive`; see `decision-report.js` → `reportTierFromRank`).

Top-level summary:
```json
"source_binding_coverage": {
  "roles_confirmed": 10,
  "roles_inconclusive": 3,
  "roles_all_rejected": 1,
  "parity_mismatches": 1,
  "candidates_vetoed": 4
}
```

Summary uses worst-of across sides: a role that's confirmed on live and rejected on dev counts as `roles_all_rejected`, not confirmed.

**What to capture per role:**

- `winner` — the selected candidate with FULL score breakdown (the five base components summing to 1.0, plus the element-type adjustment).
- `runners_up` — up to 3 next-best, each with source and why it lost (typically just score delta, but `confidence_multiplier` is called out when a speculative library lost after downweight).
- `rejected` — candidates where `element_type_failures` was non-empty AND final_score < winner. This is the "why didn't the wishlist blob win?" answer.
- `reverse_probe` — if Step 2.4.5 ran for this role, record inputs and outcome even when it failed.
- `source_binding` (v0.23+) — per-side tier, locus selector, rejected candidate IDs, parity verdict, Liquid citation.

**Keep the file small.** Sample text truncated to 80 chars. Do not embed the scorer JS or full DOM snapshots. The report should read in under a second and diff cleanly across runs.

**Forward compatibility:** pre-v0.23 decision reports lack `source_binding` fields. The `--why` renderer (Step 6.6) prints "source binding: not available (run intake-anchors to populate)" when absent.

### Step 6.6: `--why <role>` query

```
/theme-forge intake-anchors <section-key> --why <role>
```

Reads `.theme-forge/anchors/<section>.decision-report.json`. Pretty-prints the `roles[<role>]` block with color/formatting:

```
role: detail_price
  status: resolved
  winner:
    selector: .price-money
    source:   section:product-information
    score:    0.82
      size     0.250
      position 0.250
      text     0.200
      attr     0.075
      weight   0.143
      element-type adjustment: +0.00 (no failures)
    sample:   "$68.00"

  rejected (element-type rules blocked these):
    wishlist-product
      base score: 0.73
      failures:   [blocked_tags: "WISHLIST-PRODUCT", blocked_ancestors: "wishlist-product"]
      adjustment: -0.20
      final:      0.53 (below winner 0.82)

    Why blocked: the v0.21 eval found a wishlist blob winning detail_price on live
    because size_score dominated. element-type rules filter blob elements where
    text is an attribute JSON dump rather than rendered price.

  source binding (v0.23):
    live:   tier=confirmed    locus: [data-block-id='price']
            rejected: [related-product-card .price]
    dev:    tier=confirmed    locus: #MainProduct-price
            rejected: []
    parity: both_confirmed
    citation: product-template.liquid:56 → price.liquid:4
```

If the decision report was produced by a pre-v0.23 run, print:
```
  source binding: not available (run intake-anchors to populate)
```

For the `mismatch` / `all_rejected` / `inconclusive` cases, surface the failure and the actionable next step:
```
  source binding (v0.23):
    live:   tier=confirmed    locus: [data-block-id='title']
    dev:    tier=rejected     all 3 dev candidates outside locus
                              rejected: [h1.related-title, h2.breadcrumb, h1.site-header]
    parity: MISMATCH
    Likely cause: dev's role-binding looks up the wrong Liquid variable,
                  OR dev DOM is missing the expected stable attrs.
    Next: re-run with --ignore-source-binding product_title, OR
          edit intake-anchors/role-bindings.json.
```

Exits 0 always. If `<role>` is missing from the report, list the available roles and exit 1.

### Step 7: Next step hint

```
INTAKE-ANCHORS COMPLETE: <section-key>
════════════════════════════════════════════════════════════
Theme family:   live=legacy_jewelry, dev=horizon
Resolved:       18 roles
No match:       4 roles (surface as "intake-anchors gaps" in find-variances)
Case overrides: 6
File:           .theme-forge/anchors/<section-key>.json

next (recommended):
  # Re-run extraction with semantic anchors (kills positional false positives)
  /theme-forge find-variances <section-key> --page <page> --cases

  # To tighten the no_match roles later
  /theme-forge intake-anchors <section-key> --add-case <key>
════════════════════════════════════════════════════════════
```

## Role library lookup order

Auto-discover loads four library layers and merges them. See Step 2.2 for the full spec. Short version:

1. **Skill-bundled section library**: `intake-anchors/role-libraries/sections/<section_type>.json`. Required. Defines the role inventory per section type.
2. **Skill-bundled theme library (live)**: `intake-anchors/role-libraries/themes/<theme_family_live>.json`. Speculative libraries get a 0.5 weight multiplier.
3. **Skill-bundled theme library (dev)**: `intake-anchors/role-libraries/themes/<theme_family_dev>.json`. Same.
4. **Project library**: `.theme-forge/role-libraries/projects/<project_slug>.json`. Project-authored candidates.

**Candidates APPEND across layers — they do not replace.** Same selector across layers collapses to highest weight + union of sources. Tie-break order (score within ±0.01): `project > section > theme-family > discovered > reverse_probe`.

Libraries shipped with v0.21:
- `sections/product-information.json`
- `sections/header.json`
- `sections/footer.json`
- `themes/horizon.json` (speculative — downweighted 0.5x)
- `themes/legacy_jewelry.json` (speculative — downweighted 0.5x)

Extend by writing a new JSON file: PR it back to theme-forge, or drop project-specific files at `.theme-forge/role-libraries/projects/<slug>.json`.

## Relationship to variance extraction

find-variances Step 1.5 reads `.theme-forge/anchors/<section>.json`. For each role:

1. Skip roles where `status: "no_match"` on both sides (can't compare nothing).
2. If `status: "no_match_live"` or `"no_match_dev"`, emit a `structural` variance (role exists on one side but not the other) tagged `source: "intake_anchors_gap"`.
3. If `status: "resolved"`, query `roles.<role>.live` on the live DOM and `.dev` on the dev DOM, run the `capture.*` extractors.
4. Apply per-case overrides from `overrides.<case>.roles.<role>` when find-variances runs with `--case <key>`.

**If no anchors file exists**, find-variances falls back to positional slicing with a loud warning and a next-step hint pointing at intake-anchors.

## `--update-project` workflow

Promotes this run's discovered and reverse-probed winners into the project-layer library so the next run starts with them pre-loaded. Keeps per-project learnings out of the shipped theme-family libraries (those stay speculative/generic).

**Project library path.** `.theme-forge/role-libraries/projects/<project_slug>.json`. `project_slug` resolves from:

1. `.theme-forge/config.json` → `project_slug` if set.
2. Else, basename of repo root (`git rev-parse --show-toplevel`), kebab-cased.

**Schema.** Mirror-image of a theme-family library. One JSON object, version-pinned:

```json
{
  "project": "acme",
  "version": 1,
  "updated_at": "2026-04-20T22:00:00Z",
  "roles": {
    "<role_name>": {
      "element_type": "heading",
      "candidates": [
        {
          "selector": ".brand-product-title h1",
          "weight": 0.95,
          "side": "live",
          "promoted_from": "reverse_probe",
          "promoted_at": "2026-04-20T22:00:00Z",
          "sample_text": "Dainty Chain Necklace"
        }
      ]
    }
  }
}
```

Per-candidate fields:

- `side`: `"live"` | `"dev"` | `"both"`. Tells the merge step which side's candidate list to join (a project-layer entry with `side: "live"` only appends into live-side scoring).
- `promoted_from`: `"reverse_probe"` | `"discovered"` | `"user"`. Records provenance so future reviewers know why this candidate exists.
- `promoted_at`: ISO timestamp of the run that added it.
- `sample_text`: the text the element had when promoted. Used by `--update-project` on later runs to detect drift ("the live element that matches this selector now reads 'X' instead of 'Y' — still correct?").

**Merge contract (Step 2.2 unchanged but worth reiterating):** project-layer candidates APPEND to the candidate list like any other layer. They win via higher raw weight (typical: 0.9-0.95, above theme-family's speculative 0.45 after downweight) AND via the tie-break order `project > section > theme-family > discovered > reverse_probe`. They are NOT speculative — no 0.5x multiplier.

**Promotion algorithm (runs after Step 6 write, before Step 7 hint, only when `--update-project` is set):**

1. Collect every role where the winning candidate's `source` is `"reverse_probe"` or `"discovered"`. Library-sourced winners (`section:*`, `theme:*`, `project:*`) are already in the libraries; no promotion needed.
2. For each promotion candidate, print:
   ```
   PROMOTE? role=product_title side=live
     selector:      .brand-product-title h1
     source:        reverse_probe
     score:         0.87
     sample_text:   "Dainty Chain Necklace"
     cross_verify:  passed
     target:        .theme-forge/role-libraries/projects/acme.json
   ```
3. Prompt `[y/n/q]`. `y` adds to project library. `n` skips this one. `q` aborts all remaining. `--yes` auto-accepts every prompt (only use in scripted flows where the user already reviewed the anchors file).
4. For each accepted promotion:
   - Load the existing project library JSON (or create the skeleton above).
   - If `roles[<role>]` doesn't exist, add it with this candidate.
   - If it does exist AND a candidate with the same `selector` + `side` is already present: update `weight` to `max(old, new)`, refresh `promoted_at`, but DO NOT duplicate.
   - Write back with pretty-printed JSON.
5. If `--dry-run`, print the diff (`+ added candidate ...`) instead of writing. No file changes.
6. After writes, run `git status` and print a one-line reminder:
   ```
   project library updated: .theme-forge/role-libraries/projects/acme.json
   next run will seed these as high-weight library candidates (tie-break: project > section)
   commit when ready: git add .theme-forge/role-libraries/
   ```

**Safeguards:**

- `--update-project` requires confirmation per candidate by default. The library is a durable artifact; silent mutation breaks the "library is curated" invariant.
- A promoted candidate with `cross_verify: "failed"` is NEVER offered for promotion — you'd be pinning a bad pairing. Skip with a warning line.
- `--dry-run` is encouraged when first trying `--update-project` on an established project — lets the user see what would migrate before touching disk.

## `--add-case` workflow

```
/theme-forge intake-anchors product-information-main --add-case line_item_size_property --page product
```

Runs Step 2 scoped to the new case URL. Diffs against base roles. Proposes overrides. Preserves existing overrides + base roles.

## Error messages (required)

**Missing section arg:**
```
ERROR: intake-anchors requires a section key.
Usage:
  /theme-forge intake-anchors <section-key> [--auto-discover] [--page <page>]
```

**Dev server not running:**
```
ERROR: dev server is not running — auto-discover needs it.

Start it with:
  /theme-forge env start
```

**Base-cache missing:**
```
ERROR: .theme-forge/base-cache/sections/<section>.liquid not found.

Generative role discovery (Step 2.5) reads the section liquid. Re-run pull-section to rebuild the cache:
  /theme-forge pull-section <section-key> --page <page>

Or skip generative discovery:
  /theme-forge intake-anchors <section-key> --auto-discover --no-generative
```

**Unknown theme family:**
```
ERROR: unknown theme family "custom_xyz"

Available families:
  horizon, dawn, legacy_jewelry

Add a new family by writing intake-anchors/role-libraries/themes/<family>.json, or use --theme-family-live unknown to skip theme-family enrichment.
```

**Unknown case in --add-case:**
```
ERROR: case "foo" not found in .theme-forge/cases/<page>.json

Active cases:
  full_personalizer, tag_personalizer, standard_product, ...

Check the case key or add it first:
  /theme-forge intake-cases <page> --from <artifact>
```

## Output

- `.theme-forge/anchors/<section>.json` — anchor map (committed)
- Next-step hint printed to conversation

## Notes

- Anchor maps are additive. Re-running intake-anchors with the same section diffs against the existing file and prompts; never silently overwrites.
- For sections with no archetype variation (header, footer, typical hero), run without cases setup — base roles cover all pages.
- `no_match` is a first-class state, not an error. find-variances treats it as "gap to investigate," not silent absence.
- Role libraries are shared across projects. If a project frequently edits the same role library, contribute the edit back to the skill libraries.
- Anchor maps replace positional selectors (`heading-0`, `button-0`) across the extraction stack. Pre-0.20 variances with those IDs are auto-stale on next find-variances run.
