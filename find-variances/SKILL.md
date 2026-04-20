---
name: find-variances
description: >
  Extract computed styles from live and dev sites, compare property-by-property, and write
  a structured variance array to the section report. Standalone or auto-invoked by pull-section.
  - MANDATORY TRIGGERS: theme-forge find-variances, find variances, extract variances, compare styles
---

# find-variances — Variance Discovery & Test Condition Generation

Extract computed styles from the live and dev sites for a single section, compare every
property at all three breakpoints, and write a structured variance array to the section
report. Each variance includes a test condition that refine-section can execute directly.

## When this runs

1. **Auto-invoked by pull-section** at Step 4 (initial baseline) and Step 8 (post-fix verification).
2. **Auto-invoked by refine-section** at Step 3 (full re-extraction after all fixes).
3. **Manually invoked** by the user: `/theme-forge find-variances <section-key> [--page <page>]`

## Arguments

```
/theme-forge find-variances <section-key> [--page <page>] [--breakpoint <name>] [--cases] [--case <key>] [--live-url <url>] [--dev-url <url>] [--force] [--add "description"]
```

- `section-key` — e.g., `product-information`, `header`, `hero-1`
- `--page` — the template page (e.g., `product`, `index`). Defaults to the page in the section report.
- `--breakpoint <name>` — restrict extraction and comparison to a single breakpoint.
  `<name>` must be one of `desktop`, `tablet`, `mobile`. When set, only that
  resolution's browser session runs (the others are skipped entirely), and only
  variances tagged with that breakpoint are emitted. Variances at other
  breakpoints in the existing section report are preserved unchanged (not marked
  stale, not deleted). Use this for a mobile-only audit after a responsive change,
  or to re-extract a single breakpoint after a focused fix. Any unknown value
  (including misspellings like `mobiel`) hard-errors with the allowed list.
- `--cases` — iterate every `active` case from `.theme-forge/cases/<page>.json`
  (or `_shared.json` for shared sections — see the classification rules in
  `intake-cases/SKILL.md`). Variances from each case merge into the section
  report, keyed by case. Equivalent to running `--case <key>` once per active
  case. Requires a cases file to exist; hard-errors with the exact
  `intake-cases` next-step command if not. Alias: `--archetypes`.
- `--case <key>` — restrict extraction to a single case. Reads
  `.theme-forge/cases/<page>.json` to resolve `path`, then runs exactly one
  case through extraction and comparison. Used by matrix drivers
  (`refine-page --cases`, `verify-page --cases`) to invoke this primitive per
  cell. When set, variance IDs are namespaced with `:{case}` and live-cache
  entries are stored under `live_cache_by_case[<case>]`. Cannot be combined
  with `--cases`.
- `--live-url <url>`, `--dev-url <url>` — override the origins read from
  `.theme-forge/config.json`. Stateless: no file is mutated. Matrix drivers
  pass these when resolving a case's full URL so parallel sessions on
  different pages never race on shared config. If either is passed, the other
  must also be passed (or omitted — no half-override). Config fallback still
  applies when both are omitted.
- `--force` — bypass live extraction cache and re-extract from live site
- `--add "description"` — add a user-defined variance (interactive, prompts for details)

## Prerequisites

- `.theme-forge/config.json` exists with `live_url` and `dev_url`
- Playwright CLI is available (via `scripts/screenshot.sh eval`)
- Dev server is running (for dev extraction)

## Hard Rules

### One source of truth
- **Variances live in the section report** at `.theme-forge/reports/sections/{section-key}.json` under the `variances` array. There is no separate variance file. The section report is the single source of truth for section status AND variance tracking.

### Merge, never replace
- **Re-extraction merges with existing variance entries.** Stable IDs based on `{element}:{property}:{breakpoint}` (or `{element}:{property}:{breakpoint}:{case}` in case mode) match old and new entries. Existing `attempts`, `user_approved`, and `source: "user"` entries are preserved. New differences are added. Fixed variances are auto-detected (dev now matches live). Entries not seen in re-extraction are flagged `"stale": true`, not deleted.
- **Case mode only touches entries for the scoped case.** An entry with a different `case` field is left untouched: not re-evaluated, not marked stale, not deleted. This is what makes parallel matrix runs across cases safe on the same section report.

### Test conditions are structured
- **Every variance gets a structured test condition.** Format: `{selector, property, expected}`. Optional `js` field for custom assertions. refine-section executes these directly — it does not improvise verification.

### Live extraction is cached
- **Live site values are cached** in `.theme-forge/reports/sections/{section-key}.json`. Legacy (no-case) runs use a flat `live_cache` object. Case-scoped runs use `live_cache_by_case[<case>]` — a nested map keyed by case. The cache key includes: URL path, section selector, and extraction timestamp. Cache is valid for the duration of a migration session. `--force` bypasses the cache.

## Variance Schema

Each entry in the `variances` array:

```json
{
  "id": "h1:fontWeight:desktop",
  "element": "h1.product-title",
  "property": "fontWeight",
  "breakpoints": ["desktop", "tablet", "mobile"],
  "case": null,
  "live_value": "200",
  "dev_value": "700",
  "type": "setting",
  "status": "open",
  "test": {
    "selector": "h1",
    "property": "fontWeight",
    "expected": "200",
    "shadow_host": null,
    "custom_property": "--heading-font-weight",
    "confidence": "high"
  },
  "attempts": [],
  "user_approved": false,
  "source": "extraction",
  "stale": false,
  "height_mechanism": null
}
```

Field reference:
- `id` — stable identifier: `{element_tag}:{property}:{breakpoint}` (legacy / no case) or `{element_tag}:{property}:{breakpoint}:{case}` (case mode). `{element_tag}.{class}:...` for disambiguation.
- `case` — the case key this variance was observed on, or `null` for legacy / non-case-scoped runs. When set, matches a key from `.theme-forge/cases/<page>.json`.
- `element` — human-readable element description (tag + class or text hint)
- `property` — CSS property name in camelCase (matches `getComputedStyle` output)
- `breakpoints` — which breakpoints this variance appears at
- `live_value` — computed value on the live site
- `dev_value` — computed value on the dev site
- `type` — `visibility` (text visible on live, invisible on dev — hard gate), `structural` (element missing/wrong position), `setting` (JSON setting controls it), `css` (needs CSS override), `content` (text/image difference), `layout` (bounding box / sizing)
- `status` — `open` (needs fix), `fixed` (verified PASS), `escalated` (3 failed attempts), `accepted` (user approved)
- `test` — structured test condition (see Test Conditions below)
- `attempts` — array of attempt records from refine-section
- `user_approved` — only `true` if user explicitly approved via AskUserQuestion
- `source` — `extraction` (auto-discovered), `user` (manually added), `visual` (from screenshot comparison), `settings_comparison` (template JSON settings mismatch), `app_detection` (app integration present on live but missing on dev)
- `fix_hint` — (settings/app variances only) human-readable hint about which JSON settings or app embeds to change. `null` for CSS variances.
- `height_mechanism` — (layout variances only) how the live site achieves its height. See Height Mechanism Extraction below. `null` for non-layout variances.
- `stale` — `true` if this entry was not seen in the latest re-extraction

### Test Conditions

The `test` object defines how to verify this variance is fixed:

**Structured test** (95% of cases):
```json
{
  "selector": "h1",
  "property": "fontWeight",
  "expected": "200",
  "shadow_host": "product-information",
  "custom_property": "--heading-font-weight",
  "confidence": "high"
}
```

- `selector` — CSS selector for the target element. If inside Shadow DOM, this is the selector WITHIN the shadow root.
- `property` — CSS property to check via `getComputedStyle`
- `expected` — the target value (from live extraction)
- `shadow_host` — if the element is inside a shadow root, the tag name of the host component. `null` if no Shadow DOM.
- `custom_property` — if a CSS custom property controls this value, its name. `null` if not applicable. Discovered by Shadow DOM auto-detection (see Step 3).
- `confidence` — `high` (selector verified on rendered DOM), `medium` (auto-discovered, not verified), `low` (heuristic guess)

**Custom JS test** (escape hatch for layout/bounding box checks):
```json
{
  "selector": null,
  "property": null,
  "expected": null,
  "js": "(() => { const el = document.querySelector('.product-media'); const r = el.getBoundingClientRect(); return Math.round(r.height); })()",
  "expected_js": "480",
  "confidence": "high"
}
```

When `js` is present, refine-section evaluates it and compares the result against `expected_js`.

### Test Condition Execution

