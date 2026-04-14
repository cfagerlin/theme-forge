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
/theme-forge find-variances <section-key> [--page <page>] [--force] [--add "description"]
```

- `section-key` — e.g., `product-information`, `header`, `hero-1`
- `--page` — the template page (e.g., `product`, `index`). Defaults to the page in the section report.
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
- **Re-extraction merges with existing variance entries.** Stable IDs based on `{element}:{property}:{breakpoint}` match old and new entries. Existing `attempts`, `user_approved`, and `source: "user"` entries are preserved. New differences are added. Fixed variances are auto-detected (dev now matches live). Entries not seen in re-extraction are flagged `"stale": true`, not deleted.

### Test conditions are structured
- **Every variance gets a structured test condition.** Format: `{selector, property, expected}`. Optional `js` field for custom assertions. refine-section executes these directly — it does not improvise verification.

### Live extraction is cached
- **Live site values are cached** in `.theme-forge/reports/sections/{section-key}.json` under `live_cache`. The cache key includes: URL path, section selector, and extraction timestamp. Cache is valid for the duration of a migration session. `--force` bypasses the cache.

## Variance Schema

Each entry in the `variances` array:

```json
{
  "id": "h1:fontWeight:desktop",
  "element": "h1.product-title",
  "property": "fontWeight",
  "breakpoints": ["desktop", "tablet", "mobile"],
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
- `id` — stable identifier: `{element_tag}:{property}:{breakpoint}` (or `{element_tag}.{class}:{property}:{breakpoint}` for disambiguation)
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

1. Read `.theme-forge/config.json` for `live_url`, `dev_url`, and `dev_store`.
2. Resolve section selector:
   - Read `.theme-forge/mappings/sections/{section-key}.json` for the section's CSS selector on both live and dev sites
   - If no mapping, use `#shopify-section-{section-key}` as default
3. Resolve page URL path:
   - If `--page` is provided, use the default page path for that template (e.g., `product` → `/products/{first-product-handle}`)
   - Otherwise read from the section report
4. Read existing section report at `.theme-forge/reports/sections/{section-key}.json`:
   - If it has a `variances` array, load it (for merge)
   - If it has `live_cache`, check freshness (see Step 2)
5. Read ALL files in `.theme-forge/learnings/` for test correction learnings that apply.

### `--add` mode

If `--add "description"` was passed, skip extraction and go to Step 6 (Add User Variance).

## Step 2: Extract Live Site Styles

**Check cache first** (unless `--force`):
- If `live_cache` exists in the section report AND `live_cache.url_path` matches the current page path AND `live_cache.section_selector` matches: use cached values. Skip to Step 3.
- Otherwise, extract fresh.

**Extract at each breakpoint** (desktop 1280px, tablet 768px, mobile 375px):

1. Navigate to the live URL + page path
2. Scroll to the section
3. Dismiss popups (live site only)
4. Wait for lazy content (3 seconds)
5. Run the extraction script (see Extraction Script below)
6. Resize viewport and repeat for next breakpoint

**Write cache** to the section report:
```json
{
  "live_cache": {
    "url_path": "/products/kindred-birthstone-necklace",
    "section_selector": "#shopify-section-product-information",
    "extracted_at": "2026-04-12T04:00:00Z",
    "desktop": { ... extracted values ... },
    "tablet": { ... extracted values ... },
    "mobile": { ... extracted values ... }
  }
}
```

## Step 3: Extract Dev Site Styles + Shadow DOM Discovery

Extract from the dev site at each breakpoint, using the same page path as live.

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

For each breakpoint (desktop, tablet, mobile), compare every extracted property between live and dev:

1. **Match elements** by tag + role (heading, body, button, image, container, etc.)
2. **Compare each property** — if values differ, create a variance entry
3. **Classify type:**
   - `visibility` — text element visible on live but invisible on dev (clipped, hidden, zero-size). Hard gate.
   - `structural` — element exists on live but not dev, or vice versa
   - `setting` — check if the property is controlled by a JSON setting (read section schema)
   - `css` — needs CSS override
   - `layout` — bounding box differences (width, height, position)
   - `content` — text or image src differences (flag only, do not auto-fix)
4. **Generate test condition:**
   - Use the element's verified selector from extraction
   - If Shadow DOM was detected, set `shadow_host` and `custom_property`
   - Apply any test correction learnings
   - Set confidence based on how the selector was discovered
5. **Merge with existing variances** (if re-extraction):
   - Match by stable ID (`{element}:{property}:{breakpoint}`)
   - Existing entry found: update `live_value`, `dev_value`. If dev now matches live, set `status: "fixed"`. Preserve `attempts`, `user_approved`, `source`.
   - No existing entry: add as new with `status: "open"`, `source: "extraction"`
   - Existing entry not in extraction: set `stale: true`

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

## Step 4.3: Settings-Level Comparison (Template JSON)

CSS extraction catches style differences but misses **structural/layout differences caused by
template JSON settings**. A section can have pixel-perfect typography but completely wrong layout
because `media_presentation: "grid"` when the live site uses a slideshow, or `columns: 2` when
the live site shows 4.

This step compares the target theme's template settings against the live site's observed behavior
to catch settings-level mismatches that CSS extraction cannot detect.

### What to compare

Read the target section's template JSON settings from `templates/{page}.json`. For each setting
that controls layout or presentation (not content or typography), compare the configured value
against what the live site actually renders.

**Layout/presentation settings to check:**

| Setting pattern | What it controls | How to verify against live |
|----------------|-----------------|--------------------------|
| `media_presentation` | Image gallery layout (grid, slideshow, thumbnails) | Count visible images and arrangement on live |
| `media_columns` / `columns` | Number of columns | Count columns in the rendered grid on live |
| `layout_type` | Grid vs list vs carousel | Observe scroll/pagination behavior on live |
| `content_direction` / `flex_direction` | Row vs column stacking | Check element flow direction on live |
| `desktop_media_position` | Media left/right of details | Check visual position on live |
| `large_first_image` | Hero image sizing | Check if first image is larger on live |
| `equal_columns` | Even vs weighted column split | Measure column widths on live |
| `stacking` / `vertical_on_mobile` | Mobile layout behavior | Check mobile breakpoint layout on live |
| `slideshow_*` / `carousel_*` | Navigation controls, autoplay | Check for dots/arrows/autoplay on live |
| `max_products` / `products_per_row` | Product grid density | Count products per row on live |
| `show_*` / `hide_*` / `enable_*` | Feature toggles | Check if feature is visible on live |
| `section_width` | Page-width vs full-width | Measure section width relative to viewport |
| `gap` / `columns_gap` / `rows_gap` | Spacing between items | Measure spacing on live |
| `aspect_ratio` / `image_ratio` | Image proportions | Compare image aspect ratios on live |
| `media_fit` | contain vs cover | Check if images are cropped or letterboxed |

### How to verify

For each layout setting, run a quick JS check on the live site to determine the actual behavior:

```javascript
((sectionSelector) => {
  const section = document.querySelector(sectionSelector);
  if (!section) return JSON.stringify({ error: 'Section not found' });

  // Image gallery analysis
  const images = section.querySelectorAll('img');
  const imageContainers = section.querySelectorAll('[class*="media"], [class*="gallery"], [class*="slider"]');
  const visibleImages = [...images].filter(img => {
    const r = img.getBoundingClientRect();
    const sr = section.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < sr.bottom && r.bottom > sr.top;
  });

  // Grid/column analysis
  const firstRowY = visibleImages[0]?.getBoundingClientRect()?.top;
  const firstRowImages = visibleImages.filter(img =>
    Math.abs(img.getBoundingClientRect().top - firstRowY) < 10
  );

  // Slideshow detection
  const hasSlider = !!section.querySelector('[class*="slider"], [class*="swiper"], [class*="carousel"], [class*="flickity"]');
  const hasDots = !!section.querySelector('[class*="dot"], [class*="pagination"], [class*="indicator"]');
  const hasArrows = !!section.querySelector('[class*="arrow"], [class*="prev"], [class*="next"]');

  // Product grid analysis (for collection sections)
  const productCards = section.querySelectorAll('[class*="product-card"], [class*="product-item"], .card');
  const firstProductRow = productCards.length > 0 ? [...productCards].filter(card =>
    Math.abs(card.getBoundingClientRect().top - productCards[0].getBoundingClientRect().top) < 10
  ).length : 0;

  return JSON.stringify({
    total_images: images.length,
    visible_images: visibleImages.length,
    images_in_first_row: firstRowImages.length,
    has_slider: hasSlider,
    has_dots: hasDots,
    has_arrows: hasArrows,
    product_cards: productCards.length,
    products_per_row: firstProductRow,
    section_width: Math.round(section.getBoundingClientRect().width)
  });
})('SECTION_SELECTOR')
```

### Create variances for settings mismatches

Compare the JS probe results against the template JSON settings. Create a variance for each mismatch:

```json
{
  "id": "media_presentation:setting:desktop",
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
    "js": "(() => { const s = document.querySelector('SECTION_SELECTOR'); const imgs = [...s.querySelectorAll('img')].filter(i => { const r = i.getBoundingClientRect(); const sr = s.getBoundingClientRect(); return r.width > 50 && r.height > 50 && r.top < sr.bottom && r.bottom > sr.top; }); return imgs.length; })()",
    "expected_js": "1",
    "confidence": "high"
  },
  "fix_hint": "Change media_presentation in templates/product.json. Check media_columns, thumbnail_position, slideshow_controls_style.",
  "source": "settings_comparison"
}
```

The `fix_hint` field tells pull-section/refine-section which JSON settings to change. This is unique
to settings variances — CSS variances don't need hints because the fix is always a CSS override.

### App integration detection

While inspecting the live site, also check for app-rendered elements that should exist on dev:

```javascript
((sectionSelector) => {
  const section = document.querySelector(sectionSelector);
  if (!section) return JSON.stringify({ error: 'Section not found' });

  const apps = [];

  // Star ratings (Okendo, Yotpo, Judge.me, Stamped, Loox)
  const ratings = section.querySelector('[class*="okendo"], [class*="yotpo"], [class*="jdgm"], [class*="stamped"], [class*="loox"], [data-oke-widget], [data-yotpo]');
  if (ratings) apps.push({ app: 'reviews', element: ratings.className?.toString()?.substring(0, 60), visible: ratings.getBoundingClientRect().height > 0 });

  // Payment installments (Shop Pay, Afterpay, Klarna, Affirm)
  const installments = section.querySelector('[class*="afterpay"], [class*="klarna"], [class*="affirm"], shopify-payment-terms, [class*="payment-terms"]');
  if (installments) apps.push({ app: 'payment_terms', element: installments.tagName, visible: installments.getBoundingClientRect().height > 0 });

  // Wishlist (Wishlist Plus, Wishlist King, etc.)
  const wishlist = section.querySelector('[class*="wishlist"], [class*="wish-"], [data-wk-button], .swym-button');
  if (wishlist) apps.push({ app: 'wishlist', element: wishlist.className?.toString()?.substring(0, 60), visible: wishlist.getBoundingClientRect().height > 0 });

  // Loyalty / Rewards (Smile.io, LoyaltyLion, Yotpo Loyalty)
  const loyalty = section.querySelector('[class*="smile-"], [class*="loyaltylion"], [class*="swell-"], [id*="oke-widget"]');
  if (loyalty) apps.push({ app: 'loyalty', element: loyalty.className?.toString()?.substring(0, 60) || loyalty.id, visible: loyalty.getBoundingClientRect().height > 0 });

  // Size guides / fit finders
  const sizeGuide = section.querySelector('[class*="size-guide"], [class*="fit-finder"], [data-kiwi]');
  if (sizeGuide) apps.push({ app: 'size_guide', element: sizeGuide.className?.toString()?.substring(0, 60), visible: sizeGuide.getBoundingClientRect().height > 0 });

  return JSON.stringify({ section: sectionSelector, app_integrations: apps, count: apps.length });
})('SECTION_SELECTOR')
```

**For each app detected on live but missing on dev**, create a variance:

```json
{
  "id": "app:reviews:desktop",
  "element": "okendo-reviews-widget",
  "property": "app_integration",
  "breakpoints": ["desktop", "tablet", "mobile"],
  "live_value": "visible (Okendo star rating)",
  "dev_value": "missing",
  "type": "structural",
  "status": "open",
  "test": {
    "js": "(() => { const s = document.querySelector('SECTION_SELECTOR'); return s.querySelector('[data-oke-widget], [class*=\"okendo\"]') ? 'present' : 'missing'; })()",
    "expected_js": "present",
    "confidence": "high"
  },
  "fix_hint": "Copy app embed block from live theme settings_data.json to target. Add custom-liquid block in template JSON at correct position. See pull-section hard rule: App integrations must be migrated, not parked.",
  "source": "app_detection"
}
```

**These are `structural` variances, not cutover items.** They block section completion just like
a missing heading or broken layout. The three-step migration process (scaffold, enable embed, verify)
is defined in pull-section's hard rules.

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
  "find_variances_run": {
    "extracted_at": "2026-04-12T04:00:00Z",
    "live_url": "https://example.com/products/ring",
    "dev_url": "http://127.0.0.1:9292/products/ring",
    "breakpoints": ["desktop", "tablet", "mobile"],
    "shadow_dom_properties_discovered": 3
  }
}
```

**Display the variance table:**

```
VARIANCE REPORT: {section-key}
════════════════════════════════════════════════════════════
#   Element              Property         Live         Dev          Type     Breakpoints
1   h1                   fontWeight       200          700          setting  D/T/M
2   .price-money         fontWeight       300          500          css      D/T/M
3   .add-to-cart         fontSize         13px         16px         css      D/T/M
4   .add-to-cart         textTransform    uppercase    none         css      D/T/M
5   .variant-label       letterSpacing    0.1em        normal       css      D/T/M
6   section              paddingTop       80px         60px         css      D only
7   img[0] container     height           480px        371px        layout   D only
8   [structural]         trust-badges     present      missing      structural  D/T/M
════════════════════════════════════════════════════════════
TOTAL: 8 variances (1 structural, 1 setting, 5 css, 1 layout)
Shadow DOM properties discovered: 3 (--heading-font-weight, --price-font-weight, --button-font-size)
Test conditions generated: 8/8
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
  "element": "h1 (About GLDN Jewelry)",
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

The live site shows "About GLDN Jewelry" overlaid on the hero image. After refine-section
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
2. Visibility check finds: `h1 "About GLDN Jewelry" — clipped-by-overflow (.hero, overflow:hidden)`
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
