---
name: pull-section
description: >
  Execute the full compare→fix→verify loop on a single Shopify theme section. Takes screenshots, compares computed styles, applies fixes, and verifies visually.
  - MANDATORY TRIGGERS: theme-pull pull-section, pull section, match section, fix section, pull-section
---

# pull-section — Visual Section Matching

Execute the full compare→fix→verify methodology on a single section. This is the core workhorse of theme-pull — it does the actual pixel-matching work.

## Prerequisites

- `.theme-pull/config.json` must exist (run `onboard` first)
- Ideally, a mapping exists at `.theme-pull/mappings/sections/{section-name}.json` (will auto-run `map-section` if not)

## State Integration

When `.theme-pull/state.json` exists, pull-section reads and writes it (whether invoked standalone or as part of a pipeline):

1. **On start**: Set section status to `in_progress` with `last_updated` timestamp
2. **On success**: Set status to `completed` (visual verified) or `completed_code_only` (no browse tool)
3. **On failure**: Set status to `failed` with `error_history` entry (see Error Classification below)
4. **On skip**: If section is already `completed`, skip unless `--force` is passed

State keys use the format `{section-type}-{index}:{page}` to prevent collisions when the same section type appears multiple times on a page (e.g., `featured-collection-1:index`, `featured-collection-2:index`).

### Browse Tool Usage

Read `capabilities.browse_method` from config to determine how to take screenshots and run JavaScript:

#### `gstack_browse` — GStack browse binary

The browse binary is a CLI tool that persists browser state between calls. Locate it:

```bash
# Check both locations, use the first that exists
B=""
[ -x "$HOME/.claude/skills/gstack/browse/dist/browse" ] && B="$HOME/.claude/skills/gstack/browse/dist/browse"
[ -z "$B" ] && _ROOT=$(git rev-parse --show-toplevel 2>/dev/null) && [ -x "$_ROOT/.claude/skills/gstack/browse/dist/browse" ] && B="$_ROOT/.claude/skills/gstack/browse/dist/browse"
```

**Navigate and screenshot:**
```bash
$B goto "https://livesite.com"
$B screenshot /tmp/live-section.png

$B goto "http://127.0.0.1:9292"
$B screenshot /tmp/dev-section.png
```

**Screenshot a specific element:**
```bash
$B screenshot ".section-hero" /tmp/hero-live.png
```

**Run JavaScript (for computed style extraction):**
```bash
$B js "document.querySelector('.hero').getBoundingClientRect().height"
$B js "JSON.stringify(window.getComputedStyle(document.querySelector('.hero')))"
```

**Responsive screenshots:**
```bash
$B responsive /tmp/section    # Creates mobile, tablet, desktop screenshots
```

**Read the screenshot file** using the Read tool to visually inspect it.

#### `playwright_mcp` — Playwright MCP server

Use `mcp__playwright__*` tools:
- `mcp__playwright__browser_navigate` to go to a URL
- `mcp__playwright__browser_screenshot` to capture the page
- `mcp__playwright__browser_evaluate` to run JavaScript

#### `mcp_chrome` — Chrome MCP or other MCP browse tools

Use the detected `mcp__*` tool prefix for navigation, screenshots, and JS execution.

### Fallback (no browse tool)

When no browse tool is available (`capabilities.browse: false` in config):
- Skip Steps 4.1-4.4 (screenshot and computed style diff)
- Perform code-only analysis: compare CSS, schema, and settings between base and target
- Set final status to `completed_code_only` instead of `completed`
- Log a note in the report: "Visual verification skipped, no browse tool available"

This is a graceful degradation, not a failure. The section still gets pulled, just without visual confirmation.

## Arguments

```
/theme-pull pull-section <section-name> [--page <template>] [--url <live-page-url>]
```

- `<section-name>` — The section type name (e.g., `featured-collection`, `slideshow`, `custom-trust-bar`)
- `--page <template>` — Which template contains this section (e.g., `index`, `product`, `collection`). **Required** unless the section is in a section group (header-group, footer-group) or can be unambiguously found in exactly one template.
- `--url <live-page-url>` — The specific live page URL to screenshot for comparison (e.g., `https://gldn.com/collections/necklaces`). Defaults to the live site root for `index`, or the first matching page for other templates.

### How the page is resolved