refine-section executes test conditions like this:

**Structured test:**
```javascript
// If shadow_host is set, traverse into shadow DOM
let root = document;
if (test.shadow_host) {
  const host = document.querySelector(test.shadow_host);
  root = host?.shadowRoot || host || document;
}
const el = root.querySelector(test.selector);
const value = getComputedStyle(el)[test.property];
// Compare value against test.expected
```

**Custom JS test:**
```javascript
const value = eval(test.js);
// Compare value against test.expected_js
```

### Test Condition Correction Learning

When a test says PASS but the user reports the variance still exists:

1. **Ask the user** what's wrong (via AskUserQuestion): "The test says {property} is now {value} which matches live. What are you still seeing?"
2. **Help find the correct test**: inspect the DOM, find the right element/property
3. **Update the test condition** in the variance entry
4. **Write a learning** to `.theme-forge/learnings/{section-key}.json`:
   ```json
   {
     "type": "test_correction",
     "original_test": {"selector": "h1", "property": "fontWeight"},
     "corrected_test": {"selector": "h1", "property": "fontWeight", "shadow_host": "product-title"},
     "reason": "Element is inside product-title shadow root, direct selector misses it",
     "timestamp": "2026-04-12T..."
   }
   ```
5. **Future runs apply the learning**: when generating test conditions for similar elements, check learnings for corrections and use the corrected pattern.

## Step 1: Resolve Arguments and State

1. **Resolve origins.** If `--live-url` AND `--dev-url` are both passed, use
   them verbatim. Do NOT read `.theme-forge/config.json`. If exactly one is
   passed, hard-error:
   ```
   ERROR: --live-url and --dev-url must be passed together (or both omitted).
   ```
   If neither is passed, read `.theme-forge/config.json` for `live_url`,
   `dev_url`, and `dev_store` as before.
2. Resolve section selector:
   - Read `.theme-forge/mappings/sections/{section-key}.json` for the section's CSS selector on both live and dev sites
   - If no mapping, use `#shopify-section-{section-key}` as default
3. Resolve page URL path:
   - **Case mode (`--case <key>` or `--cases`):** Read
     `.theme-forge/cases/<page>.json` (or `_shared.json` for sections
     classified as shared in `.theme-forge/mappings/sections/<section>.json`).
     For each scoped case, the path is `cases[<key>].path`.
   - If `--page` is provided and no case is scoped, use the default page path
     for that template (e.g., `product` → `/products/{first-product-handle}`)
   - Otherwise read from the section report
4. Read existing section report at `.theme-forge/reports/sections/{section-key}.json`:
   - If it has a `variances` array, load it (for merge)
   - If it has `live_cache` or `live_cache_by_case`, check freshness (see Step 2)
5. Read ALL files in `.theme-forge/learnings/` for test correction learnings that apply.

### Breakpoint scoping (`--breakpoint`)

When `--breakpoint <name>` is provided:

1. **Validate** `<name>` is exactly one of `desktop`, `tablet`, `mobile`. Any other
   value (case-sensitive, no aliases) hard-errors:
   ```
   ERROR: --breakpoint must be one of: desktop, tablet, mobile (got "<name>")
   ```
2. **Set scope** to only that breakpoint. Steps 2 and 3 (extraction) iterate only
   the scoped breakpoint. Step 4 (comparison) only emits variances tagged with that
   breakpoint.
3. **Preserve existing variances at other breakpoints.** When merging:
   - Existing entries whose `breakpoints` array does NOT contain the scoped bp:
     left untouched (not marked stale, not deleted, `live_value` / `dev_value`
     unchanged).
   - Existing entries whose `breakpoints` array contains the scoped bp:
     re-evaluate using new extraction; update / mark fixed / mark stale per
     normal rules, but ONLY for the scoped bp. If the variance spans multiple
     breakpoints (e.g., `["desktop", "mobile"]`) and only the scoped one is now
     fixed, split the entry: the scoped bp becomes its own entry with
     `status: "fixed"`, the others retain their original entry.
4. **Tag the live cache.** Write only the scoped breakpoint's values into
   `live_cache.<bp>`. Other breakpoints' cache entries are untouched.
5. **Mark the section report** with the scoped extraction:
   ```json
   { "last_extraction": { "breakpoint_filter": "mobile", "timestamp": "..." } }
   ```
   so downstream tools (refine-section) know this run was scoped.

If zero variances match the scoped breakpoint AND no existing variances exist at
that breakpoint, write the section report with the empty extraction record and
print:
```
find-variances <section-key> --breakpoint <name>
  No variances at <name>. (extracted X properties, all match live)
```
Exit 0.

### Case scoping (`--cases` / `--case <key>`)

When `--cases` or `--case <key>` is provided:

1. **Locate the cases file.**
   - Per-page sections: `.theme-forge/cases/<page>.json`.
   - Shared sections (header, footer, announcement bar, cart drawer, anything
     classified `shared: true` in `.theme-forge/mappings/sections/<section>.json`):
     `.theme-forge/cases/_shared.json`. The classification drives the file
     choice automatically — the caller does not pass a flag.
   - If the file is missing, hard-error with the next command:
     ```
     ERROR: No cases file for page "<page>".

     Expected:
       .theme-forge/cases/<page>.json

     Create it with:
       /theme-forge intake-cases <page> --from <screenshot-or-csv>
     ```
2. **Resolve the scoped cases.**
   - `--case <key>`: exactly one case. If `cases[<key>]` is missing or its
     `status` is not `active`, hard-error with the list of valid active keys.
   - `--cases`: every case whose `status === "active"`. `dormant` and `draft`
     cases are skipped with a printed line each, so the skip is never silent.
   - `--cases` and `--case` cannot be combined. Hard-error if both passed.
3. **Loop ordering.** For each scoped case: run Step 2 (live extract),
   Step 3 (dev extract), Step 4 (compare). The outer `--breakpoint` scope
   still applies — a `--cases --breakpoint mobile` run does `for each case,
   mobile only`. Breakpoint is outer, case is inner in the higher-level
   matrix drivers, but inside find-variances the order is case → breakpoint
   because breakpoints are a within-case viewport sweep, not a cross-case
   gate.
4. **Tag every variance with `case: <key>`.** Stable ID becomes
   `{element}:{property}:{breakpoint}:{case}`. Merge against existing
   entries using the case-aware ID. **Entries with a different case are
   untouched** — not re-evaluated, not marked stale.
5. **Cache per case.** Write extracted live values to
   `live_cache_by_case[<case>]` instead of the flat `live_cache`. Cache
   hits are scoped to the same `(case, url_path, section_selector)`
   tuple.
6. **Mark the section report** with the scoped extraction run:
   ```json
   {
     "last_extraction": {
       "case_scope": ["full_personalizer", "tag_personalizer"],
       "breakpoint_filter": null,
       "timestamp": "..."
     }
   }
   ```
7. **Legacy mode coexistence.** A section report can contain both legacy
   (case: null) variances from a pre-cases run AND case-scoped entries.
   Do not rewrite legacy entries. They remain valid for the default
   (no-`--cases`) path.

### `--add` mode

If `--add "description"` was passed, skip extraction and go to Step 6 (Add User Variance).

## Step 2: Extract Live Site Styles

**Check cache first** (unless `--force`):
- Legacy (no case scoped): if `live_cache` exists AND `live_cache.url_path` matches the current page path AND `live_cache.section_selector` matches: use cached values. Skip to Step 3.
- Case mode: if `live_cache_by_case[<case>]` exists AND its `url_path` / `section_selector` match the current case's path and selector: use cached values for that case. Skip to Step 3 for that case.
- Otherwise, extract fresh.

**Extract at each breakpoint** (desktop 1280px, tablet 768px, mobile 375px):

1. Navigate to the live URL + page path
2. Scroll to the section
3. Dismiss popups (live site only)
4. Wait for lazy content (3 seconds)
5. Run the extraction script (see Extraction Script below)
6. Resize viewport and repeat for next breakpoint

When `--breakpoint <name>` is set, iterate only the scoped breakpoint. Skip the
others entirely (no navigation, no extraction). The cached values for other
breakpoints remain valid from prior runs.

**Write cache** to the section report. Legacy (no case) runs write the flat
`live_cache` object; case-scoped runs write to `live_cache_by_case[<case>]`:

