---
name: pull-section
description: >
  Execute the full compare→fix→verify loop on a single Shopify theme section. Takes screenshots, compares computed styles, applies fixes, and verifies visually.
  - MANDATORY TRIGGERS: theme-forge pull-section, pull section, match section, fix section, pull-section
---

# pull-section — Visual Section Matching

Execute the full compare→fix→verify methodology on a single section. This is the core workhorse of theme-forge — it does the actual pixel-matching work.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)
- Ideally, a mapping exists at `.theme-forge/mappings/sections/{section-name}.json` (will auto-run `map-section` if not)

## State Integration

When `.theme-forge/state.json` exists, pull-section reads and writes it (whether invoked standalone or as part of a pipeline):

1. **On start**: Set section status to `in_progress` with `last_updated` timestamp
2. **On success**: Set status to `completed` (visual verified) or `completed_code_only` (no browse tool)
3. **On failure**: Set status to `failed` with `error_history` entry (see Error Classification below)
4. **On skip**: If section is already `completed`, skip unless `--force` is passed

State keys use the format `{section-type}-{index}:{page}` to prevent collisions when the same section type appears multiple times on a page (e.g., `featured-collection-1:index`, `featured-collection-2:index`).

### Browse Tool — IMPORTANT: This is a Bash Command

The browse tool is a **CLI binary** you run via the **Bash tool**. It is NOT an MCP tool, NOT a named tool in your tool list, and NOT WebFetch. You will not see "browse" in your tool list — that's expected. You use it by running Bash commands.

**Discovery — run this first:**
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && [ -x "$B" ] && echo "BROWSE READY: $B" || echo "NOT FOUND"
```

If `BROWSE READY`: you have the browse tool. The path is printed — use it in all subsequent commands.
If `NOT FOUND`: check the alternate location:
```bash
B="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/skills/gstack/browse/dist/browse" && [ -x "$B" ] && echo "BROWSE READY: $B" || echo "NOT FOUND"
```

If neither location has it, fall back to code-only mode (see Fallback below).

**IMPORTANT: Chain ALL browse commands in a SINGLE Bash call.** The browse tool may lose page state between separate Bash tool invocations (it restarts its server). Always chain `goto`, `js`, and `screenshot` commands in one Bash call using `&&` or newlines. Also define `B=<path>` at the start of every call since shell variables don't persist.

**Navigate, wait, and screenshot** (all in ONE Bash call):
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "https://livesite.com" && sleep 2 && $B screenshot /tmp/live-section.png
```

**Navigate, run JavaScript, and screenshot** (all in ONE Bash call):
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "http://127.0.0.1:9292" && sleep 3 && $B js "document.title" && $B screenshot /tmp/dev-section.png
```

**Screenshot a specific element:**
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "https://livesite.com" && sleep 2 && $B screenshot ".section-hero" /tmp/hero-live.png
```

**Run JavaScript for computed styles** (navigate + extract in ONE call):
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "https://livesite.com" && sleep 2 && $B js "JSON.stringify(window.getComputedStyle(document.querySelector('.hero')))"
```

**Responsive screenshots:**
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "https://livesite.com" && sleep 2 && $B responsive /tmp/section
```

**NEVER split browse commands across separate Bash tool calls.** For example, do NOT run `$B goto` in one Bash call and `$B screenshot` in the next — the page will be lost. Everything that needs the same page must be in one call.

**View screenshots:** Use the Read tool on the output PNG to visually inspect it.

#### Alternative: Playwright MCP (if gstack browse binary is not installed)

If you have `mcp__playwright__*` tools in your tool list, use those instead:
- `mcp__playwright__browser_navigate` to go to a URL
- `mcp__playwright__browser_screenshot` to capture the page
- `mcp__playwright__browser_evaluate` to run JavaScript

### Runtime Browse Verification

**Before starting Step 4**, run the browse discovery command above via Bash. This takes 1 second and tells you definitively whether the binary exists.