1. If `--page` is provided, look up the section in `{target_theme}/templates/{page}.json`
2. If not provided, search all template JSON files and section group JSON files for a section with matching `type`
3. If found in exactly one location, use that
4. If found in multiple locations, list them and ask which one to work on
5. If found in a section group (e.g., `footer-group.json`), no `--page` is needed — section groups appear on every page

The page context matters because:
- The section's **configured settings** (content, colors, padding) live in the template JSON, not the section `.liquid` file
- The same section type can appear on multiple pages with different settings
- Screenshots need to be taken on the correct page

## Operational Rules

These rules prevent the most common mistakes observed in real migrations. Follow them strictly.

1. **Never do rem/em math manually.** Always extract computed pixel values via the browse tool (`getComputedStyle(el).fontSize`). Themes use different base font sizes, responsive scaling, and `clamp()` functions. Manual calculation is wrong more often than right.

2. **Read the target section schema FIRST.** Before setting any values, read the `{% schema %}` of the target section to understand what settings are available (presets, font_size options, color schemes, padding ranges). Don't guess what knobs exist — read the schema.

3. **Find the CSS loading mechanism early.** In Step 1, identify how the target theme loads custom CSS (e.g., `snippets/stylesheets.liquid`, `assets/custom.css`, `content_for_header`). You will need this for CSS overrides. Don't discover it halfway through.

4. **Always navigate before screenshotting.** The browse tool can lose page context. Always run `$B goto <url>` immediately before `$B screenshot`. Never assume the page is still loaded from a previous command.

5. **Screenshot individual sections, not just full pages.** Use element selectors (`$B screenshot ".shopify-section:nth-child(3)" /tmp/section.png`) for precise per-section comparison. Full-page screenshots miss details.

6. **When a section uses simplified blocks** (text-only, no heading tags), match visual weight through font settings and CSS, not by changing HTML tags. Don't swap `<h3>` for `<p><strong>` unless that's how the target theme actually renders headings.

7. **Set global settings before sections.** Logo, favicon, global font settings, and global color schemes must be set in `settings_data.json` before working on individual sections. A wrong logo or missing font will affect every section.

## Methodology

### Step 1: Load Context

1. Read `.theme-pull/config.json` for paths, URLs, and capabilities
2. Resolve the page context (see "How the page is resolved" above)
3. Check for existing mapping at `.theme-pull/mappings/sections/{section-name}.json`
   - If missing, run `map-section` first to find the target section and assess compatibility
4. Load the mapping to determine the approach (JSON-only, JSON+CSS, extension section, custom section)
5. **Load learnings** from `.theme-pull/learnings.json` (see `references/learnings.md`)
   - Filter to learnings whose trigger matches the current section or has `target_theme`/`universal` scope
   - These will be applied proactively in Steps 3, 6, and 7 — before writing code, not after it fails
6. **Find the target theme's CSS loading mechanism.** Search for how the theme includes stylesheets:
   - Check `snippets/stylesheets.liquid` or similar snippet
   - Check `layout/theme.liquid` for `{{ 'base.css' | asset_url | stylesheet_tag }}`
   - Identify where a custom CSS file can be loaded (e.g., add a line to the stylesheets snippet)
   - Record the path — you'll need it in Step 6 for CSS overrides

### Step 2: Read Both Sections

1. Check if `scan` has already been run — look for this section in `.theme-pull/site-inventory.json`
   - If present, use the **resolved CSS** from the inventory (all Liquid variables already substituted with actual values). This saves significant time vs manual cross-referencing.
   - If not present, fall back to manual resolution (below)
2. Read the **base theme's section `.liquid` file** — this is the PRIMARY code reference. Extract:
   - The inline `<style>` block with all CSS rules, breakpoints, responsive behavior
   - The `{% schema %}` with available settings and their types
   - The HTML structure and Liquid logic
3. Read the **base theme's configured values** from `settings_data.json` (or template JSON) for this section
4. **Resolve all Liquid variables in the section CSS** (skip if resolved CSS was loaded from inventory). If the base section's `<style>` block contains `{{settings.something}}` or `{{section.settings.something}}`, look up the actual values in `settings_data.json`. Pay special attention to:
   - Font family, weight, style, and letter-spacing
   - Color values
   - Padding/margin values with theme-level variables
   - Also check the HTML for global CSS classes that apply fonts not visible in the section's `<style>` block