```json
{
  "live_cache": {
    "url_path": "/products/kindred-birthstone-necklace",
    "section_selector": "#shopify-section-product-information",
    "extracted_at": "2026-04-12T04:00:00Z",
    "desktop": { ... extracted values ... },
    "tablet": { ... extracted values ... },
    "mobile": { ... extracted values ... }
  },
  "live_cache_by_case": {
    "full_personalizer": {
      "url_path": "/products/thames-pinky-ring",
      "section_selector": "#shopify-section-product-information",
      "extracted_at": "2026-04-20T12:00:00Z",
      "desktop": { ... },
      "tablet": { ... },
      "mobile": { ... }
    },
    "tag_personalizer": {
      "url_path": "/products/birth-flower-disk-necklace",
      "section_selector": "#shopify-section-product-information",
      "extracted_at": "2026-04-20T12:01:00Z",
      "desktop": { ... },
      "tablet": { ... },
      "mobile": { ... }
    }
  }
}
```

## Step 3: Extract Dev Site Styles + Shadow DOM Discovery

Extract from the dev site at each breakpoint, using the same page path as live.
When `--breakpoint <name>` is set, iterate only the scoped breakpoint (same
restriction as Step 2).

**At each breakpoint, after the standard extraction, run Shadow DOM discovery:**

For each element that was found inside a Shadow DOM boundary during extraction:

```javascript
// Find the host component
const host = element.getRootNode().host;
if (!host) return null; // not in shadow DOM

// Scan the host's stylesheets for custom properties
const sheets = host.shadowRoot?.adoptedStyleSheets
  || [...(host.shadowRoot?.querySelectorAll('style') || [])].map(s => s.sheet);

const customProps = new Set();
for (const sheet of sheets) {
  try {
    for (const rule of sheet.cssRules) {
      const text = rule.cssText;
      // Find var(--xxx) references — these are properties the component consumes
      const matches = text.matchAll(/var\(--([^,)]+)/g);
      for (const m of matches) customProps.add('--' + m[1]);
    }
  } catch (e) { /* cross-origin sheet, skip */ }
}

// Also check inline styles and computed custom properties on the host
const hostStyle = getComputedStyle(host);
// Check common theme custom property patterns
const commonPrefixes = ['--heading-', '--body-', '--button-', '--price-', '--color-'];
```

**For each discovered custom property:**
- Check if it maps to a property we're extracting (e.g., `--heading-font-weight` → `fontWeight` on heading elements)
- Record it in the variance test condition as `custom_property`
- Set confidence to `medium` (auto-discovered, not yet verified by a fix attempt)

**Apply test correction learnings:** Before finalizing test conditions, check `.theme-forge/learnings/` for `test_correction` entries. If a learning says "for {element} in this theme, use {corrected_test}," apply the correction and set confidence to `high`.

## Step 4: Compare and Build Variance List

For each breakpoint (desktop, tablet, mobile), compare every extracted property between live and dev. When `--breakpoint <name>` is set, compare only the scoped breakpoint and follow the merge rules in Step 1's "Breakpoint scoping" section (preserve other-breakpoint variances untouched, never mark them stale).

1. **Match elements** by tag + role (heading, body, button, image, container, etc.)
2. **Compare each property** — if values differ, create a variance entry
3. **Classify type:**
   - `visibility` — text element visible on live but invisible on dev (clipped, hidden, zero-size). Hard gate.
   - `structural` — element exists on live but not dev, or vice versa
   - `setting` — check if the property is controlled by a JSON setting (read section schema)
   - `css` — needs CSS override
   - `layout` — bounding box differences (width, height, position)
   - `content` — text or image src differences (flag only, do not auto-fix)

   **Equivalent image URL filter.** When comparing `<img src>`, background-image URLs, or any image-typed setting value, the live and dev sites can reference the same image with different URL forms. When `config.same_shopify_store` is `true` (default — read from `.theme-forge/config.json`), do NOT emit a `content` variance if the live and dev URLs are equivalent under any of these tests:
   - Same filename (basename + extension after stripping query params and CDN versioning), e.g., `cdn.shopify.com/.../hero.jpg?v=123` ≡ `cdn.shopify.com/.../hero.jpg?v=456` ≡ `shopify://shop_images/hero.jpg`
   - Same Shopify reference, e.g., `shopify://shop_images/X` ≡ a CDN URL whose path ends in `/X`
   - Both empty / both placeholders
   
   Only emit a `content` variance for an image when the underlying file actually differs (different filename) or one side is empty and the other isn't. URL-form-only differences are not regressions on the same store. If `same_shopify_store: false`, fall back to strict string equality (any URL difference is a real variance because the dev store may not have the live store's CDN file).

4. **Generate test condition:**
   - Use the element's verified selector from extraction
   - If Shadow DOM was detected, set `shadow_host` and `custom_property`
   - Apply any test correction learnings
   - Set confidence based on how the selector was discovered
5. **Merge with existing variances** (if re-extraction):
   - Match by stable ID — legacy: `{element}:{property}:{breakpoint}`; case mode: `{element}:{property}:{breakpoint}:{case}`.
   - Existing entry found: update `live_value`, `dev_value`. If dev now matches live, set `status: "fixed"`. Preserve `attempts`, `user_approved`, `source`.
   - No existing entry: add as new with `status: "open"`, `source: "extraction"`. In case mode, tag `case: <key>`; in legacy mode, leave `case: null`.
   - Existing entry not in extraction **AND with the same case scope** as this run: set `stale: true`. Entries with a different `case` value are never marked stale by this run — they belong to a different cell of the matrix.

**Consolidate across breakpoints:** If the same element:property fails at all 3 breakpoints, create ONE entry with `breakpoints: ["desktop", "tablet", "mobile"]` rather than 3 separate entries. If values differ per breakpoint, create separate entries.

**Prioritize the queue (responsive-first ordering):**
1. `visibility` — text visible on live but invisible on dev. **Hard gate.** Nothing else matters if the user can't see it.
2. `structural` — element missing or wrong position
3. `layout` — height, width, bounding box differences. Fix responsive behavior BEFORE typography details. These establish the structural foundation that all other fixes depend on.
4. `setting` — JSON setting change (simplest CSS fix)
5. `css` — CSS override (most common detail fix)
6. `content` — text or image src differences (flag only, do not auto-fix)

**Why responsive-first:** If the section height is wrong, text overlay positioning is wrong,
and overflow behavior is wrong, then fixing font-weight or letter-spacing is wasted effort.
Lock in the responsive skeleton first, then tune the details.

## Step 4.3: Settings and App Integration Comparison (Behavior-First)

CSS extraction catches style differences but misses **structural/layout differences caused by
template JSON settings** and **app integrations present on live but missing on dev**. A section
can have pixel-perfect typography but completely wrong layout because the image gallery is a grid
instead of a slideshow, or missing star ratings because the app embed isn't enabled.

This step uses **behavior-first comparison**: run the same probe on both live and dev sites,
compare the results directly. This is theme-agnostic. It does not matter what the settings are
called in each theme's schema. What matters is what actually renders.

### Prerequisites

**Dev server must be running.** This step probes both live and dev sites. If the dev server is
not running or the dev URL is unreachable, **stop and report an error**. Do NOT silently skip
this step. A comparison with only one side produces false results (zero variances when there
should be many).

Before running the probe, verify both sites respond:
1. Navigate to the live URL and confirm the section loads
2. Navigate to the dev URL and confirm the section loads
3. If either fails, report which site is unreachable and stop Step 4.3

### App detection: site-inventory.json cross-reference

Before running the browser probe, check for known apps on the store:

1. **Primary source**: Read `.theme-forge/site-inventory.json` (created during onboard). Look for
   the `apps` or `app_embeds` array. This tells you exactly which apps are installed on the store
   and what selectors/elements they inject.
2. **Fallback**: If `site-inventory.json` does not exist or has no app data, fall back to the
   hardcoded selector list in the probe below. The hardcoded list covers common apps but will
   miss less common ones.

When site-inventory.json is available, add its app selectors to the probe dynamically. This
catches apps that the hardcoded list doesn't know about.

### The combined probe

Run this **single** `browser.evaluate()` call on both the live site AND the dev site. One
round-trip per site, returning settings behavior + app integrations in one response.