**Do NOT decide browse availability by inspecting your tool list.** The browse binary is a CLI, not a named tool. If you don't see "browse" in your tools, that means nothing — run the Bash check.

If the binary exists but fails (e.g., `$B url` returns an error), present these options:
- **A) Fall back to code-only analysis for this session.** Final status will be `completed_code_only`.
- **B) Troubleshoot.** Run `ls -la $HOME/.claude/skills/gstack/browse/dist/browse` and `B=$HOME/.claude/skills/gstack/browse/dist/browse && $B url` to diagnose.

### Shadow DOM Handling (Horizon and modern themes)

Some Shopify themes (notably **Horizon**) use **Declarative Shadow DOM** with web components. All page content lives inside shadow roots, not the regular DOM. This means:

1. **`document.querySelector()` cannot find elements inside shadow roots.** You must use a deep query that recurses into `.shadowRoot` on each element.
2. **`document.body.innerHTML` will appear empty** even though the page renders visually. This is normal for Shadow DOM themes.
3. **Screenshots may be blank if taken too quickly.** Declarative Shadow DOM is parsed during HTML load, but custom element JS (which sets up interactivity and may lazy-load images) needs time to register.

**How to detect Shadow DOM themes:**
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse
$B goto "http://127.0.0.1:9292"
$B js "document.querySelectorAll('*').length + ' elements, ' + (document.querySelector('[shadowrootmode], template[shadowroot]') ? 'HAS' : 'NO') + ' declarative shadow DOM, shadow hosts: ' + [...document.querySelectorAll('*')].filter(e => e.shadowRoot).length"
```

If shadow hosts > 0, this is a Shadow DOM theme. Use the techniques below.

**Wait for hydration before screenshots** (all in ONE Bash call — the browse tool loses page state between separate calls):
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "http://127.0.0.1:9292" && sleep 3 && $B js "document.querySelectorAll('*').length" && $B screenshot /tmp/dev-homepage.png
```

The 3-second sleep lets custom elements register and images load. For pages with heavy media, increase to 5 seconds.

**Deep querySelector — find elements inside shadow roots:**
```javascript
function deepQuery(root, sel) {
  let r = root.querySelector(sel);
  if (r) return r;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      r = deepQuery(el.shadowRoot, sel);
      if (r) return r;
    }
  }
  return null;
}
```

Run via browse tool:
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse
$B js "function deepQuery(root,sel){let r=root.querySelector(sel);if(r)return r;for(const el of root.querySelectorAll('*')){if(el.shadowRoot){r=deepQuery(el.shadowRoot,sel);if(r)return r;}}return null;} const el=deepQuery(document,'h1,.hero-heading,[class*=title]'); el ? el.textContent.trim() : 'NOT FOUND'"
```

**Deep querySelectorAll — find ALL matching elements across shadow boundaries:**
```javascript
function deepQueryAll(root, sel) {
  const results = [...root.querySelectorAll(sel)];
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) results.push(...deepQueryAll(el.shadowRoot, sel));
  }
  return results;
}
```

**Extract computed styles from Shadow DOM elements:**
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse
$B js "function deepQueryAll(root,sel){const r=[...root.querySelectorAll(sel)];for(const el of root.querySelectorAll('*')){if(el.shadowRoot)r.push(...deepQueryAll(el.shadowRoot,sel));}return r;} JSON.stringify(deepQueryAll(document,'h1,h2,h3,p,a,button').slice(0,20).map(el=>{const s=getComputedStyle(el);return{tag:el.tagName,text:el.textContent.trim().slice(0,50),fontSize:s.fontSize,fontWeight:s.fontWeight,fontFamily:s.fontFamily,color:s.color,lineHeight:s.lineHeight}}))"
```

`getComputedStyle()` works fine on shadow DOM elements once you have a reference to them. The hard part is finding them.

**Extract CSS custom properties (design tokens):**