5. Read the **target theme's section `.liquid` file** — its `{% schema %}`, CSS, and HTML structure. **Pay special attention to the `{% schema %}` block**: what settings exist, what presets are available, what font_size/type_preset options can be used. This determines what can be fixed via JSON vs what needs CSS overrides.
6. Read the **target theme's configured values** from template JSON

### Step 2.5: Resolve Final Computed CSS Values

**CRITICAL: Different themes use different CSS variable names and formats for the same visual properties. You MUST resolve both themes' variables down to final computed pixel/color/font values and compare THOSE, not the variable names.**

This is the most common source of migration errors. Two themes can have completely different variable systems but need to produce identical visual output.

#### Build a Computed Value Table

For this section, resolve every visual property to its final rendered value on BOTH themes. Use the base theme's `settings_data.json` + section CSS + global CSS to compute the actual values. Do the same for the target theme.

```
Property                  | Live (base) value      | Dev (target) value     | Match?
--------------------------|------------------------|------------------------|-------
background-color          | rgb(255, 255, 255)     | rgb(44, 67, 81)        | NO ← fix
foreground-color          | rgb(18, 18, 18)        | rgb(235, 239, 235)     | NO ← fix
font-family (body)        | Helvetica, Arial       | Helvetica, Arial       | YES
font-weight (headings)    | 400                    | 700                    | NO ← fix
font-size (body)          | 16px                   | 14px                   | NO ← fix
letter-spacing (body)     | 0.96px (0.06rem)       | 0px                    | NO ← fix
padding-top               | 36px                   | 48px                   | NO ← fix
padding-bottom            | 0px                    | 48px                   | NO ← fix
content-alignment         | bottom-right           | center                 | NO ← fix
button-variant            | secondary              | primary                | NO ← fix
overlay-opacity           | 0.3                    | 0.4                    | NO ← fix
section-height            | medium (~50svh)        | large (~80svh)         | NO ← fix
```

#### Cross-Theme CSS Variable Mapping

Themes use different variable names for the same properties. When comparing, you must resolve through these equivalences:

**Colors** (the formats differ but the RGB values must match):
- Dawn: `--color-background: 255,255,255` → consumed as `rgb(var(--color-background))`
- Horizon: `--color-background: rgb(255 255 255 / 1.0)` + `--color-background-rgb: 255 255 255`
- **Compare the raw RGB triplet, not the variable format**

**Fonts:**
- Dawn: `--font-heading-weight: 400` / Horizon: `--font-heading--weight: 700` (note double dash)
- Dawn: `--font-body-family` / Horizon: `--font-body--family`
- Dawn: `--font-body-scale: 1.0` with `html { font-size: calc(var(--font-body-scale) * 62.5%) }` / Horizon: `--font-size--paragraph: 0.875rem`
- **Compute the actual pixel font-size, don't compare scale factors**

**Spacing:**
- Dawn: `padding-top: 36px; padding-bottom: 36px` (direct pixel values from settings)
- Horizon: `--padding-block-start: max(20px, calc(var(--spacing-scale) * 48px))` (formula)
- **Resolve the formula to a pixel value and compare**

**Layout:**
- Dawn: `banner--content-align-right` (class) / Horizon: `--horizontal-alignment: center` (CSS var)
- Dawn: `banner--medium` (class, ~50svh) / Horizon: `--section-height-large` (var, ~80svh)
- Dawn: `grid--4-col-desktop` / Horizon: `layout-panel-flex layout-panel-flex--row`
- **The rendered layout must match, not the class names**

#### Light/Dark Polarity Check

For every section, determine whether the live site uses a light background (RGB sum > 384) or dark background (RGB sum < 384). If the target section has the OPPOSITE polarity, the color scheme assignment is wrong. This is the single most visible error — an entire section with inverted colors.

### Step 3: Align Settings (JSON)

Using the computed value table from Step 2.5, apply all setting changes via JSON (template config or `settings_data.json`):

**Color scheme alignment** (highest priority):
1. For each section, extract the live site's background color RGB values
2. Check if any existing target color scheme has matching background/foreground RGB values
3. If a match exists, assign that scheme. If not, **create a new named color scheme** in `settings_data.json` with the exact RGB values from the live site
4. Verify the color scheme also matches: button colors, link colors, badge colors, border colors

