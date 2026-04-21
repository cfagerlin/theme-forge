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
/theme-forge intake-anchors <section-key> [--auto-discover] [--from <artifact>] [--list] [--add-case <key>] [--page <page>] [--theme-family-live <name>] [--theme-family-dev <name>]
```

- `<section-key>` — required. Section filename without extension (e.g., `product-information-main`, `hero-1`).
- `--auto-discover` — probe live + dev with role heuristics, emit a draft anchors file, ask user to confirm. Default when no artifact given.
- `--from <artifact>` — path to a screenshot, CSV, or prose description. Overrides auto-discover.
- `--list` — pretty-print the existing anchors file.
- `--add-case <key>` — add a per-case override block to an existing anchors file.
- `--page <page>` — which page the section renders on. Required unless onboard wrote a default or section is in `_shared.json`.
- `--theme-family-live <name>` / `--theme-family-dev <name>` — explicit theme-family override. Skips auto-detection (Step 2.1). Values: any key under `intake-anchors/role-libraries/themes/`.

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

The auto-discover pipeline has five sub-stages. Each is independently useful; a user can stop after any stage and hand-edit the JSON.

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
     legacy_jewelry: !!document.querySelector('.variant-picker, .gldn-product-form, [data-variant-material]')
   })
   ```
   Pick the highest-confidence hit. Ties → `unknown`.

If both sides resolve to `unknown`, print a soft warning — extraction will still work with the section-type library alone, just with weaker priors.

Record the resolved families in the anchors file header:
```json
{ "theme_family": { "live": "legacy_jewelry", "dev": "horizon" } }
```

#### 2.2 Load merged role library

Load three layers, merge in order (later wins):

1. **Section-type library**: `intake-anchors/role-libraries/sections/<section_type>.json`. Baseline role list.
2. **Theme-family library (live side)**: `intake-anchors/role-libraries/themes/<theme_family_live>.json`. Adds selector candidates that are specific to the live theme.
3. **Theme-family library (dev side)**: `intake-anchors/role-libraries/themes/<theme_family_dev>.json`. Same, for dev.
4. **Project override** (optional): `.theme-forge/role-libraries/<section_type>.json`. Any project-local tweaks win.

Each role in the merged library looks like:
```json
{
  "role_name": "product_title",
  "element_type": "heading",
  "required": true,
  "candidates": [
    { "selector": "h1:not(.sticky-add-to-cart *)", "weight": 1.0, "source": "section:product-information" },
    { "selector": ".product-information h1", "weight": 0.9, "source": "theme:horizon" },
    { "selector": ".gldn-product-title h1", "weight": 0.9, "source": "theme:legacy_jewelry" }
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

**Candidate-scoring script.** For each role, query every `candidates[].selector` and score the matches:

```javascript
((role, candidates, viewport) => {
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
      const textScore = role === 'heading' || role === 'price' || role === 'button'
        ? (textLen > 0 && textLen < 80 ? 1 : 0.3)
        : 0.5;
      const attrScore = (role === 'primary_atc' && el.matches("button[name='add'], button[type='submit']")) ? 1 : 0.5;
      const weightScore = c.weight;

      const total = 0.25 * sizeScore + 0.25 * positionScore + 0.2 * textScore + 0.15 * attrScore + 0.15 * weightScore;
      scored.push({
        selector: c.selector,
        winning_selector: buildStableSelector(el),
        score: total,
        size: { w: Math.round(r.width), h: Math.round(r.height) },
        position: { x: Math.round(r.left), y: Math.round(r.top) },
        sample_text: (el.textContent || '').trim().slice(0, 80),
        source: c.source
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return { role, winner: scored[0] || null, runners_up: scored.slice(1, 4) };
})('ROLE', CANDIDATES_JSON, { width: innerWidth, height: innerHeight })
```

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

**No-guess rule:** if no candidate scores ≥ 0.4, the role is `no_match`. Do NOT fabricate a selector.

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

#### 2.5 Generative role discovery from base-cache

Role libraries are finite. Real themes contain custom snippets that libraries won't predict (`{% render 'gldn-pdp-shipping' %}`, `{% render 'special-request' %}`). Parse `base-cache/sections/<section>.liquid` for structural landmarks:

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
  live:  ".gldn-product-title h1"       "Dainty Chain Necklace"
  dev:   ".product-information h1"      "Filters (0)"
  cross_verify: FAILED (text similarity 0.03, position match 0.1)

  Likely cause: dev's h1 is in a different section (filter sidebar).
  Action: review in Step 4, maybe adjust dev selector to scope under .product-information.
```

Cross-verify failures block auto-accept. They surface in Step 4's review prompt.

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
      "live": ".gldn-product-title h1",
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
  product_title                 | .gldn-product-title h1           | .product-information h1     | 0.94       | passed
  detail_price                  | .price-money:not([class*=stick]) | .price:not([class*=sticky]) | 0.89       | passed
  primary_atc                   | button[name='add']               | button[name='add']          | 0.91       | passed
  ... (15 more)

CASE OVERRIDES (6)
  case: full_personalizer       → primary_atc swaps to .personalize-btn (both sides)
  case: ready_to_ship           → special_request_subheading hidden
  ... (4 more)

DISCOVERED FROM BASE-CACHE (3)
  role                          | signal                                  | suggested selector
  gldn_pdp_shipping             | {% render 'gldn-pdp-shipping' %}        | .gldn-pdp-shipping
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

Auto-discover reads role libraries in this order. Later layers override earlier ones.

1. **Skill-bundled section library**: `intake-anchors/role-libraries/sections/<section_type>.json`. Ships with theme-forge. Baseline roles per section type.
2. **Skill-bundled theme library (live)**: `intake-anchors/role-libraries/themes/<theme_family_live>.json`. Theme-family selector candidates.
3. **Skill-bundled theme library (dev)**: `intake-anchors/role-libraries/themes/<theme_family_dev>.json`.
4. **Project override**: `.theme-forge/role-libraries/<section_type>.json`. Project-specific tweaks win.

Role libraries are JSON. Users extend them by editing the project override file. The merge is role-by-role, candidate-by-candidate (later-layer candidates append to the list with their own weights, not replacing earlier candidates).

Libraries shipped with v0.21:
- `sections/product-information.json`
- `sections/header.json`
- `sections/footer.json`
- `themes/horizon.json`
- `themes/legacy_jewelry.json`

Add more by writing a new JSON file and either PR'ing it back or dropping it in `.theme-forge/role-libraries/`.

## Relationship to variance extraction

find-variances Step 1.5 reads `.theme-forge/anchors/<section>.json`. For each role:

1. Skip roles where `status: "no_match"` on both sides (can't compare nothing).
2. If `status: "no_match_live"` or `"no_match_dev"`, emit a `structural` variance (role exists on one side but not the other) tagged `source: "intake_anchors_gap"`.
3. If `status: "resolved"`, query `roles.<role>.live` on the live DOM and `.dev` on the dev DOM, run the `capture.*` extractors.
4. Apply per-case overrides from `overrides.<case>.roles.<role>` when find-variances runs with `--case <key>`.

**If no anchors file exists**, find-variances falls back to positional slicing with a loud warning and a next-step hint pointing at intake-anchors.

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