Shadow DOM themes use CSS custom properties to share styles across shadow boundaries. These are your primary style comparison tool:
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse
$B js "const s=getComputedStyle(document.documentElement);const props=['--font-body-family','--font-heading-family','--font-body-weight','--font-heading-weight','--color-foreground','--color-background','--font-body-scale','--font-heading-scale'];JSON.stringify(Object.fromEntries(props.map(p=>[p,s.getPropertyValue(p).trim()])))"
```

CSS custom properties defined on `:root` pierce all shadow boundaries, making them the most reliable way to compare styles between themes.

**Section-level screenshots — CRITICAL for quality:**

**Always screenshot individual sections, never full pages for comparison.** Full-page screenshots compress details into tiny images where you can't see font weight, letter spacing, padding, or overlay differences. Per-section screenshots are the only way to catch the variances that matter.

**Technique 1: Scroll to section + viewport screenshot** (most reliable for Shadow DOM):
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "<url>" && sleep 2 && $B js "document.querySelectorAll('.shopify-section')[0].scrollIntoView({block:'start'})" && sleep 1 && $B screenshot /tmp/live-hero.png
```
This navigates, waits, scrolls to the Nth section (0-indexed), and screenshots — all in ONE call. Change the index `[0]` for each section.

**Technique 2: Section ID selector** (works on many themes):
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "<url>" && sleep 2 && $B screenshot "#shopify-section-template--header" /tmp/live-header.png
```
Section IDs follow the pattern `shopify-section-template--XXXXX--SECTION_NAME`. Check the page HTML for exact IDs.

**Technique 3: Custom element tag** (for Horizon-style Shadow DOM themes):
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "<url>" && sleep 2 && $B screenshot "section-hero" /tmp/live-hero.png
```

**If all element selectors fail:** Use scroll-to-section (Technique 1). Do NOT fall back to full-page screenshots for section comparison — the resolution is too low to catch real variances.

### Fallback (code-only mode)

When the browse binary is not installed and no Playwright MCP tools are available:
- Skip Steps 4.1-4.4 (screenshot and computed style diff)
- Perform code-only analysis: compare CSS, schema, and settings between base and target
- Set final status to `completed_code_only` instead of `completed`
- Log a note in the report: "Visual verification skipped — browse binary not found"

**Do NOT attempt visual verification with curl, WebFetch, or other non-browse tools.** These return HTML/markdown, not rendered pages. Visual comparison requires an actual browser.

## Arguments

```
/theme-forge pull-section <section-name> [--page <template>] [--url <live-page-url>]
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

8. **Always run the extraction script, never skip it.** The JavaScript extraction script (in Step 8 / Rendered Output Validation Checklist) MUST be executed on both live and dev sites. Do not skip it because "the screenshots look close enough." The extraction catches differences invisible in screenshots (1px font-size, letter-spacing, object-position). If the browse tool is available, there is no excuse for not running it.

9. **Never accept a variance without user approval.** You may not mark any difference as "accepted" or "known limitation" or "global theme setting." If a property differs between live and dev, fix it with CSS. If you truly cannot fix it (e.g., Shopify Liquid doesn't support the operation), escalate to the user. Do not silently accept it.

## Methodology

### Step 1: Load Context

1. Read `.theme-forge/config.json` for paths, URLs, and capabilities
2. Resolve the page context (see "How the page is resolved" above)
3. Check for existing mapping at `.theme-forge/mappings/sections/{section-name}.json`
   - If missing, run `map-section` first to find the target section and assess compatibility
4. Load the mapping to determine the approach (JSON-only, JSON+CSS, extension section, custom section)
5. **Load learnings** from `.theme-forge/learnings.json` (see `references/learnings.md`)
   - Filter to learnings whose trigger matches the current section or has `target_theme`/`universal` scope
   - These will be applied proactively in Steps 3, 6, and 7 — before writing code, not after it fails
6. **Find the target theme's CSS loading mechanism.** Search for how the theme includes stylesheets:
   - Check `snippets/stylesheets.liquid` or similar snippet
   - Check `layout/theme.liquid` for `{{ 'base.css' | asset_url | stylesheet_tag }}`
   - Identify where a custom CSS file can be loaded (e.g., add a line to the stylesheets snippet)
   - Record the path — you'll need it in Step 6 for CSS overrides

### Step 2: Read Both Sections

**CONTENT SOURCING RULE**: The base theme export may contain many alternate templates (e.g., `index.sl-7BABF038.json`, `index.sl-1D1AF432.json`) with old or stale content. **NEVER read content from alternate templates.** Always use:
- The primary template file (e.g., `templates/index.json`, not `index.sl-*.json`)
- `config/settings_data.json` for section content and settings (this is where Shopify stores the current values set through the theme editor)

If the primary template and `settings_data.json` disagree on a content value, `settings_data.json` wins — it reflects what the theme editor has set, which is what the live site shows.

**IMAGE SOURCING RULE**: Images do NOT need to be uploaded or set via the Shopify admin. The store's images already exist on Shopify's CDN. Copy the image references from the **base theme's** `config/settings_data.json` into the **target theme's** `config/settings_data.json`. Image references use the `shopify://shop_images/filename.ext` protocol (e.g., `shopify://shop_images/hero-banner.jpg`). These URLs resolve to the store's CDN automatically — they work in any theme on the same store.