**Content alignment:**
- Content text, button labels, links, images — match character-for-character
- Button variant (primary/secondary) — must match the live site's button style

**Layout settings:**
- Content alignment (left/center/right, top/center/bottom)
- Section height (small/medium/large) — pick the closest match
- Width (page-width vs full-width)
- Column count and layout mode

**Spacing:**
- Padding values — if the target theme uses a scale formula, find the scale value that produces the closest match to the live site's pixel values
- If the theme caps padding at a maximum, note this for CSS override in Step 6

**Typography settings (if exposed in schema):**
- Font family, weight, style
- Font size scale
- Letter-spacing

**Always prefer JSON settings over CSS overrides.** CSS is only for what settings cannot control.

**Image references**: Use `shopify://shop_images/filename.ext` protocol. Find actual filenames in the base theme's `settings_data.json` or template JSON. These resolve to the store's CDN automatically.

### Step 4: Render & Inspect

**CRITICAL: Do NOT skip this step.** Do not jump from reading code straight to writing CSS. You MUST visually compare the live and dev sections before making changes.

1. **Navigate to the live site** first (`$B goto <live_url>`), then take a **screenshot of this specific section** using an element selector. For gstack_browse: `$B screenshot ".shopify-section:nth-child(N)" /tmp/live-section.png`. If element selectors don't work, take a full-page screenshot and note the section's position. Read the screenshot file with the Read tool to visually inspect.
2. **Navigate to the dev site** (`$B goto <dev_url>`), then take a **screenshot of the same section** at the same viewport width. Always navigate immediately before screenshotting — the browse tool can lose page context.
3. **Before reading any CSS**, list every visual difference you can see:
   - **Structural layout**: Which elements exist? Where are they positioned?
   - **Proportions**: How much space does each element take?
   - **Element presence/absence**: Are there elements on one that don't exist on the other?
   - **Vertical positioning**: Where does text sit within its container?
4. **Run the computed style diff** (see `references/computed-style-diff.md`):
   - Execute the extraction JavaScript on the **live site** section (use `$B js "..."` for gstack_browse, or the appropriate MCP tool for other methods)
   - Execute the same script on the **dev site** section
   - Diff the two results to get a structured table of every CSS property that differs
   - This catches variances invisible in screenshots (1px spacing, letter-spacing, font-weight)
   - Categorize diffs by severity (HIGH / MEDIUM / LOW)
5. Combine the visual differences (Step 4.3) with the computed style diff (Step 4.4) into a single work list
   - Visual differences catch structural and layout issues that computed styles miss
   - Computed styles catch subtle property differences that screenshots miss
   - Together they form a comprehensive variance list — the goal is to identify ALL differences in one pass

### Step 5: Identify Variances

**Start with the combined work list from Step 4.5.** Categorize each variance:

- **Structural variance**: Elements in the wrong place, missing, or extra. Highest priority — CSS won't fix wrong HTML. → Requires `.liquid` changes (Step 7)
- **Content variance**: Wrong text, image, or link → Fix in JSON (Step 3)
- **Setting variance**: A target setting exists but has the wrong value → Fix in JSON (Step 3)
- **CSS variance (overridable)**: Renders differently but fixable with CSS → Apply CSS override (Step 6)
- **Missing feature**: Live section has functionality the target lacks entirely → May need custom section or JS
- **Accepted variance**: Matches a known accepted variance from learnings or prior reconcile → Log but don't fix

**Check learnings before planning fixes.** For each CSS variance, check if a learning applies:
- Does a learning say this property needs `!important`? Apply it from the start.
- Does a learning say to use a specific approach for this pattern? Follow it.
- Does a learning say this variance is acceptable? Mark it accepted.

This is how theme-pull one-shots sections: learnings from prior sections prevent re-discovering the same issues.

**Address structural variances FIRST.** Do not start CSS work until the HTML structure matches.

### Step 6: Apply CSS Overrides

For CSS variances, apply fixes in order of preference:

1. **Section's own `{% stylesheet %}` block** — for custom sections we control
2. **Extension CSS file** (e.g., `assets/custom.css`) — for overriding core sections
3. **Inline `style` attribute via Liquid** — for per-instance values driven by settings