```javascript
((sectionSelector, knownApps) => {
  const section = document.querySelector(sectionSelector);
  if (!section) return JSON.stringify({ error: 'Section not found', selector: sectionSelector });
  const sr = section.getBoundingClientRect();

  // --- SETTINGS BEHAVIOR ---

  // Image gallery analysis
  const images = section.querySelectorAll('img');
  const visibleImages = [...images].filter(img => {
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < sr.bottom && r.bottom > sr.top;
  });
  const firstRowY = visibleImages[0]?.getBoundingClientRect()?.top;
  const firstRowImages = visibleImages.filter(img =>
    Math.abs(img.getBoundingClientRect().top - firstRowY) < 10
  );

  // Slideshow detection
  const hasSlider = !!section.querySelector('[class*="slider"], [class*="swiper"], [class*="carousel"], [class*="flickity"]');
  const hasDots = !!section.querySelector('[class*="dot"], [class*="pagination"], [class*="indicator"]');
  const hasArrows = !!section.querySelector('[class*="arrow"], [class*="prev"], [class*="next"]');

  // Product grid analysis
  const productCards = section.querySelectorAll('[class*="product-card"], [class*="product-item"], .card');
  const firstProductRow = productCards.length > 0 ? [...productCards].filter(card =>
    Math.abs(card.getBoundingClientRect().top - productCards[0].getBoundingClientRect().top) < 10
  ).length : 0;

  // Media position (left/right of details)
  const mediaEl = section.querySelector('[class*="media"], [class*="gallery"], [class*="product__media"]');
  const detailsEl = section.querySelector('[class*="product__info"], [class*="product-info"], [class*="details"]');
  let mediaPosition = 'unknown';
  if (mediaEl && detailsEl) {
    const mr = mediaEl.getBoundingClientRect();
    const dr = detailsEl.getBoundingClientRect();
    mediaPosition = mr.left < dr.left ? 'left' : mr.left > dr.left ? 'right' : 'stacked';
  }

  const settings = {
    visible_images: visibleImages.length,
    images_in_first_row: firstRowImages.length,
    has_slider: hasSlider,
    has_dots: hasDots,
    has_arrows: hasArrows,
    product_cards: productCards.length,
    products_per_row: firstProductRow,
    section_width: Math.round(sr.width),
    media_position: mediaPosition,
    section_height: Math.round(sr.height)
  };

  // --- APP INTEGRATION DETECTION (two-pass) ---

  const matchedElements = new Set();

  function captureElement(el) {
    return {
      tagName: el.tagName?.toLowerCase(),
      className: el.className?.toString()?.substring(0, 80) || null,
      id: el.id || null,
      dataAttrs: [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name).slice(0, 5)
    };
  }

  function detectApps(root, scope) {
    const apps = [];

    // Order matters for deduplication. Each detector excludes already-matched elements.

    // Star ratings (Okendo, Yotpo, Judge.me, Stamped, Loox)
    const ratingSelectors = '[class*="okendo"], [class*="yotpo"], [class*="jdgm"], [class*="stamped"], [class*="loox"], [data-oke-widget], [data-yotpo]';
    const rating = root.querySelector(ratingSelectors);
    if (rating && !matchedElements.has(rating)) {
      matchedElements.add(rating);
      apps.push({ app: 'reviews', element: captureElement(rating), visible: rating.getBoundingClientRect().height > 0, scope });
    }

    // Payment installments (Shop Pay, Afterpay, Klarna, Affirm)
    const installment = root.querySelector('[class*="afterpay"], [class*="klarna"], [class*="affirm"], shopify-payment-terms, [class*="payment-terms"]');
    if (installment && !matchedElements.has(installment)) {
      matchedElements.add(installment);
      apps.push({ app: 'payment_terms', element: captureElement(installment), visible: installment.getBoundingClientRect().height > 0, scope });
    }

    // Wishlist (Wishlist Plus, Wishlist King, etc.)
    const wish = root.querySelector('[class*="wishlist"], [class*="wish-"], [data-wk-button], .swym-button');
    if (wish && !matchedElements.has(wish)) {
      matchedElements.add(wish);
      apps.push({ app: 'wishlist', element: captureElement(wish), visible: wish.getBoundingClientRect().height > 0, scope });
    }

    // Loyalty / Rewards (Smile.io, LoyaltyLion, Yotpo Loyalty — excluding Okendo selectors to prevent overlap)
    const loyalty = root.querySelector('[class*="smile-"], [class*="loyaltylion"], [class*="swell-"]');
    if (loyalty && !matchedElements.has(loyalty)) {
      matchedElements.add(loyalty);
      apps.push({ app: 'loyalty', element: captureElement(loyalty), visible: loyalty.getBoundingClientRect().height > 0, scope });
    }

    // Size guides / fit finders
    const sizeGuide = root.querySelector('[class*="size-guide"], [class*="fit-finder"], [data-kiwi]');
    if (sizeGuide && !matchedElements.has(sizeGuide)) {
      matchedElements.add(sizeGuide);
      apps.push({ app: 'size_guide', element: captureElement(sizeGuide), visible: sizeGuide.getBoundingClientRect().height > 0, scope });
    }

    // Dynamic apps from site-inventory.json (if provided)
    if (knownApps && Array.isArray(knownApps)) {
      for (const ka of knownApps) {
        if (!ka.selector) continue;
        const el = root.querySelector(ka.selector);
        if (el && !matchedElements.has(el)) {
          matchedElements.add(el);
          apps.push({ app: ka.name || 'unknown_app', element: captureElement(el), visible: el.getBoundingClientRect().height > 0, scope });
        }
      }
    }

    return apps;
  }

  // Pass 1: inside section container
  const sectionApps = detectApps(section, 'section');

  // Pass 2: page-level elements near the section's bounding box
  // Some apps inject widgets as siblings after the section element, not inside it.
  const pageApps = [];
  const allAppSelectors = '[class*="okendo"], [class*="yotpo"], [class*="jdgm"], [class*="stamped"], [class*="loox"], [data-oke-widget], [data-yotpo], [class*="afterpay"], [class*="klarna"], [class*="affirm"], shopify-payment-terms, [class*="payment-terms"], [class*="wishlist"], [class*="wish-"], [data-wk-button], .swym-button, [class*="smile-"], [class*="loyaltylion"], [class*="swell-"], [class*="size-guide"], [class*="fit-finder"], [data-kiwi]';
  document.querySelectorAll(allAppSelectors).forEach(el => {
    if (matchedElements.has(el)) return; // already found in section
    if (section.contains(el)) return; // inside section, already checked
    const er = el.getBoundingClientRect();
    // "Near" = within 200px vertically of the section
    if (Math.abs(er.top - sr.bottom) < 200 || Math.abs(er.bottom - sr.top) < 200 ||
        (er.top >= sr.top && er.bottom <= sr.bottom)) {
      matchedElements.add(el);
      const appType = el.matches('[class*="okendo"], [class*="yotpo"], [class*="jdgm"], [data-oke-widget], [data-yotpo]') ? 'reviews' :
                      el.matches('[class*="afterpay"], [class*="klarna"], shopify-payment-terms, [class*="payment-terms"]') ? 'payment_terms' :
                      el.matches('[class*="wishlist"], [class*="wish-"], .swym-button') ? 'wishlist' :
                      el.matches('[class*="smile-"], [class*="loyaltylion"]') ? 'loyalty' :
                      'unknown_app';
      pageApps.push({ app: appType, element: captureElement(el), visible: er.height > 0, scope: 'page_level' });
    }
  });

  return JSON.stringify({ settings, apps: [...sectionApps, ...pageApps] });
})('SECTION_SELECTOR', KNOWN_APPS_ARRAY_OR_NULL)
```

Replace `SECTION_SELECTOR` with the section's verified CSS selector. Replace
`KNOWN_APPS_ARRAY_OR_NULL` with the array from `site-inventory.json` (or `null` if unavailable).

### Compare probe results

Run the probe on **both sites**. Compare the results field by field.

**Settings comparison**: For each key in the `settings` object, compare `live.settings[key]` vs
`dev.settings[key]`. Create a variance for any mismatch. The probe results are the detector.
Template JSON (`templates/{page}.json`) and `settings_data.json` inform the `fix_hint` only.

| Probe field | What it reveals | Example mismatch |
|-------------|----------------|-----------------|
| `visible_images` | Image gallery layout | live: 1 (slideshow), dev: 4 (grid) |
| `images_in_first_row` | Column count | live: 1, dev: 2 |
| `has_slider` + `has_dots` + `has_arrows` | Navigation controls | live: slider with dots, dev: static grid |
| `products_per_row` | Product grid density | live: 4, dev: 3 |
| `media_position` | Media left/right/stacked | live: left, dev: right |
| `section_width` | Full-width vs contained | live: 1440, dev: 1200 |

**App comparison**: For each app in `live.apps`, check if the same `app` type exists in
`dev.apps` with `visible: true`. If an app is on live but missing or invisible on dev, create
a variance.

