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

The canonical find-variances extractor slices the first-N elements inside `<main>` and records
computed styles for each. That works when live and dev have the same DOM order. It breaks when
horizon injects a sticky-ATC bar at the top of `<main>` — now live's first h1 is the real
product title (28px/200) and dev's first h1 is the sticky ATC (16px/400). Extractor compares
element-0 to element-0 and reports a fontSize variance that's really an element-mismatch.

The fix: pair selectors by semantic role, not position. This skill builds that map.

## When to run

- After `pull-section` on a theme with horizon-style structural differences (sticky bars,
  custom overlays, etc.) between live and dev.
- Before first `find-variances` run on a section — anchors drive extraction.
- After `find-variances` surfaces positional-mismatch false positives (all variances on
  `heading-0` / `button-0` / `price-0` → likely bad pairing).
- When a new case is added to `intake-cases` and its archetype swaps which elements exist
  (e.g., `full_personalizer` hides native ATC and shows a custom button).

## Prerequisites

- `.theme-forge/config.json` exists (run `onboard` first)
- Dev server is running (auto-discover mode needs it)
- Section has been pulled (`pull-section <section>`)

## Arguments

```
/theme-forge intake-anchors <section-key> [--auto-discover] [--from <artifact>] [--list] [--add-case <key>] [--page <page>]
```