Guidelines:
- Use component-scoped selectors (class-based, not IDs or element selectors)
- Use `!important` only when overriding core inline styles or CSS custom properties
- Match the live site's CSS values exactly — copy font-size, padding, letter-spacing values
- For colors not available in any existing color scheme, create a new named scheme

### Step 7: Structural Changes

If the variance requires HTML/Liquid changes:

1. **Custom sections we own** (extension layer): Edit freely
2. **Core sections**: NEVER modify directly. Instead:
   - Can the fix be achieved with CSS-only? Prefer that.
   - If not, create a new extension section that implements the needed structure
   - Copy the minimum necessary logic, adapting to the extension pattern
3. Document any new custom sections or structural changes

### Step 8: Verify the Fix

1. Reload the dev site preview
2. Take a new screenshot at the same viewport width as Step 4
3. Compare against the live site screenshot. Check:
   - The specific variance — is it fixed?
   - No regressions — did the fix break anything else?
4. **Run the rendered output validation checklist** (see below). If any check fails, the fix is not complete.
5. If the variance persists, go back to Step 6. **Retry up to `default_retry_limit` times** (from `config.json`, default 3). If still not fixed, classify the error (see Error Classification) and log as outstanding.
6. **Capture learnings on retry.** If a fix required retry (first attempt didn't work):
   - Record what was tried first (the anti-pattern)
   - Record what eventually worked (the correct pattern)
   - Determine the trigger condition (why the first approach failed)
   - Write a learning to `.theme-pull/learnings.json` so future sections get it right on the first try
   - Example: tried `font-family: 'Spectral', serif;` → didn't apply → added `!important` → worked → learning: "target theme inline styles override font-family, use !important"

#### Rendered Output Validation Checklist

Run these checks on the dev site's rendered HTML for this section. These catch issues that source code review misses because they only manifest at render time.

**Use the browse tool** to fetch the rendered page and run JavaScript to extract these values. For gstack_browse: `$B js "..."`. Compare each against the live site.

| # | Check | How to extract | Fail condition |
|---|-------|---------------|----------------|
| 1 | **Background color** | `getComputedStyle(sectionEl).backgroundColor` | RGB values differ from live site |
| 2 | **Foreground color** | `getComputedStyle(sectionEl).color` | RGB values differ from live |
| 3 | **Light/dark polarity** | Sum RGB of background: >384 = light, <384 = dark | Polarity flipped vs live |
| 4 | **Font family** | `getComputedStyle(heading).fontFamily` | Different font family |
| 5 | **Font weight (headings)** | `getComputedStyle(heading).fontWeight` | Differs by >100 from live |
| 6 | **Font size (body)** | `getComputedStyle(bodyText).fontSize` | Differs by >1px from live |
| 7 | **Letter spacing** | `getComputedStyle(bodyText).letterSpacing` | Differs by >0.5px from live |
| 8 | **Section padding** | `getComputedStyle(sectionEl).paddingTop/Bottom` | Differs by >8px from live |
| 9 | **Content alignment** | Text-align + flexbox/grid alignment properties | Different alignment |
| 10 | **Button classes** | Check for primary/secondary class on CTA buttons | Wrong variant |
| 11 | **Overlay opacity** | Computed opacity on overlay element or pseudo-element | Differs by >0.05 |
| 12 | **No Liquid errors** | Search rendered HTML for "Liquid error" | Any Liquid error text present |
| 13 | **No empty CSS values** | Search for `rgb()` (empty), `font-family: , ;`, `border-width: px` | Any broken CSS value |
| 14 | **No placeholder images** | Check `<img>` src attributes, flag SVG data URIs where real images expected | Placeholder instead of real image |
| 15 | **Section height** | `sectionEl.getBoundingClientRect().height` | Differs by >20% from live |

**Extraction script example** (run on both live and dev via browse tool):

```javascript
(function() {
  const s = document.querySelector('[data-section-id="SECTION_ID"]') ||
            document.querySelector('.shopify-section:nth-child(N)');
  if (!s) return {error: 'Section not found'};
  const cs = getComputedStyle(s);
  const h = s.querySelector('h1,h2,h3');
  const p = s.querySelector('p');
  const btn = s.querySelector('.button,a[class*=button]');
  return {
    bg: cs.backgroundColor,
    fg: cs.color,
    padding: {top: cs.paddingTop, bottom: cs.paddingBottom},
    height: s.getBoundingClientRect().height,
    heading: h ? {
      fontFamily: getComputedStyle(h).fontFamily,
      fontWeight: getComputedStyle(h).fontWeight,
      fontSize: getComputedStyle(h).fontSize,
      letterSpacing: getComputedStyle(h).letterSpacing,
      textAlign: getComputedStyle(h).textAlign
    } : null,
    body: p ? {
      fontFamily: getComputedStyle(p).fontFamily,
      fontSize: getComputedStyle(p).fontSize,
      letterSpacing: getComputedStyle(p).letterSpacing,
      lineHeight: getComputedStyle(p).lineHeight
    } : null,
    button: btn ? {
      classes: btn.className,
      bg: getComputedStyle(btn).backgroundColor,
      color: getComputedStyle(btn).color,
      borderRadius: getComputedStyle(btn).borderRadius,
      padding: getComputedStyle(btn).padding
    } : null,
    liquidErrors: s.innerHTML.includes('Liquid error'),
    emptyRgb: (s.outerHTML.match(/rgb\(\)/g) || []).length
  };
})()
```

Compare the two results property by property. Every difference is a variance that needs fixing.

### Step 9: Next Variance

Return to Step 5 for the next visual difference. Repeat Steps 5-8 until all variances are resolved or logged.

### Step 10: Final Visual Comparison

After all code-identified variances are addressed:

1. Take fresh screenshots at **desktop width**
2. Do a pure visual comparison — look for anything missed:
   - Spacing that "feels off"
   - Hover states, transitions, animations
   - Interactive elements
3. **Breakpoint verification** — render and compare at all breakpoints defined in the base section's CSS:
   - Desktop (default)
   - Tablet (typically ≤800px)
   - Mobile (typically ≤480px)
   - Any section-specific breakpoints
4. For new variances found, repeat Steps 5-8

### Step 11: Write Report

Save to `.theme-pull/reports/sections/{state-key}.json` (where state-key matches the `state.json` key, e.g., `featured-collection-1:index`). Use the state key, not the bare section name, to prevent report collisions when the same section type appears multiple times:

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "section": "slideshow",
  "base_section": "sections/slideshow.liquid",
  "target_section": "sections/custom-hero-slideshow.liquid",
  "status": "complete",
  "changes": [
    {
      "type": "json_setting",
      "file": "templates/index.json",
      "setting": "heading",
      "old_value": "",
      "new_value": "New Arrivals"
    },
    {
      "type": "css_override",
      "file": "sections/custom-hero-slideshow.liquid",
      "selector": ".hero__heading",
      "property": "font-size",
      "value": "3.5em"
    },
    {
      "type": "structural",
      "file": "sections/custom-hero-slideshow.liquid",
      "description": "Moved controls inside content column"
    }
  ],
  "files_modified": [
    "templates/index.json",
    "sections/custom-hero-slideshow.liquid"
  ],
  "files_created": [],
  "outstanding_issues": [
    {
      "description": "Bottom padding 8px larger than live due to Horizon spacing system",
      "severity": "low",
      "reason": "Horizon's min() formula adds unavoidable overhead"
    }
  ],
  "breakpoints_verified": {
    "desktop": "pass",
    "tablet_800": "pass",
    "mobile_480": "pass_with_notes"
  },
  "learnings_applied": ["l_001", "l_seed_001"],
  "learnings_created": ["l_007"],
  "accepted_variances": [
    {
      "description": "Bottom padding 8px larger than live due to Horizon spacing system",
      "severity": "minor",
      "reason": "Horizon's min() formula adds unavoidable overhead",
      "accepted_at": "2026-04-07T20:30:00Z"
    }
  ],
  "notes": "Heading font requires !important to override Horizon's Inter Bold default"
}
```

The report tracks which learnings were applied proactively (`learnings_applied`) and which new learnings were discovered during this section (`learnings_created`). Over time, the ratio of applied-to-created should increase — meaning fewer surprises per section.

## Common Gotchas

These patterns recur across sections. Check for them proactively:

### CSS Variable Names Differ Between Themes
**This is the #1 source of migration errors.** Never assume variable names match. Always resolve to final computed values.
- Dawn `--font-heading-weight` vs Horizon `--font-heading--weight` (double dash)
- Dawn `--color-background: 255,255,255` (bare triplet) vs Horizon `--color-background: rgb(255 255 255 / 1.0)` (full value)
- Dawn `--font-body-scale: 1.0` (multiplier) vs Horizon `--font-size--paragraph: 0.875rem` (direct size)
- Dawn `padding-top: 36px` (direct) vs Horizon `max(20px, calc(var(--spacing-scale) * 48px))` (formula)

### Color Scheme Polarity Inversion
If the live section has a white background and the target has a dark background (or vice versa), the color scheme assignment is wrong. Check: sum the RGB values of the background. If >384 it's light, <384 it's dark. Both must have the same polarity.

### Heading Weight Mismatch
Many themes set different default heading weights. Dawn uses 400, Horizon uses 700. If the live site wraps heading text in `<strong>` to make it bold, but the target theme already applies 700, the heading will look the same. But if the live site does NOT use `<strong>` and relies on weight 400, the target will be too bold. Override `--font-heading--weight` or equivalent.

### Font Overrides
Target theme's global font CSS custom properties are set as inline styles. Custom font-family values must use `!important`.

### Liquid Template Variables in Base CSS
The base theme's section CSS often uses Liquid variables like `{{settings.heading_font_weight}}`. Cross-reference against `settings_data.json` to get actual rendered values.

### Never Use opacity for Lighter Text
When the live site shows lighter text, check whether it's `opacity`, an explicit `color`, or `color: inherit`. Don't approximate with `opacity`.

### Button Class Conflicts
Target theme's button classes add their own padding, border-radius, and colors. When implementing custom button styles, remove default button classes to avoid conflicts. Also check primary vs secondary button variant — the wrong variant changes background color, text color, and border.

### Image References
Use `shopify://shop_images/filename.ext` — find actual filenames in the base theme's `settings_data.json`.

