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
  "stale": false
}
```

Field reference:
- `id` — stable identifier: `{element_tag}:{property}:{breakpoint}` (or `{element_tag}.{class}:{property}:{breakpoint}` for disambiguation)
- `element` — human-readable element description (tag + class or text hint)
- `property` — CSS property name in camelCase (matches `getComputedStyle` output)
- `breakpoints` — which breakpoints this variance appears at
- `live_value` — computed value on the live site
- `dev_value` — computed value on the dev site
- `type` — `structural` (element missing/wrong position), `setting` (JSON setting controls it), `css` (needs CSS override), `content` (text/image difference), `layout` (bounding box / sizing)
- `status` — `open` (needs fix), `fixed` (verified PASS), `escalated` (3 failed attempts), `accepted` (user approved)
- `test` — structured test condition (see Test Conditions below)
- `attempts` — array of attempt records from refine-section
- `user_approved` — only `true` if user explicitly approved via AskUserQuestion
- `source` — `extraction` (auto-discovered), `user` (manually added), `visual` (from screenshot comparison)
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

**Prioritize the queue:**
1. `structural` — must fix first (element missing or wrong position)
2. `setting` — simplest fix (JSON setting change)
3. `css` — most common (needs selector + override)
4. `layout` — bounding box adjustments
5. `content` — flag only

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

The extraction script runs in the browser via Playwright MCP or gstack browse. It extracts computed styles for all significant elements in a section.

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

Each failing check creates a variance entry in the array. Structural checks (12-14) get `type: "structural"` and a test condition with a custom JS assertion.