### Create variances for mismatches

**Settings variance example** (note: ID follows the standard `{element}:{property}:{breakpoint}` format):

```json
{
  "id": "product-media-gallery:media_presentation:desktop",
  "element": "product-media-gallery",
  "property": "media_presentation",
  "breakpoints": ["desktop"],
  "live_value": "slideshow (1 visible, has dots/arrows)",
  "dev_value": "grid (4 visible in 2x2)",
  "type": "setting",
  "status": "open",
  "test": {
    "selector": null,
    "property": null,
    "expected": null,
    "js": "(() => { const s = document.querySelector('SECTION_SELECTOR'); const r = JSON.parse(/* run combined probe */); return JSON.stringify({ visible_images: r.settings.visible_images, has_slider: r.settings.has_slider, has_dots: r.settings.has_dots, has_arrows: r.settings.has_arrows }); })()",
    "expected_js": "{\"visible_images\":1,\"has_slider\":true,\"has_dots\":true,\"has_arrows\":true}",
    "confidence": "high"
  },
  "fix_hint": "Check media_presentation, media_columns, thumbnail_position in templates/{page}.json and config/settings_data.json. The probe on both sites shows the behavioral difference. settings_data.json overrides template defaults.",
  "source": "settings_comparison"
}
```

**Key points about settings variances:**
- The `test` condition verifies **multiple behavioral signals**, not just one scalar. A settings
  variance is PASS only when all relevant probe fields match.
- The `fix_hint` references `templates/{page}.json` (substitute the actual page) AND
  `config/settings_data.json`. settings_data.json overrides template defaults and is the
  source of truth for what's actually rendering. The probe detected the mismatch; the JSON
  files tell you which settings to change.
- CSS variances don't need `fix_hint` because the fix is always a CSS override.

**App variance example** (note: check per-breakpoint visibility, only include breakpoints where
the app is actually visible on live):

```json
{
  "id": "okendo-reviews-widget:app_integration:desktop",
  "element": {
    "tagName": "div",
    "className": "okendo-reviews-widget",
    "id": null,
    "dataAttrs": ["data-oke-widget"]
  },
  "property": "app_integration",
  "breakpoints": ["desktop", "tablet"],
  "live_value": "visible (Okendo star rating)",
  "dev_value": "missing",
  "type": "structural",
  "status": "open",
  "test": {
    "js": "(() => { const s = document.querySelector('SECTION_SELECTOR'); const el = s?.querySelector('[data-oke-widget], [class*=\"okendo\"]') || document.querySelector('[data-oke-widget], [class*=\"okendo\"]'); return el && el.getBoundingClientRect().height > 0 ? 'visible' : 'missing'; })()",
    "expected_js": "visible",
    "confidence": "high"
  },
  "fix_hint": "Enable app embed in target theme. Check .theme-forge/base-cache/config/settings_data.json for Okendo embed block. See pull-section hard rule: App integrations must be migrated, not parked.",
  "source": "app_detection"
}
```

**Key points about app variances:**
- The `breakpoints` array must only include breakpoints where the app is **actually visible on
  the live site**. Run the probe at each breakpoint. If a wishlist button is hidden on mobile,
  don't include "mobile" in breakpoints.
- The `element` field is a **structured object** (`{ tagName, className, id, dataAttrs }`), not
  a raw string. This lets downstream skills build selectors from any of these fields.
- The `test` condition checks both the section and page-level (fallback) to catch apps injected
  outside the section container.
- These are **`structural` variances, not cutover items**. They block section completion just like
  a missing heading or broken layout.

### Merge rules for settings and app variances

Settings and app variances follow the same merge contract as CSS variances (Step 4.2):

- **Match by stable ID** (`{element}:{property}:{breakpoint}`).
- **Re-extraction**: Re-run the combined probe. If live and dev now match for a setting, set
  `status: "fixed"`. If an app is now visible on dev, set `status: "fixed"`.
- **Stale entries**: If a settings/app variance from a prior run is not found in the new probe
  results (e.g., the app was removed from live), set `stale: true`.
- `source` is preserved on merge. A variance with `source: "settings_comparison"` stays
  `settings_comparison` even after re-extraction updates its values.

## Step 4.5: Multi-Resolution Probe (Layout Variances Only)

**Skip this step if** no layout variances were found in Step 4.

When layout variances exist (height, width, or bounding box differences), run a **multi-resolution
probe** on the live site to empirically determine how sizing properties respond to viewport changes.
This corroborates the Height Mechanism Extraction (source CSS inspection) and catches cases where
`document.styleSheets` is inaccessible (cross-origin stylesheets).

**Two-axis probe: width sweep + height sweep.** A single-axis probe that only varies width
cannot distinguish `fixed` from `viewport-height`. An element using `60vh` shows the same height
at 1024w, 1440w, and 1920w if the viewport height never changes. You need both axes.

**Width sweep (same height, vary width):**
- 1024 × 900
- 1440 × 900
- 1920 × 900

**Height sweep (same width, vary height):**
- 1440 × 600
- 1440 × 900
- 1440 × 1200

For each layout variance element, extract the bounding box at all six viewports:

```javascript
((selector, viewportWidth, viewportHeight) => {
  const el = document.querySelector(selector);
  if (!el) return JSON.stringify({ error: 'not found' });
  const rect = el.getBoundingClientRect();
  return JSON.stringify({
    selector: selector,
    viewport_width: viewportWidth,
    viewport_height: viewportHeight,
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
})('ELEMENT_SELECTOR', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
```

**Analyze probe results using both sweeps** to classify responsive behavior:

```
MULTI-RESOLUTION PROBE: section.hero

Width sweep (height locked at 900):
  1024×900 → height: 389px (w-ratio: 0.380)
  1440×900 → height: 547px (w-ratio: 0.380)
  1920×900 → height: 730px (w-ratio: 0.380)
  → Constant w-ratio: 0.380 — height tracks viewport width

Height sweep (width locked at 1440):
  1440×600 → height: 547px
  1440×900 → height: 547px
  1440×1200 → height: 547px
  → Constant height across viewport heights — NOT vh-based

→ CONFIRMED: width-relative (scales with width, ignores height)
```

Example of a `viewport-height` element:

```
Width sweep (height locked at 900):
  1024×900 → height: 540px
  1440×900 → height: 540px
  1920×900 → height: 540px
  → Constant across widths — NOT width-relative

Height sweep (width locked at 1440):
  1440×600 → height: 360px (h-ratio: 0.600)
  1440×900 → height: 540px (h-ratio: 0.600)
  1440×1200 → height: 720px (h-ratio: 0.600)
  → Constant h-ratio: 0.600 — height tracks viewport height

→ CONFIRMED: viewport-height (60vh)
```

**Classification matrix (use both sweeps together):**

| Width sweep | Height sweep | Classification | Confidence |
|-------------|-------------|---------------|------------|
| w-ratio constant (±2%) | Height constant (±5px) | `width-relative` | high |
| Height constant (±5px) | h-ratio constant (±2%) | `viewport-height` | high |
| w-ratio constant (±2%) | h-ratio constant (±2%) | `mixed` (both axes) | medium, flag for manual review |
| Height constant (±5px) | Height constant (±5px) | `fixed` | high |
| Height varies, no pattern | Height varies, no pattern | `content-driven` | low (needs manual inspection) |

The old single-axis probe could not distinguish row 2 (`viewport-height`) from row 4 (`fixed`)
because both show constant height when only width varies. The height sweep resolves this.

**Store the probe data** on the variance entry:

```json
{
  "height_mechanism": {
    "responsive_type": "width-relative",
    "authored_rules": { "padding-top": { "value": "38%", "source": ".hero-banner" } },
    "computed_height_px": 547,
    "probe": {
      "width_sweep": {
        "1024x900": { "width": 1024, "height": 389 },
        "1440x900": { "width": 1440, "height": 547 },
        "1920x900": { "width": 1920, "height": 730 }
      },
      "height_sweep": {
        "1440x600": { "width": 1440, "height": 547 },
        "1440x900": { "width": 1440, "height": 547 },
        "1440x1200": { "width": 1440, "height": 547 }
      },
      "width_ratio_variance": 0.001,
      "height_ratio_variance": 0.0,
      "classification": "width-relative",
      "confidence": "high"
    }
  }
}
```

**Cross-check with source CSS inspection:** If the probe says `width-relative` but source CSS says
`viewport-height`, flag the disagreement. The probe is empirical evidence and wins in ambiguous cases.