### Exported Values May Be Stale
Theme export is a point-in-time snapshot. Always verify key values by inspecting the live storefront. When export and live disagree, the live site wins.

### Padding Limits
Many themes cap section padding via range controls (e.g., max 100px). If the live site exceeds this, use CSS overrides. Themes using spacing formulas (e.g., `max(20px, calc(scale * 48px))`) may produce different values than direct pixel settings — compute the actual result.

### Content Copy
NEVER change heading/body copy without explicit instruction. Match character-for-character.

### Rendered HTML Validation
After applying changes, always check the rendered HTML (via browse tool or curl) for:
- `Liquid error` text anywhere in the output
- Empty `rgb()` values (broken color variables)
- Empty `font-family: , ;` declarations (broken font variables)
- `border-width: px` without a number (missing values)
- SVG data URIs in `<img>` tags where real images should be (placeholder images)

## Error Classification

When a section fails (retries exhausted or unrecoverable error), classify the failure for structured reporting:

| Error Class | Description | Retryable | Example |
|-------------|-------------|-----------|---------|
| `css_override_failed` | CSS fix applied but variance persists after all retries | Yes | `!important` still overridden by inline style |
| `structural_mismatch` | HTML structure too different for CSS-only fix | No | Live section uses grid, target uses flexbox with no override path |
| `missing_asset` | Referenced image, font, or file not found | No | `shopify://shop_images/hero.jpg` returns 404 |
| `schema_incompatible` | Target schema lacks required setting type | No | Live uses `video` block, target schema has no video block |
| `browse_error` | Screenshot or computed style extraction failed | Yes | Browser crashed, timeout, navigation error |
| `liquid_render_error` | Section renders with Liquid errors on dev site | Yes | Missing snippet, undefined variable |
| `unknown` | Unclassified failure | Yes | Catch-all for unexpected errors |

### Error Report Format

When a section fails, add an entry to the section's `error_history` in `state.json`:

```json
{
  "error_class": "css_override_failed",
  "attempt": 3,
  "timestamp": "2026-04-08T12:15:00Z",
  "description": "font-weight override not applying despite !important",
  "suggested_remediation": "Try creating extension section to control font-weight directly",
  "files_modified_before_failure": ["assets/custom.css"]
}
```

And write a structured error report to `.theme-pull/reports/sections/{section-name}.json` with `"status": "failed"` and the full `error_history` array. This enables `status` to show actionable failure summaries and `--reset-failed` to know which sections to retry.