Where to find image references:
1. **`config/settings_data.json`** — most section images are stored here under the section's key (e.g., `"image": "shopify://shop_images/hero.jpg"`)
2. **Template JSON files** — some images are referenced in the template's section blocks
3. **Global settings** — logo, favicon, and other global images are in the `current` key of `settings_data.json`

**NEVER tell the user that images need to be uploaded manually or set through the theme editor.** If an image shows a placeholder, you missed copying the image reference from the base theme. Go back and find the correct `shopify://shop_images/` URL in the base theme's `settings_data.json` and write it to the target theme's `settings_data.json`.

1. Check if `scan` has already been run — look for this section in `.theme-forge/site-inventory.json`
   - If present, use the **resolved CSS** from the inventory (all Liquid variables already substituted with actual values). This saves significant time vs manual cross-referencing.
   - If not present, fall back to manual resolution (below)
2. Read the **base theme's section `.liquid` file** — this is the PRIMARY code reference. Extract:
   - The inline `<style>` block with all CSS rules, breakpoints, responsive behavior
   - The `{% schema %}` with available settings and their types
   - The HTML structure and Liquid logic
3. Read the **base theme's configured values** from `settings_data.json` first, then template JSON as fallback. `settings_data.json` is the source of truth for content because it reflects what the theme editor shows on the live site.
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

**Image references** (see IMAGE SOURCING RULE above): Copy `shopify://shop_images/filename.ext` URLs from the base theme's `settings_data.json`. These resolve to the store's CDN automatically. **Never leave placeholder images** — every image field in the target theme's settings should have the corresponding URL from the base theme.

### Step 4: Render & Inspect

**CRITICAL: Do NOT skip this step.** Do not jump from reading code straight to writing CSS. You MUST visually compare the live and dev sections before making changes.

1. **Navigate to the live site** first, then take a **screenshot of THIS SPECIFIC SECTION ONLY** — not the full page. **Chain all commands in ONE Bash call** (the browse tool loses page state between separate calls):
   ```bash
   B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "<live_url>" && sleep 2 && $B js "document.querySelectorAll('.shopify-section')[N].scrollIntoView({block:'start'})" && sleep 1 && $B screenshot /tmp/live-section.png
   ```
   Or with element selector: `B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "<live_url>" && sleep 2 && $B screenshot "#shopify-section-ID" /tmp/live-section.png`. Read the screenshot file with the Read tool to visually inspect. **Never use full-page screenshots for section comparison** — they're too small to see real differences.
2. **Navigate to the dev site** and screenshot the **same section** — again, **all in ONE Bash call**:
   ```bash
   B=$HOME/.claude/skills/gstack/browse/dist/browse && $B goto "<dev_url>" && sleep 3 && $B js "document.querySelectorAll('.shopify-section')[N].scrollIntoView({block:'start'})" && sleep 1 && $B screenshot /tmp/dev-section.png
   ```
   The 3-second sleep is for Shadow DOM hydration. Increase to 5 seconds if the screenshot is blank.
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

