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
4. Read the **target theme's section `.liquid` file** — its `{% schema %}`, CSS, and HTML structure
5. Read the **target theme's configured values** from template JSON

### Step 3: Align Settings (JSON)

Apply all setting changes that can be made via JSON (template config or `settings_data.json`):

- Color scheme (create a new named scheme if no existing scheme matches)
- Content text, button labels, links, images
- Padding values
- Alignment options
- Width (page-width vs full-width)
- Any section-specific toggles

**Always prefer JSON settings over CSS overrides.** CSS is only for what settings cannot control.

**Image references**: Use `shopify://shop_images/filename.ext` protocol. Find actual filenames in the base theme's `settings_data.json` or template JSON. These resolve to the store's CDN automatically.

### Step 4: Render & Inspect

**CRITICAL: Do NOT skip this step.** Do not jump from reading code straight to writing CSS. You MUST visually compare the live and dev sections before making changes.

1. Take a **screenshot of the live site** section using Chrome MCP or computer-use tools
2. Take a **screenshot of the dev site** section at the same viewport width
3. **Before reading any CSS**, list every visual difference you can see:
   - **Structural layout**: Which elements exist? Where are they positioned?
   - **Proportions**: How much space does each element take?
   - **Element presence/absence**: Are there elements on one that don't exist on the other?
   - **Vertical positioning**: Where does text sit within its container?
4. **Run the computed style diff** (see `references/computed-style-diff.md`):
   - Execute the extraction script on the **live site** section via Chrome MCP `javascript_tool`
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
4. If the variance persists, go back to Step 6. **Retry up to 3 times.** If still not fixed, log as outstanding.
5. **Capture learnings on retry.** If a fix required retry (first attempt didn't work):
   - Record what was tried first (the anti-pattern)
   - Record what eventually worked (the correct pattern)
   - Determine the trigger condition (why the first approach failed)
   - Write a learning to `.theme-pull/learnings.json` so future sections get it right on the first try
   - Example: tried `font-family: 'Spectral', serif;` → didn't apply → added `!important` → worked → learning: "target theme inline styles override font-family, use !important"

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

Save to `.theme-pull/reports/sections/{section-name}.json`:

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

### Font Overrides
Target theme's global font CSS custom properties are set as inline styles. Custom font-family values must use `!important`.

### Liquid Template Variables in Base CSS
The base theme's section CSS often uses Liquid variables like `{{settings.heading_font_weight}}`. Cross-reference against `settings_data.json` to get actual rendered values.

### Never Use opacity for Lighter Text
When the live site shows lighter text, check whether it's `opacity`, an explicit `color`, or `color: inherit`. Don't approximate with `opacity`.

### Button Class Conflicts
Target theme's button classes add their own padding, border-radius, and colors. When implementing custom button styles, remove default button classes to avoid conflicts.

### Image References
Use `shopify://shop_images/filename.ext` — find actual filenames in the base theme's `settings_data.json`.

### Exported Values May Be Stale
Theme export is a point-in-time snapshot. Always verify key values by inspecting the live storefront. When export and live disagree, the live site wins.

### Padding Limits
Many themes cap section padding via range controls (e.g., max 100px). If the live site exceeds this, use CSS overrides.

### Content Copy
NEVER change heading/body copy without explicit instruction. Match character-for-character.