- `<section-key>` — required. Section filename without extension (e.g., `product-information-main`, `hero-1`, `gldn-pdp-personalization`).
- `--auto-discover` — probe dev DOM with role heuristics, emit a draft anchors file, ask user to confirm. Default when no artifact is given.
- `--from <artifact>` — path to a screenshot, CSV, or prose description of the desired anchors. Overrides auto-discover.
- `--list` — pretty-print the existing anchors file.
- `--add-case <key>` — add a per-case override block to an existing anchors file (pairs selectors that differ in that case's rendering).
- `--page <page>` — which page the section renders on (used for auto-discover URL). Required unless the section is in `_shared.json` or onboard wrote a default.

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

2. Resolve section classification (per-page vs shared) from `.theme-forge/mappings/sections/<section>.json`. Anchors file location is always flat: `.theme-forge/anchors/<section>.json`. Classification only drives which page URL to navigate for auto-discover.

3. If `--list`, read and print the existing file, then exit.

4. If `--add-case <key>`, read the existing anchors file + cases file, run Step 2 scoped to the case URL, merge into `overrides[<key>]`, then skip to Step 6.

5. Verify `.theme-forge/cases/<page>.json` exists if the section has known cases. Missing cases file is not fatal — anchors can be authored without cases — but if it's there, auto-discover will probe the first active case for URLs. Print the case list.

### Step 2: Auto-discover (default path)

Navigate dev at the first active case's URL (from `cases/<page>.json`). Run a role-heuristic probe:

```javascript
// Heuristic mapping: DOM signal → role key
// Runs inside the section's container (scoped by mapping file's selector, not whole <main>)
const SECTION_ROOT = document.querySelector('<section-mapping-selector>');

const ROLE_HEURISTICS = [
  { role: 'product_title', test: (el) => el.tagName === 'H1' && !el.closest('.sticky-add-to-cart') },
  { role: 'subtitle', test: (el) => el.matches('.product-information__subtitle, .product-type, [class*=subtitle]') },
  { role: 'reviews_summary', test: (el) => el.matches('[class*=okendo], [class*=reviews-summary], [class*=yotpo]') },
  { role: 'detail_price', test: (el) => el.matches('.price, [class*=price]:not([class*=sticky]):not([class*=compare])') },
  { role: 'primary_atc', test: (el) => el.matches("button[name='add'], button[type='submit'][name='add']") && !el.closest('.sticky-add-to-cart') },
  { role: 'variant_material_container', test: (el) => el.matches('[data-option*=material i], [data-option*=material i], fieldset:has(legend:contains("Material"))') },
  { role: 'variant_finish_container', test: (el) => el.matches('[data-option*=finish i], fieldset:has(legend:contains("Finish"))') },
  { role: 'variant_size_container', test: (el) => el.matches('[data-option*=size i], fieldset:has(legend:contains("Size"))') },
  { role: 'special_request_toggle', test: (el) => el.matches('[class*=special-request], [data-region=special-request]') },
  // ...extend per section type
];

const found = {};
for (const { role, test } of ROLE_HEURISTICS) {
  const el = Array.from(SECTION_ROOT.querySelectorAll('*')).find(test);
  if (el) found[role] = {
    selector: buildStableSelector(el),
    element_type: inferType(el),
    sample_text: el.textContent.trim().slice(0, 40)
  };
}
```

Heuristic selectors are section-type dependent. The skill ships with role libraries keyed by section type (derived from `.theme-forge/mappings/sections/<section>.json` `section_type` field):
- `product-information` → the heuristics above
- `hero` → `main_heading`, `subheading`, `primary_cta`, `background_image`
- `featured-collection` → `section_heading`, `product_card_container`, `product_card_title`, `product_card_price`
- `footer` → `footer_columns_container`, `logo`, `social_links_container`, `newsletter_form`
- `header` → `logo`, `primary_nav_container`, `cart_trigger`, `search_trigger`

Unknown section types fall back to a generic heuristic set (h1/h2/h3, `.price`, `button[type=submit]`, `img`, `form`).

After probing dev, repeat the probe on live at the same URL. If the live selector matches (same site structure in both places), keep one selector for both. If live differs, record both.

### Step 3: Draft anchors file

Emit a draft to `.theme-forge/anchors/<section>.json`:

```json
{
  "section": "product-information-main",
  "section_type": "product-information",
  "page": "product",
  "version": 1,
  "updated_at": "2026-04-20T20:00:00Z",
  "roles": {
    "product_title": {
      "live": ".product-information__title h1",
      "dev": ".product-information__title h1",
      "element_type": "heading",
      "capture": {
        "computed_styles": true,
        "text_content": true
      },
      "sample_text": "Thames Pinky Ring"
    },
    "subtitle": {
      "live": ".product-information .product-type",
      "dev": ".product-information .product-type",
      "element_type": "text",
      "capture": { "computed_styles": true, "text_content": true },
      "sample_text": "RINGS"
    },
    "detail_price": {
      "live": ".product-information .price:not(.sticky-add-to-cart__price)",
      "dev": ".product-information .price:not(.sticky-add-to-cart__price)",
      "element_type": "price",
      "capture": { "computed_styles": true, "text_content": true },
      "sample_text": "$116"
    },
    "primary_atc": {
      "live": "button[name='add']:not(.sticky-add-to-cart__button)",
      "dev": "button[name='add']:not(.sticky-add-to-cart__button)",
      "element_type": "button",
      "capture": { "computed_styles": true, "text_content": true }
    },
    "variant_material_container": {
      "live": "fieldset[data-option='Material'], [data-variant-picker='Material']",
      "dev": ".variant-option[data-option-name='Material']",
      "element_type": "container",
      "capture": { "computed_styles": true, "layout_signature": true, "child_layout": true }
    },
    "variant_size_container": {
      "live": "fieldset[data-option='Size']",
      "dev": ".variant-option[data-option-name='Size']",
      "element_type": "container",
      "capture": { "computed_styles": true, "layout_signature": true, "child_layout": true }
    },
    "special_request_subheading": {
      "live": ".special-request__subheading",
      "dev": ".special-request__subheading",
      "element_type": "text",
      "capture": { "text_content": true }
    }
  },
  "rhythm": {
    "anchor": "product_title",
    "order": ["product_title", "subtitle", "reviews_summary", "detail_price", "variant_material_container", "variant_size_container", "primary_atc"]
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
        "primary_atc": { "live": ".personalize-btn, [data-personalize]", "dev": ".personalize-btn, [data-personalize]" },
        "native_atc": { "present": false }
      }
    },
    "ready_to_ship": {
      "roles": {
        "special_request_subheading": { "present": false }
      }
    }
  }
}
```

**Fields:**
- `roles.<role_key>` — the semantic element. Each entry has:
  - `live`, `dev` — CSS selectors. Usually identical (same store, same theme vendor). Differ when live runs a different theme or has custom elements dev doesn't.
  - `element_type` — drives default captures. One of: `heading`, `price`, `button`, `container`, `text`, `image`, `toggle`.
  - `capture` — overrides default extraction per role:
    - `computed_styles` (bool) — run the 25-property computed-style extraction at this anchor.
    - `text_content` (bool) — capture `.textContent.trim()` for textContent diffing.
    - `layout_signature` (bool) — capture `display`, `flexDirection`, `gridTemplateColumns`, `gap`, `justifyContent`, `alignItems` on the container.
    - `child_layout` (bool) — capture each direct child's `{tag, class, x, y, w, h}`. Enables "Material and Finish should be side-by-side" detection.
    - `attributes` (array) — specific attributes to capture (e.g., `["src", "alt"]` for images).
  - `sample_text` (optional) — first 40 chars of textContent at discovery time. Helps the user sanity-check the pairing.
- `rhythm.anchor` + `rhythm.order` — defines the vertical-rhythm probe. Measures inter-anchor gaps in the order given. `anchor` is the section-level origin (typically the top-most visible anchor).
- `multi_state.<role_key>` — enables variant-option probing. `probe_selector` enumerates the options. `click_each: true` tells find-variances to click each option, wait for DOM settle, and capture `capture_per_state` fields per state.
- `overrides.<case_key>.roles.<role_key>` — merged over base roles when find-variances runs with `--case <key>`:
  - `live` / `dev` — replaces the base selectors for this case.
  - `present: false` — removes the role entirely for this case (skip extraction, skip variances).

### Step 4: User review

Print the draft to the conversation and ask via AskUserQuestion:

```
ANCHOR MAP DRAFT: product-information-main

Discovered 9 roles via heuristic probe (dev + live at /products/thames-pinky-ring):

  role                          | sample text               | element_type
  ------------------------------|---------------------------|-------------
  product_title                 | "Thames Pinky Ring"       | heading
  subtitle                      | "RINGS"                   | text
  reviews_summary               | "4.8 ★ (122 REVIEWS)"     | container
  detail_price                  | "$116"                    | price
  primary_atc                   | "Add to cart"             | button
  variant_material_container    | (container, 3 children)   | container
  variant_size_container        | (container, 9 children)   | container
  special_request_subheading    | "Need a little something..." | text

  rhythm order: product_title → subtitle → reviews_summary → detail_price → variant_material_container → variant_size_container → primary_atc

Missing or uncertain:
  - installments_block — not found on dev. Does it render live? (skipped for now)
  - variant_finish_container — not found, live DOM has no Finish selector on this product. Other cases may.

Options:
  A) Accept draft + write to .theme-forge/anchors/product-information-main.json
  B) Accept with edits — I'll prompt you to edit specific roles
  C) Regenerate — probe a different case's URL for better coverage
  D) Abort
```

If B: for each role flagged uncertain, run a follow-up AskUserQuestion asking whether to keep / edit selector / remove.

### Step 5: Per-case overrides

After the base roles are accepted, prompt for case overrides if `cases/<page>.json` exists:

```
The page "product" has 8 active cases. Do any of them swap or hide any of these roles?

Known patterns that usually need overrides:
  - "full_personalizer" — hides native ATC, shows custom personalize button
  - "solid_gold_variant_switching" — similar, different button
  - "ready_to_ship" — hides special_request_subheading

Options:
  A) Auto-probe each case URL, detect differences, propose overrides
  B) Manually specify overrides (I'll prompt role by role per case)
  C) Skip overrides for now (use base roles for all cases — variance noise will reveal them later)
```

If A: navigate to each case URL, re-run the heuristic probe, diff against the base roles, propose overrides for roles that changed (different selector, missing entirely, or different visibility).

Auto-probe output:
```
Probing case: full_personalizer (/products/thames-pinky-ring)
  ✓ primary_atc differs: base="button[name='add']" → case=".personalize-btn"
  ✓ native_atc absent on this case → suggest override: { present: false }
  same for 7 other roles

Probing case: solid_gold_variant_switching (/products/slim-signet-ring)
  ✓ primary_atc differs: base="button[name='add']" → case=".make-it-solid-gold-btn"
  same for 8 other roles

Accept these 2 override blocks?
  A) Accept all
  B) Review one by one
  C) Skip overrides
```

### Step 6: Write file + commit

Write `.theme-forge/anchors/<section>.json` (pretty-printed JSON, 2-space indent).

Commit by default (parallel sessions share anchor definitions, same as cases files):

```bash
git add .theme-forge/anchors/<section>.json
git commit -m "intake-anchors: <section-key> — <N> roles, <M> case overrides"
git push -u origin $(git branch --show-current)
```

Respect the `cases_commit_default` config flag (opt-out applies to both cases and anchors).

### Step 7: Next step hint

```
INTAKE-ANCHORS COMPLETE: <section-key>
════════════════════════════════════════════════════════════
Roles:          <N>
Case overrides: <M>
File:           .theme-forge/anchors/<section-key>.json

next (recommended):
  # Re-run extraction with semantic anchors (kills positional false positives)
  /theme-forge find-variances <section-key> --page <page> --cases

  # Or scope to one case first
  /theme-forge find-variances <section-key> --page <page> --case <key>
════════════════════════════════════════════════════════════
```

## Auto-discover heuristics by section type

Role libraries live in `.theme-forge/role-libraries/<section-type>.json` (ships with the skill).
Onboard seeds the library for every section type detected in the base theme.

Example `product-information.json`:
```json
{
  "roles": {
    "product_title": {
      "heuristic": "h1:not(.sticky-add-to-cart *):not([hidden])",
      "element_type": "heading",
      "required": true
    },
    "subtitle": {
      "heuristic": ".product-type, .product-information__subtitle, [class*=subtitle]:not(h1):not(h2)",
      "element_type": "text",
      "required": false
    },
    "reviews_summary": {
      "heuristic": "[class*=okendo-widget-rating], [class*=yotpo-bottom-line], [data-reviews-summary]",
      "element_type": "container",
      "required": false
    },
    "detail_price": {
      "heuristic": ".price:not([class*=sticky]):not([class*=compare]):not([class*=was])",
      "element_type": "price",
      "required": true
    },
    "primary_atc": {
      "heuristic": "button[name='add']:not([class*=sticky]), button[type='submit'][name='add']",
      "element_type": "button",
      "required": true
    }
  }
}
```

Users can extend libraries project-locally by editing the file. Auto-discover reads the library
before running heuristics.

## Relationship to variance extraction

find-variances Step 1.5 (anchor resolution) reads `.theme-forge/anchors/<section>.json` before
extracting styles. For each role:

1. Query `live[roles.<role>.live]` on the live DOM.
2. Query `dev[roles.<role>.dev]` on the dev DOM.
3. If both exist and `case_key` matches (or is null), run `capture.*` extractors.
4. If only one exists, emit a `presence` variance (element missing on one side).
5. If neither exists, skip (expected for case-scoped hidden elements).

**If no anchors file exists**, find-variances falls back to positional slicing with a loud warning and a next-step hint to run `intake-anchors`. See find-variances § "Fallback when anchors are missing" for the deprecation path.

## `--add-case` workflow

When a new case is added to `cases/<page>.json` that changes DOM structure:

```
/theme-forge intake-anchors product-information-main --add-case line_item_size_property --page product
```

Runs Step 2's probe on the new case URL, diffs against base roles, proposes an overrides block,
merges into the existing file. Preserves all other overrides and base roles untouched.

## Error messages (required)

**Missing section arg:**
```
ERROR: intake-anchors requires a section key.
Usage:
  /theme-forge intake-anchors <section-key> [--auto-discover] [--page <page>]
```

**Section mapping missing:**
```
ERROR: no mapping file at .theme-forge/mappings/sections/<section-key>.json

Run this first to create the mapping:
  /theme-forge pull-section <section-key> --page <page>
```

**Dev server not running:**
```
ERROR: dev server is not running — auto-discover needs it.

Start it with:
  /theme-forge env start
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

- Anchor maps are additive and merge-friendly. Re-running intake-anchors with the same section produces a diff + prompts, never silently overwrites.
- For sections with no archetype variation (`header`, `footer`, typical hero), just run `intake-anchors` without cases setup — the base roles work for all pages/cases.
- The cases file + anchors file together define a section's "shape": what elements exist, which ones swap per archetype, and how they lay out. verify-section assertions promoted with `case` + `anchor` fields are locked to the semantic element, not a positional guess.
- Anchor maps replace the `heading-0`, `button-0`, `price-0` positional selectors across the whole extraction stack. Variances carrying those legacy IDs from pre-0.20 reports are treated as `stale` on next find-variances run and pruned.