**ZERO TOLERANCE: Every measurable difference between the live and dev rendering is a defect that MUST be fixed.** There is no category of "acceptable" variance based on size or severity. If it can be measured (font weight, letter spacing, container width, padding, color), it must be corrected. "Could add if needed" is not a valid resolution.

**The only exceptions are:**
1. Variances explicitly listed in `learnings.json` with `accepted: true` that were signed off by the user in a prior session (not by you).
2. True Shopify platform limitations (e.g., Shopify CDN serves a different image format, Liquid doesn't support a specific operation).

**These are NEVER platform limitations (always fixable with CSS `!important`):**
- Font weight (e.g., 700 vs 400) — override `--font-heading--weight` or equivalent with `!important`
- Font size — override with `!important`
- Font family — override with `!important`
- Letter spacing — override with `!important`
- Container width — override `max-width` or `width` with `!important`
- Image container height/aspect-ratio — override with `!important`
- Object-fit / object-position — override with `!important`
- Padding/margin values — override with `!important`
- Text alignment — override with `!important`

A "global theme setting" or "theme default" is NOT a platform limitation. If the target theme defaults to font-weight 700 but the live site uses 400, you override it with CSS. That's what CSS overrides are for.

**Start with the combined work list from Step 4.5.** Categorize each variance:

- **Structural variance**: Elements in the wrong place, missing, or extra. Highest priority — CSS won't fix wrong HTML. → Requires `.liquid` changes (Step 7)
- **Content variance**: Wrong text, image, or link → Fix in JSON (Step 3)
- **Setting variance**: A target setting exists but has the wrong value → Fix in JSON (Step 3)
- **CSS variance (overridable)**: Renders differently but fixable with CSS → Apply CSS override (Step 6)
- **Missing feature**: Live section has functionality the target lacks entirely → May need custom section or JS
- **Accepted variance**: Matches a variance in `learnings.json` with `accepted: true` that was explicitly approved by the user during a prior session. **You (the agent) may NEVER create a new accepted variance on your own.** Only the user can accept a variance, and only by explicitly saying so. "Global theme setting" or "theme default" is not an acceptable reason to skip a fix — override it with CSS.

**Check learnings before planning fixes.** For each CSS variance, check if a learning applies:
- Does a learning say this property needs `!important`? Apply it from the start.
- Does a learning say to use a specific approach for this pattern? Follow it.
- Does a learning say this variance is acceptable? Mark it accepted.

This is how theme-forge one-shots sections: learnings from prior sections prevent re-discovering the same issues.

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
- **Do not log any CSS variance as "could add if needed" or "minor, skipping."** If the computed style diff or bounding box comparison shows a measurable difference, write the CSS override now. The only valid outcome for a CSS variance is: fixed (override applied and verified) or escalated (requires structural change in Step 7). There is no "noted for later."
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
2. Take a **section-level screenshot** (not full-page) at the same viewport width as Step 4. Use the same scroll-to-section or element selector technique.
3. Compare against the live site screenshot. Check:
   - The specific variance — is it fixed?
   - No regressions — did the fix break anything else?
4. **Run the FULL extraction script** (see below) on BOTH live and dev sites. This is mandatory, not optional. Compare every property in the output. If any property differs (font weight, font size, letter spacing, container width, image object-fit, image container size, padding, colors), the fix is NOT complete. Go back and fix it.
5. If the variance persists, go back to Step 6. **Retry up to `default_retry_limit` times** (from `config.json`, default 3). If still not fixed, classify the error (see Error Classification) and log as outstanding.
6. **Capture learnings on retry.** If a fix required retry (first attempt didn't work):
   - Record what was tried first (the anti-pattern)
   - Record what eventually worked (the correct pattern)
   - Determine the trigger condition (why the first approach failed)
   - Write a learning to `.theme-forge/learnings.json` so future sections get it right on the first try
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
| 16 | **Element bounding boxes** | `getBoundingClientRect()` for all headings, paragraphs, images, buttons, containers | x, width, or height differs by >2px; relativeY differs by >2px (after normalizing for section offset) |
| 17 | **Image container size** | `getBoundingClientRect()` on image wrapper/container element | Container width or height differs by >2px from live |
| 18 | **Image sizing properties** | `getComputedStyle(img).objectFit`, `objectPosition`, container `aspectRatio` | Different `object-fit` (cover vs contain), different `object-position`, or different `aspect-ratio` — these control which part of the image is visible |

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
    images: (function() {
      const imgs = s.querySelectorAll('img');
      return [...imgs].slice(0, 10).map(img => {
        const ics = getComputedStyle(img);
        const ir = img.getBoundingClientRect();
        const parent = img.parentElement;
        const pr = parent.getBoundingClientRect();
        const pcs = getComputedStyle(parent);
        return {
          src: img.src.split('/').pop().split('?')[0],
          alt: (img.alt || '').substring(0, 40),
          imgWidth: Math.round(ir.width),
          imgHeight: Math.round(ir.height),
          containerWidth: Math.round(pr.width),
          containerHeight: Math.round(pr.height),
          objectFit: ics.objectFit,
          objectPosition: ics.objectPosition,
          aspectRatio: pcs.aspectRatio,
          overflow: pcs.overflow
        };
      });
    })(),
    liquidErrors: s.innerHTML.includes('Liquid error'),
    emptyRgb: (s.outerHTML.match(/rgb\(\)/g) || []).length,
    boundingBoxes: (function() {
      const sectionRect = s.getBoundingClientRect();
      const els = s.querySelectorAll('h1,h2,h3,h4,p,img,.button,a[class*=button],.rte,[class*=content]');
      return [...els].slice(0, 20).map(el => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          classes: el.className.toString().substring(0, 60),
          text: el.textContent ? el.textContent.trim().substring(0, 30) : null,
          x: Math.round(r.x),
          relativeY: Math.round(r.y - sectionRect.y),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };
      });
    })()
  };
})()
```

Compare the two results property by property. Every difference is a variance that needs fixing.

**Bounding box comparison**: Match elements between live and dev by tag + text content. For each matched pair, flag any property where the values differ by >2px. Common findings:
- **Width differs** — text container has different max-width or grid column sizing
- **Height differs** — font size, line-height, or padding causing different text wrapping
- **x differs** — alignment or margin difference
- **relativeY differs** — padding, margin, or element ordering difference

**Image comparison**: Match images by filename or alt text. For each matched pair, check:
- **Container size** — the wrapper element's width/height determines the visible area of the image. If containers differ, the same image shows different content. Fix via CSS width/height or aspect-ratio on the container.
- **object-fit** — `cover` crops the image to fill the container (most common for hero/banner images). `contain` shows the whole image with possible gaps. `fill` stretches. If live uses `cover` and dev uses `contain`, the image will look completely different.
- **object-position** — controls which part of the image is visible when cropped. `50% 50%` (center) vs `50% 30%` (focus higher) changes what the user sees. Extract from live and match exactly.
- **aspect-ratio** — some themes set `aspect-ratio` on the container instead of explicit height. Compare the computed aspect ratio between live and dev.

These image properties are the most common cause of "the image looks different" variances. The image file is identical, but the container and positioning differ.

### Step 9: Next Variance

Return to Step 5 for the next visual difference. Repeat Steps 5-8 until all variances are resolved or logged.

### Step 10: Final Validation Gate

**You cannot declare a section "done" without passing this gate.** This is not optional.

1. **Run the FULL extraction script** on both the live and dev site sections. This is the same script from Step 8's Rendered Output Validation Checklist. You MUST actually run it, not skip it.

2. **Build the final delta table.** For every property in the extraction output, compare live vs dev:

```
Property                | Live          | Dev           | Delta    | Status
------------------------|---------------|---------------|----------|--------
heading fontWeight      | 400           | 400           | 0        | PASS
heading fontSize        | 24px          | 24px          | 0        | PASS
body fontSize           | 16px          | 16px          | 0        | PASS
body letterSpacing      | 0.96px        | 0.96px        | 0        | PASS
padding top             | 36px          | 36px          | 0        | PASS
image[0] containerWidth | 1564px        | 1564px        | 0        | PASS
image[0] containerHeight| 560px         | 560px         | 0        | PASS
image[0] objectFit      | cover         | cover         | -        | PASS
image[0] objectPosition | 50% 50%      | 50% 50%       | -        | PASS
bbox[h2] width          | 600px         | 600px         | 0        | PASS
```

3. **If ANY row has a non-zero delta or mismatched value: FAIL.** Go back to Step 6 and fix it. Do not proceed to Step 11.

4. **Take final side-by-side screenshots** at desktop width. Read both screenshots and visually confirm they match. If you see ANY visual difference not captured in the delta table, investigate and fix it.

5. **Breakpoint verification** — render and compare at all breakpoints defined in the base section's CSS:
   - Desktop (default)
   - Tablet (typically ≤800px)
   - Mobile (typically ≤480px)
6. For new variances found, repeat Steps 5-8

**You MUST show the final delta table in your output.** The user needs to see the evidence that every property matches. A section reported as "complete" without a passing delta table is a bug in your process.

### Step 11: Write Report

Save to `.theme-forge/reports/sections/{state-key}.json` (where state-key matches the `state.json` key, e.g., `featured-collection-1:index`). Use the state key, not the bare section name, to prevent report collisions when the same section type appears multiple times:

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
  "cutover_items": [],
  "outstanding_issues": [],
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

**`outstanding_issues`** should contain ONLY items genuinely blocked by a platform limitation or requiring user decision. If an item is fixable with CSS or JSON, it should not appear here — it should have been fixed. "Could add CSS override" is not an outstanding issue, it's unfinished work.

#### Cutover Checklist

When any file created during this section requires manual action during the production cutover, auto-append an entry to `.theme-forge/cutover.json`:

```json
{
  "type": "template_assignment",
  "file": "templates/page.about-us.json",
  "page": "/pages/about-us",
  "section": "about-hero",
  "created_at": "2026-04-08T20:30:00Z",
  "action": "Assign template 'page.about-us' to page '/pages/about-us' in Shopify Admin (Pages > About Us > Theme template dropdown)",
  "notes": "Template cannot be assigned until the new theme goes live"
}
```

Common cutover item types:
- **`template_assignment`** — Custom page template created (e.g., `page.about-us.json`). Must be assigned in Shopify admin after theme goes live.
- **`custom_section`** — Extension section created (e.g., `sections/custom-hero.liquid`). Verify it renders correctly on the live theme.
- **`color_scheme`** — Custom color scheme added to `settings_data.json`. Verify it persists after theme publish.
- **`asset_upload`** — Image or font referenced but not yet in the store's files. Must be uploaded before cutover.

Create `.theme-forge/cutover.json` as an array if it does not exist. Append entries, never overwrite. Also add the items to the section report's `cutover_items` array.

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

### Image Viewable Area Mismatch
The same image can look completely different between themes if the container size, `object-fit`, or `object-position` differs. The image file is identical but the visible portion changes. Always extract the image container's `getBoundingClientRect()` and the `<img>` element's `object-fit` and `object-position` from both sites. Match them exactly. Common issues:
- Dawn uses `object-fit: cover` with a tall container, Horizon uses a shorter container — shows less of the image
- Dawn sets `object-position: center 30%` to focus on the subject, Horizon defaults to `50% 50%` — subject is cut off
- Container uses `aspect-ratio: 16/9` on one theme but explicit `height: 560px` on the other — different proportions at different viewport widths

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

And write a structured error report to `.theme-forge/reports/sections/{section-name}.json` with `"status": "failed"` and the full `error_history` array. This enables `status` to show actionable failure summaries and `--reset-failed` to know which sections to retry.