**If the probe is the only data** (source CSS inspection failed due to cross-origin sheets), the
probe classification becomes the primary `responsive_type` with `confidence: "medium"` for
single-axis matches, `confidence: "high"` when both sweeps agree.

## Step 5: Write Results

Update the section report at `.theme-forge/reports/sections/{section-key}.json`:

```json
{
  "section_key": "product-information",
  "page": "product",
  "status": "in_progress",
  "variances": [ ... variance array ... ],
  "variances_found": 8,
  "variances_fixed": 0,
  "variances_remaining": 8,
  "live_cache": { ... },
  "live_cache_by_case": { ... },
  "find_variances_run": {
    "extracted_at": "2026-04-12T04:00:00Z",
    "live_url": "https://example.com/products/ring",
    "dev_url": "http://127.0.0.1:9292/products/ring",
    "breakpoints": ["desktop", "tablet", "mobile"],
    "case_scope": ["full_personalizer"],
    "shadow_dom_properties_discovered": 3
  }
}
```

`case_scope` is `null` for legacy (no-case) runs, an array of case keys in
case mode. Downstream skills (verify-section, refine-section) read this to
know which cells were just touched.

**Display the variance table.** Legacy (no case) runs omit the case column.
Case mode adds a Case column:

```
VARIANCE REPORT: {section-key}  (cases: full_personalizer)
════════════════════════════════════════════════════════════════════════════
#   Case                 Element          Property        Live    Dev    Type    Bp
1   full_personalizer    h1               fontWeight      200     700    setting D/T/M
2   full_personalizer    .price-money     fontWeight      300     500    css     D/T/M
3   full_personalizer    .add-to-cart     fontSize        13px    16px   css     D/T/M
════════════════════════════════════════════════════════════════════════════
TOTAL: 3 variances in case full_personalizer (1 setting, 2 css)
Shadow DOM properties discovered: 3
Test conditions generated: 3/3
════════════════════════════════════════════════════════════════════════════
```

For a legacy run (no case scoped), the output matches the pre-cases format:

```
VARIANCE REPORT: {section-key}
════════════════════════════════════════════════════════════
#   Element              Property         Live         Dev          Type     Breakpoints
1   h1                   fontWeight       200          700          setting  D/T/M
...
════════════════════════════════════════════════════════════
```

## Step 6: Add User Variance (`--add`)

When invoked with `--add "description"`:

1. **Parse the description** for hints about element and property
2. **Ask for details** via AskUserQuestion:
   ```
   Adding a variance to {section-key}:
   Description: "{description}"

   A) I'll find the element — navigate dev site and inspect
   B) I know the selector — let me specify it
   ```

3. **If A:** Navigate to the dev site, help the user identify the element:
   - Run DOM inspection on the section
   - Present candidate elements
   - Ask user to confirm which element and what property

4. **If B:** Ask for selector, property, and expected value

5. **Generate test condition** from the user's input:
   - Verify the selector works on the dev site
   - Extract the current dev value
   - Set `source: "user"`, `confidence: "high"` (user-specified)

6. **Write to the section report** variances array with `source: "user"`

7. **Confirm:**
   ```
   Added variance: {element} {property} — expected {value}
   Test: getComputedStyle('{selector}').{property} === '{expected}'
   ```

## Extraction Script

The extraction script runs in the browser via `screenshot.sh eval`. It extracts computed styles for all significant elements in a section.

**Use the screenshot.sh eval command** to run JS in the browser at each breakpoint:

```bash
# Find the script
SS="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/screenshot.sh"
[ -x "$SS" ] || SS="$HOME/.claude/skills/theme-forge/scripts/screenshot.sh"

# Run extraction at each breakpoint (script handles viewport sizing)
RESULT=$("$SS" eval --url "<url>" --js "<extraction_script>" --breakpoint desktop)
RESULT_TABLET=$("$SS" eval --url "<url>" --js "<extraction_script>" --breakpoint tablet)
RESULT_MOBILE=$("$SS" eval --url "<url>" --js "<extraction_script>" --breakpoint mobile)
```

If the screenshot.sh script is unavailable, fall back to `playwright-cli eval` or gstack browse (`$B js`).

```javascript
(() => {
  // Deep query: traverse into Shadow DOM
  function dq(root, sel) {
    let r = root.querySelector(sel);
    if (r) return r;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { r = dq(el.shadowRoot, sel); if (r) return r; }
    }
    return null;
  }
  function dqAll(root, sel) {
    let results = [...root.querySelectorAll(sel)];
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { results = results.concat(dqAll(el.shadowRoot, sel)); }
    }
    return results;
  }

  // Find the section
  const section = document.querySelector('SECTION_SELECTOR');
  if (!section) return JSON.stringify({ error: 'Section not found' });
  const sectionRect = section.getBoundingClientRect();
  const scs = getComputedStyle(section);

  // Check if element is inside Shadow DOM
  function shadowInfo(el) {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot) {
      return { inShadow: true, hostTag: root.host.tagName.toLowerCase() };
    }
    return { inShadow: false, hostTag: null };
  }

  // Extract styles for a single element
  function extractEl(el, label) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const shadow = shadowInfo(el);
    return {
      label: label,
      tag: el.tagName.toLowerCase(),
      classes: el.className?.toString?.()?.substring(0, 80) || '',
      text: el.textContent?.trim()?.substring(0, 40) || null,
      shadow: shadow,
      styles: {
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        letterSpacing: cs.letterSpacing,
        lineHeight: cs.lineHeight,
        textAlign: cs.textAlign,
        textTransform: cs.textTransform,
        textDecoration: cs.textDecoration,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        padding: cs.padding,
        margin: cs.margin,
        borderRadius: cs.borderRadius,
        display: cs.display,
        flexDirection: cs.flexDirection,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        gap: cs.gap,
        width: cs.width,
        maxWidth: cs.maxWidth,
        height: cs.height,
        objectFit: cs.objectFit,
        objectPosition: cs.objectPosition,
        aspectRatio: cs.aspectRatio,
        overflow: cs.overflow,
        opacity: cs.opacity,
        textWrap: cs.textWrap
      },
      box: {
        x: Math.round(rect.x),
        relativeY: Math.round(rect.y - sectionRect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  // Section-level properties
  const sectionData = {
    label: 'section',
    tag: 'section',
    styles: {
      backgroundColor: scs.backgroundColor,
      color: scs.color,
      paddingTop: scs.paddingTop,
      paddingBottom: scs.paddingBottom
    },
    box: {
      width: Math.round(sectionRect.width),
      height: Math.round(sectionRect.height)
    }
  };

  // Find and extract all significant elements
  const elements = [sectionData];

  // Headings
  const headings = dqAll(section, 'h1,h2,h3,h4');
  headings.slice(0, 5).forEach((h, i) => elements.push(extractEl(h, 'heading-' + i)));

  // Body text
  const paragraphs = dqAll(section, 'p');
  paragraphs.slice(0, 5).forEach((p, i) => elements.push(extractEl(p, 'body-' + i)));

  // Buttons / links
  const buttons = dqAll(section, '.button,a[class*=button],button[type=submit],.shopify-payment-button');
  buttons.slice(0, 5).forEach((b, i) => elements.push(extractEl(b, 'button-' + i)));

  // Images
  const images = dqAll(section, 'img');
  images.slice(0, 10).forEach((img, i) => {
    const data = extractEl(img, 'image-' + i);
    data.src = img.src?.split('/').pop()?.split('?')[0] || '';
    data.alt = (img.alt || '').substring(0, 40);
    // Also extract container styles
    const parent = img.parentElement;
    if (parent) {
      const pcs = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      data.container = {
        width: Math.round(pr.width),
        height: Math.round(pr.height),
        objectFit: pcs.objectFit,
        overflow: pcs.overflow,
        aspectRatio: pcs.aspectRatio
      };
    }
    elements.push(data);
  });

  // Price elements (Shopify-specific)
  const prices = dqAll(section, '.price,price-money,.price-money,.price__regular');
  prices.slice(0, 3).forEach((p, i) => elements.push(extractEl(p, 'price-' + i)));

  // Form elements
  const forms = dqAll(section, 'form,fieldset,.product-form');
  forms.slice(0, 3).forEach((f, i) => elements.push(extractEl(f, 'form-' + i)));

  // Variant selectors
  const variants = dqAll(section, '[data-option-name],variant-selects,.variant-wrapper,.product-form__option');
  variants.slice(0, 5).forEach((v, i) => elements.push(extractEl(v, 'variant-' + i)));

  // Structural checks
  const structural = {
    liquidErrors: section.innerHTML.includes('Liquid error'),
    emptyCssValues: section.innerHTML.match(/rgb\(\s*\)|font-family:\s*,|border-width:\s*px/) !== null,
    placeholderImages: images.filter(img =>
      img.src?.includes('data:image/svg') && !img.src?.includes('spinner')
    ).length
  };

  return JSON.stringify({ elements, structural, sectionRect: { width: sectionRect.width, height: sectionRect.height } });
})()
```

Replace `SECTION_SELECTOR` with the actual selector before execution.

**For gstack browse:** Write the script to a temp file and execute via `$B js-file`, not inline. Long inline JS is corrupted by shell escaping.

## Shadow DOM Custom Property Discovery Script

Run this after the main extraction, for each element flagged as `inShadow: true`:

```javascript
((hostTag) => {
  const hosts = document.querySelectorAll(hostTag);
  const allProps = new Map(); // prop name → { values, selectors }

  for (const host of hosts) {
    const root = host.shadowRoot;
    if (!root) continue;

    // Check adopted stylesheets
    const sheets = [
      ...(root.adoptedStyleSheets || []),
      ...[...root.querySelectorAll('style')].map(s => s.sheet).filter(Boolean)
    ];

    for (const sheet of sheets) {
      try {
        for (const rule of sheet.cssRules) {
          // Find var(--xxx) usage — these are properties the component consumes
          const matches = rule.cssText.matchAll(/var\(--([^,)]+?)(?:\s*,\s*[^)]+)?\)/g);
          for (const m of matches) {
            const prop = '--' + m[1].trim();
            if (!allProps.has(prop)) allProps.set(prop, { selectors: [], count: 0 });
            allProps.get(prop).count++;
            if (rule.selectorText) allProps.get(prop).selectors.push(rule.selectorText);
          }
        }
      } catch (e) { /* cross-origin, skip */ }
    }
  }

  // Map custom properties to CSS property names
  const propMapping = {};
  for (const [prop, info] of allProps) {
    const name = prop.replace(/^--/, '');
    // Common patterns: --heading-font-weight → fontWeight, --button-bg → backgroundColor
    const cssProp = name
      .replace(/.*font-weight/, 'fontWeight')
      .replace(/.*font-size/, 'fontSize')
      .replace(/.*letter-spacing/, 'letterSpacing')
      .replace(/.*line-height/, 'lineHeight')
      .replace(/.*text-transform/, 'textTransform')
      .replace(/.*border-radius/, 'borderRadius')
      .replace(/.*padding/, 'padding')
      .replace(/.*color/, 'color')
      .replace(/.*bg/, 'backgroundColor');

    propMapping[prop] = {
      cssProperty: cssProp !== name ? cssProp : null,
      usageCount: info.count,
      sampleSelectors: info.selectors.slice(0, 3)
    };
  }

  return JSON.stringify({ hostTag, customProperties: propMapping, total: allProps.size });
})('HOST_TAG')
```

Replace `HOST_TAG` with the actual host element tag name.

**Confidence assignment for discovered properties:**
- Property name clearly maps to a CSS property (e.g., `--heading-font-weight`): `medium`
- Property name is ambiguous (e.g., `--spacing-1`): `low`
- Property was confirmed by a test correction learning: `high`
- Property was verified by a successful refine-section fix: `high` (update after fix)

## Height Mechanism Extraction

When a layout variance involves height (section height, container height, image container height),
`getComputedStyle()` only returns resolved pixel values. You cannot tell `padding-top: 38%` from
`padding-top: 547px` by reading computed styles alone. The **mechanism** matters because it determines
how the height responds to different viewport sizes.

**Run this script on the live site** after the main extraction, for each element with a height-related
layout variance. It inspects `document.styleSheets` and inline styles to find the authored CSS rule
controlling the height.

```javascript
((selector) => {
  const el = document.querySelector(selector);
  if (!el) return JSON.stringify({ error: 'Element not found: ' + selector });

  // Properties that control height
  const HEIGHT_PROPS = [
    'height', 'min-height', 'max-height',
    'padding-top', 'padding-bottom',
    'aspect-ratio'
  ];

  // 1. Check inline styles first (highest specificity)
  const inline = {};
  for (const prop of HEIGHT_PROPS) {
    const val = el.style.getPropertyValue(prop);
    if (val) inline[prop] = val;
  }

  // 2. Walk matched CSS rules from document.styleSheets
  const matched = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSStyleRule)) continue;
        try {
          if (!el.matches(rule.selectorText)) continue;
        } catch (e) { continue; }
        for (const prop of HEIGHT_PROPS) {
          const val = rule.style.getPropertyValue(prop);
          if (val) {
            matched.push({
              property: prop,
              value: val,
              selector: rule.selectorText,
              specificity: rule.selectorText.split(',')[0].trim()
            });
          }
        }
      }
    } catch (e) { /* cross-origin sheet, skip */ }
  }

  // 3. Determine the winning mechanism
  // Priority: inline > last matched rule (CSS cascade)
  const mechanism = {};
  for (const prop of HEIGHT_PROPS) {
    if (inline[prop]) {
      mechanism[prop] = { value: inline[prop], source: 'inline' };
    } else {
      // Last matching rule wins (simplified cascade, ignoring !important)
      const rules = matched.filter(m => m.property === prop);
      if (rules.length > 0) {
        const winner = rules[rules.length - 1];
        mechanism[prop] = { value: winner.value, source: winner.selector };
      }
    }
  }

  // 4. Classify the responsive behavior
  const computed = getComputedStyle(el);
  const computedHeight = parseFloat(computed.height);
  let responsive_type = 'fixed'; // default

  for (const [prop, info] of Object.entries(mechanism)) {
    const val = info.value;
    if (val.includes('%')) responsive_type = 'width-relative';
    else if (val.includes('vw')) responsive_type = 'viewport-width';
    else if (val.includes('vh') || val.includes('svh') || val.includes('dvh')) responsive_type = 'viewport-height';
    else if (val.includes('em') || val.includes('rem')) responsive_type = 'font-relative';
    else if (prop === 'aspect-ratio' && val !== 'auto') responsive_type = 'aspect-ratio';
  }

  return JSON.stringify({
    element: selector,
    computed_height: computedHeight,
    mechanism: mechanism,
    responsive_type: responsive_type,
    all_matched_rules: matched
  });
})('ELEMENT_SELECTOR')
```

Replace `ELEMENT_SELECTOR` with the actual element selector.

**Store the result** in the variance entry's `height_mechanism` field:

```json
{
  "height_mechanism": {
    "responsive_type": "width-relative",
    "authored_rules": {
      "padding-top": { "value": "38%", "source": ".hero-banner" }
    },
    "computed_height_px": 547
  }
}
```

**Responsive type classification:**

| `responsive_type` | Meaning | Authored value examples | Correct dev approach |
|-------------------|---------|------------------------|---------------------|
| `width-relative` | Height scales with container width | `padding-top: 38%`, `width: 50%` | Use `aspect-ratio` or `padding-top %` CSS override. Do NOT use `section_height_custom` (svh). |
| `viewport-width` | Height scales with viewport width | `height: 38vw`, `max-height: 50vw` | Use `vw`-based CSS override |
| `viewport-height` | Height scales with viewport height | `height: 60vh`, `min-height: 80svh` | Use `section_height_custom` or `vh`-based override |
| `aspect-ratio` | Height derived from intrinsic ratio | `aspect-ratio: 16/9` | Use `aspect-ratio` CSS override |
| `font-relative` | Height scales with font size | `height: 3em`, `padding: 2rem` | Use `em`/`rem` CSS override |
| `fixed` | Height is a fixed pixel value | `height: 500px` | Use `max-height` CSS override |

**refine-section uses this data** to choose the correct approach in Step 2.1. Instead of guessing
a number for `section_height_custom` (which produces `svh` units), it maps the mechanism directly.

### Worked Example: Hero Banner Height Bug

The live site uses `padding-top: 38%` on the hero banner container. This makes the banner height
38% of the container width, so at 1440px wide the banner is ~547px tall.

**Without height mechanism extraction** (the bug):
1. find-variances extracts `height: 547px` (computed value only)
2. refine-section sees "547px" and sets `section_height_custom: 38` (guessing from the number)
3. But `section_height_custom: 38` produces `--hero-min-height: 38svh` (38% of viewport HEIGHT)
4. At 1440x900: 38svh = 342px, not 547px. Wrong.
5. A `max-height: 38vw` band-aid is added, which conflicts with a global `min-height: 67vh` rule
6. `overflow: hidden` clips the text overlay. Text disappears.

**With height mechanism extraction** (the fix):
1. find-variances extracts `height: 547px` AND `height_mechanism: { responsive_type: "width-relative", authored_rules: { "padding-top": { "value": "38%", "source": ".hero-banner" } } }`
2. refine-section reads `responsive_type: "width-relative"` and knows NOT to use `section_height_custom`
3. Instead, it applies `aspect-ratio: 100/38` or `padding-top: 38%` as a CSS override
4. The height scales correctly with browser width at all viewport sizes

## Visual Visibility Check

After extracting computed styles, verify that text and interactive elements are actually **visible
to the user**, not just present in the DOM. An element can have correct computed styles while being
invisible due to overflow clipping, z-index occlusion, zero dimensions, or transparency.

**Run this script** on the dev site after each extraction. It checks every text element (headings,
paragraphs, buttons) found in the section:

```javascript
((sectionSelector) => {
  const section = document.querySelector(sectionSelector);
  if (!section) return JSON.stringify({ error: 'Section not found' });

  function isVisuallyVisible(el) {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);

    // 1. Element has dimensions
    if (rect.width === 0 || rect.height === 0) return { visible: false, reason: 'zero-size' };

    // 2. Element is not fully transparent
    if (cs.opacity === '0') return { visible: false, reason: 'opacity-zero' };
    if (cs.visibility === 'hidden') return { visible: false, reason: 'visibility-hidden' };
    if (cs.display === 'none') return { visible: false, reason: 'display-none' };

    // 3. Element is not clipped by ancestor overflow
    // Traverse up the DOM, crossing Shadow DOM boundaries
    let ancestor = el.parentElement;
    while (ancestor) {
      const acs = getComputedStyle(ancestor);
      if (acs.overflow === 'hidden' || acs.overflow === 'clip' ||
          acs.overflowX === 'hidden' || acs.overflowY === 'hidden') {
        const aRect = ancestor.getBoundingClientRect();
        if (rect.top >= aRect.bottom || rect.bottom <= aRect.top ||
            rect.left >= aRect.right || rect.right <= aRect.left) {
          return {
            visible: false,
            reason: 'clipped-by-overflow',
            clipping_ancestor: ancestor.tagName.toLowerCase() + '.' +
              (ancestor.className?.toString?.().split(' ')[0] || ''),
            ancestor_rect: { top: aRect.top, bottom: aRect.bottom, height: aRect.height },
            element_rect: { top: rect.top, bottom: rect.bottom, height: rect.height }
          };
        }
      }
      // Cross Shadow DOM boundary if needed
      if (!ancestor.parentElement) {
        const root = ancestor.getRootNode();
        if (root instanceof ShadowRoot) {
          ancestor = root.host;
          continue;
        }
      }
      ancestor = ancestor.parentElement;
    }

    // 4. Element has non-transparent color (text is readable)
    const color = cs.color;
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match && match[4] !== undefined && parseFloat(match[4]) === 0) {
      return { visible: false, reason: 'transparent-color' };
    }

    return { visible: true, reason: null };
  }

  // Check all text elements in the section
  const textSelectors = 'h1,h2,h3,h4,h5,h6,p,a,button,span,[class*="text"]';
  const elements = section.querySelectorAll(textSelectors);
  const results = [];

  for (const el of elements) {
    // Skip empty elements
    if (!el.textContent?.trim()) continue;

    const vis = isVisuallyVisible(el);
    if (!vis.visible) {
      results.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim().substring(0, 40),
        classes: el.className?.toString?.().substring(0, 60) || '',
        ...vis
      });
    }
  }

  return JSON.stringify({
    section: sectionSelector,
    invisible_elements: results,
    total_text_elements: elements.length,
    total_invisible: results.length
  });
})('SECTION_SELECTOR')
```

Replace `SECTION_SELECTOR` with the actual section selector.

**If any text elements are invisible**, create a variance entry with:
- `type: "visibility"`
- `property: "visibility"`
- `status: "open"`
- `source: "extraction"`
- The `test` field uses a custom JS assertion:

```json
{
  "id": "h1:visibility:desktop",
  "element": "h1 (About Our Jewelry)",
  "property": "visibility",
  "type": "visibility",
  "status": "open",
  "live_value": "visible",
  "dev_value": "clipped-by-overflow (.hero, overflow:hidden)",
  "test": {
    "js": "(() => { const el = document.querySelector('SECTION h1'); if (!el) return 'missing'; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (r.width === 0 || r.height === 0) return 'zero-size'; if (cs.opacity === '0' || cs.visibility === 'hidden') return 'hidden'; let a = el.parentElement; while (a) { const acs = getComputedStyle(a); if (acs.overflow === 'hidden') { const ar = a.getBoundingClientRect(); if (r.top >= ar.bottom || r.bottom <= ar.top) return 'clipped'; } a = a.parentElement; } return 'visible'; })()",
    "expected_js": "visible",
    "confidence": "high"
  }
}
```

**This is a hard gate.** If the live site shows visible text but the dev site shows the same text
as invisible (clipped, zero-size, hidden), this variance takes priority over all CSS property
variances. There is no point fixing font-weight if the user can't see the text at all.

### Worked Example: Hero Banner Text Clipped by Overflow

The live site shows "About Our Jewelry" overlaid on the hero image. After refine-section
added `overflow: hidden` to constrain the hero height, the text overlay was clipped because
the text content extended below the overflow boundary.

**Without visibility check** (the bug):
1. find-variances extracts `h1 { fontSize: 56px, fontWeight: 200, color: rgb(242,242,242) }` — all correct
2. refine-section confirms PASS for font-size, font-weight, color
3. The delta table shows all green. "0 variances remaining."
4. But the h1 is completely invisible because its bounding box is below the `.hero` element's
   `overflow: hidden` clip boundary
5. The user sees a broken page. The algorithm thinks it's perfect.

**With visibility check** (the fix):
1. find-variances extracts computed styles AND runs the visibility check
2. Visibility check finds: `h1 "About Our Jewelry" — clipped-by-overflow (.hero, overflow:hidden)`
3. A variance is created: `h1:visibility:desktop — visible vs clipped-by-overflow`
4. This variance blocks the section from being marked complete
5. refine-section must fix the overflow issue before any property variances can PASS

## Rendered Output Validation

In addition to computed style comparison, check for structural issues:

| # | Check | Variance type | How |
|---|-------|--------------|-----|
| 1 | Background color | css | `getComputedStyle(section).backgroundColor` differs |
| 2 | Foreground color | css | `getComputedStyle(section).color` differs |
| 3 | Light/dark polarity | css | Sum RGB of bg: >384=light, <384=dark. Polarity flipped |
| 4 | Font family | css | `getComputedStyle(heading).fontFamily` differs |
| 5 | Font weight (headings) | css/setting | Weight differs by >100 |
| 6 | Font size (body) | css | Differs by >1px |
| 7 | Letter spacing | css | Differs by >0.5px |
| 8 | Section padding | css | Differs by >8px |
| 9 | Content alignment | css | text-align or flex alignment differs |
| 10 | Button classes | css | Wrong variant (primary vs secondary) |
| 11 | Overlay opacity | css | Differs by >0.05 |
| 12 | Liquid errors | structural | `section.innerHTML.includes('Liquid error')` |
| 13 | Empty CSS values | structural | `rgb()`, `font-family: , ;`, `border-width: px` |
| 14 | Placeholder images | structural | SVG data URIs where real images expected |
| 15 | Section height | layout | Differs by >20% |
| 16 | Element bounding boxes | layout | x, width, or height differs by >2px |
| 17 | Image container size | layout | Container width or height differs by >2px |
| 18 | Image sizing properties | layout | Different object-fit, object-position, or aspect-ratio |
| 19 | Text visibility | visibility | Text element visible on live but invisible on dev (clipped, hidden, zero-size). **Hard gate** — blocks section completion. |
| 20 | Height mechanism | layout | Section/container height differs AND uses responsive units (%, vw, vh). Extract authored CSS mechanism. |

Each failing check creates a variance entry in the array. Structural checks (12-14) get `type: "structural"` and a test condition with a custom JS assertion. Visibility check (19) gets `type: "visibility"` and takes priority over all other variance types (hard gate). Height mechanism check (20) stores the `height_mechanism` field on the variance entry.
