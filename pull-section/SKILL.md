---
name: pull-section
description: >
  Execute the full compare→fix→verify loop on a single Shopify theme section. Takes screenshots, compares computed styles, applies fixes, and verifies visually.
  - MANDATORY TRIGGERS: theme-forge pull-section, pull section, match section, fix section, pull-section
---

# pull-section — Visual Section Matching

Execute the full compare→fix→verify methodology on a single section. This is the core workhorse of theme-forge — it does the actual pixel-matching work.

## ⛔ Hard Rules — Read These First

These rules are non-negotiable. They override everything else in this document. If you find yourself about to violate one, stop and re-read it.

### Screenshots are MANDATORY before code changes
- **You MUST capture live site screenshots BEFORE making any code changes.** No exceptions. The capture step (Step 4) must run before Steps 5-7. If you skip capture and go straight to code, you are flying blind. STOP and go back.
- **ALL screenshots are taken by the `capture` skill.** Do not run browse tool commands directly. Invoke `capture/SKILL.md` for every screenshot. This ensures section-scoped capture, proper `wait --networkidle`, popup dismissal, and all three breakpoints (desktop, tablet, mobile).
- **NEVER take a full-page screenshot.** The capture skill enforces this. If you find yourself writing `$B screenshot` commands directly, stop. Use capture instead.
- **Live reference screenshots MUST be stored** in `.theme-forge/references/`. If the references directory for this section is empty after Step 4, something went wrong. Fix it before proceeding.

### Debug mode
- **`transcript.md` is mandatory.** Write to it incrementally at every step, not at the end. A debug session without a transcript is a failed debug session. Do not skip it.
- **All 5 mandatory artifacts must exist**: transcript.md, step4-live.png, step4-dev.png, step8-verify.png, summary.json.
- **Write transcript FIRST at each step, THEN do the work.** This ensures crashes leave partial transcripts, not empty ones.

### No accepted variances without user approval
- **You may NEVER mark a variance as "accepted" on your own.** Not for Shadow DOM. Not for "theme limitations." Not for "close approximation." Not for "not a visual difference." If a property differs between live and dev, fix it or escalate to the user.
- **Escalation uses `AskUserQuestion`** (MCP tool `mcp__conductor__AskUserQuestion`). This is a tool call that blocks your execution until the user responds. It is not optional. After 2 failed fix attempts, you MUST call this tool. See Step 8 escalation protocol.
- **Only the user can approve a variance.** The report field `user_approved: true` can ONLY be set after the user explicitly selects "Accept this variance" via AskUserQuestion. You cannot set it yourself.
- **"Shadow DOM prevents CSS override" is almost always wrong.** CSS custom properties (`--var-name`) cascade through Shadow DOM boundaries. If the target theme uses custom properties for a value (font-size, letter-spacing, border-radius, colors), you CAN override it from outside the shadow root. Check the theme's CSS before claiming Shadow DOM blocks the fix.
- **Height differences are ALWAYS visual.** A 109px height difference (480px vs 371px) is visible. Do not rationalize it as "header offset calculation." Match the live height.
- **Text alignment differences are ALWAYS visual.** Left-aligned vs centered text is obvious. Match the live alignment.

### Status honesty
- **Never mark `final_status: "completed"` when `variances_remaining > 0`.** Use `"incomplete"`.
- **Never mark `final_status: "completed"` when `files_modified` is empty and variances were found.** That means you did no work.
- **Never rationalize a variance as "intentional" or "better."** The live site is the spec. Your job is to match it, not improve it.
- **`variances_found` must equal `variances_fixed + variances_remaining`.** Always.

### Commit after each section
- **Always commit and push after completing a section.** Code changes, reports, debug artifacts, and learnings must be committed. Uncommitted work is invisible to parallel sessions and lost on crash.

### Section identity
- **Verify you are comparing the correct live section** before screenshotting. Confirm the content matches the mapping. Log the selector used.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)
- Ideally, a mapping exists at `.theme-forge/mappings/sections/{section-name}.json` (will auto-run `map-section` if not)

## Report-Based Progress

Pull-section writes a report to `.theme-forge/reports/sections/{section-key}.json` on completion or failure. The report is the source of truth for whether a section is done.

- **On success**: Report with `status: "completed"` or `"completed_code_only"`
- **On failure**: Report with `status: "failed"` and error details
- **On skip**: Report with `status: "skipped"` (user explicitly skipped)

Section keys use the format `{section-type}-{index}:{page}` to prevent collisions when the same section type appears multiple times on a page (e.g., `featured-collection-1:index`, `featured-collection-2:index`).

Before starting work, check if a report already exists. If `status` is `completed`, skip the section (another session may have finished it).

### Screenshot Capture — Use the `capture` Skill

**Do NOT run browse tool commands (`$B goto`, `$B screenshot`, etc.) directly.** All screenshots are taken by reading and following the `capture/SKILL.md` workflow inline. This ensures:
- Section-scoped screenshots (never full-page)
- `wait --networkidle` (never `sleep`)
- Popup dismissal on live sites
- All three breakpoints: desktop (1280), tablet (768), mobile (375)

**Before Step 4**, verify the browse tool exists:
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse
[ -x "$B" ] && echo "BROWSE: $B" || { B="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/skills/gstack/browse/dist/browse"; [ -x "$B" ] && echo "BROWSE: $B" || echo "BROWSE: NOT FOUND"; }
```

If `NOT FOUND`: fall back to code-only mode. Set final status to `completed_code_only`.

### Shadow DOM Handling (Horizon and modern themes)

Some Shopify themes (notably **Horizon**) use **Declarative Shadow DOM**. Standard `querySelector()` cannot find elements inside shadow roots. Use deep query functions when extracting computed styles or finding elements:

```javascript
function deepQuery(root, sel) {
  let r = root.querySelector(sel);
  if (r) return r;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) { r = deepQuery(el.shadowRoot, sel); if (r) return r; }
  }
  return null;
}
```

The `capture` skill handles Shadow DOM for screenshots and style extraction. You only need `deepQuery` when doing ad-hoc element inspection during fix work (Steps 6-7).

### Fallback (code-only mode)

When the browse tool is not available:
- Skip Steps 4 and 8 (capture + compare)
- Perform code-only analysis: compare CSS, schema, and settings between base and target
- Set final status to `completed_code_only` instead of `completed`
- Log a note in the report: "Visual verification skipped — browse tool not found"

## Arguments

```
/theme-forge pull-section <section-name> [--page <template>] [--url <live-page-url>]
```

- `<section-name>` — The section type name (e.g., `featured-collection`, `slideshow`, `custom-trust-bar`)
- `--page <template>` — Which template contains this section (e.g., `index`, `product`, `collection`). **Required** unless the section is in a section group (header-group, footer-group) or can be unambiguously found in exactly one template.
- `--url <live-page-url>` — The specific live page URL to screenshot for comparison (e.g., `https://example.com/collections/necklaces`). Defaults to the live site root for `index`, or the first matching page for other templates.
- `--debug` — Enable debug mode for this run. Saves a full transcript, all screenshots, and computed style diffs to `.theme-forge/debug/`. See "Debug Mode" section below.
- `--no-debug` — Disable debug mode for this run, even if the global setting is on.

### How the page is resolved

1. If `--page` is provided, look up the section in `{target_theme}/templates/{page}.json`
2. If not provided, search all template JSON files and section group JSON files for a section with matching `type`
3. If found in exactly one location, use that
4. If found in multiple locations, list them and ask which one to work on
5. If found in a section group (e.g., `footer-group.json`), no `--page` is needed — section groups appear on every page
6. **If NOT found by target section name**, the user may be referring to a **base/live site section name**. Reverse-lookup:
   - Search `.theme-forge/mappings/sections/*.json` for any mapping where `base_section` contains the name (e.g., `"base_section": "home_anatomy"` matches "anatomy")
   - Search `.theme-forge/site-inventory.json` for the base section name in the section list or mapping entries
   - If a match is found, use the corresponding `target_section` from the mapping and tell the user: "The live site's '{base_name}' section is mapped to '{target_name}' in the target theme. Pulling '{target_name}'."
   - If no match is found, tell the user the section name wasn't found in either theme and ask for clarification

The page context matters because:
- The section's **configured settings** (content, colors, padding) live in the template JSON, not the section `.liquid` file
- The same section type can appear on multiple pages with different settings
- Screenshots need to be taken on the correct page

## Debug Mode (`--debug`)

Debug mode is active when ANY of these are true (checked in order):
1. `--debug` flag was passed to this command
2. `.theme-forge/config.json` has `"debug": true` AND `--no-debug` was NOT passed

When debug is active, save a complete transcript and all artifacts so a human or another agent can review what happened without watching the session live.

**CRITICAL: Write to debug files incrementally as you go — NOT all at the end.** The primary value of debug mode is understanding what happened when something goes wrong. If you wait until the end to write everything, a crash or error means zero debug output.

### Mandatory artifacts

Every debug session MUST produce these files — a session missing any of them is incomplete:

1. **`transcript.md`** — the step-by-step narrative. This is the MOST important artifact. Without it, screenshots and diffs lack context. **Write to it at EVERY step as you complete it.** Append each step's entry immediately after finishing that step, not later.
2. **`screenshots/step4-live.png`** and **`screenshots/step4-dev.png`** — the "before" state. Without these, you can't see what the section looked like before fixes.
3. **`screenshots/step8-verify.png`** — the "after" state. Must be a **section-level** screenshot, not full-page.
4. **`summary.json`** — structured metadata with accurate counts.
5. **`diffs/delta-table.md`** — final property comparison.

### Setup

At the start of pull-section, if debug is active:

```bash
DEBUG_DIR=".theme-forge/debug/$(date +%Y%m%d-%H%M%S)-${SECTION_NAME}"
mkdir -p "$DEBUG_DIR/screenshots" "$DEBUG_DIR/diffs"
```

Replace `${SECTION_NAME}` with the section's state key (e.g., `featured-collection-1:index`).

**Immediately write the initial transcript entry:**

```bash
cat > "$DEBUG_DIR/transcript.md" << 'EOF'
# Pull-Section Debug Transcript
**Section:** ${SECTION_NAME}
**Started:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Debug dir:** $DEBUG_DIR
EOF
```

**Also log errors.** If any command fails (browse tool crash, extraction error, file write error), append the error to the transcript immediately:

```markdown
### Error at Step N
**Command:** <the command that failed>
**Exit code:** <code>
**Output:** <error output>
**Recovery:** <what you did instead>
```

### What to capture

**At each step**, append to `$DEBUG_DIR/transcript.md`:

```markdown
## Step N: Step Name
**Time:** YYYY-MM-DD HH:MM:SS
**Decision:** What was decided and why

### Commands
\`\`\`bash
<exact command run>
\`\`\`

### Output
<command output or summary>

### Files Modified
- path/to/file.json — what changed
```

**Specific artifacts to save per step:**

| Step | Artifact | Save to |
|------|----------|---------|
| Step 2 | Base section settings (from settings_data.json) | `$DEBUG_DIR/base-settings.json` |
| Step 2 | Target section settings (before changes) | `$DEBUG_DIR/target-settings-before.json` |
| Step 2.5 | Computed value table | `$DEBUG_DIR/computed-values.json` |
| Step 3 | Target section settings (after JSON changes) | `$DEBUG_DIR/target-settings-after.json` |
| Step 3 | Image references copied | append to transcript |
| Step 4 | Live site section screenshot | `$DEBUG_DIR/screenshots/step4-live.png` |
| Step 4 | Dev site section screenshot | `$DEBUG_DIR/screenshots/step4-dev.png` |
| Step 4 | Visual differences listed | append to transcript |
| Step 4 | Computed style extraction (live) | `$DEBUG_DIR/diffs/computed-live.json` |
| Step 4 | Computed style extraction (dev) | `$DEBUG_DIR/diffs/computed-dev.json` |
| Step 5 | Variance list with categories | `$DEBUG_DIR/variances.json` |
| Step 6 | CSS rules added | append to transcript |
| Step 8 | Verification screenshot | `$DEBUG_DIR/screenshots/step8-verify.png` |
| Step 8 | Post-fix computed style extraction | `$DEBUG_DIR/diffs/computed-dev-after.json` |
| Step 8 | Delta table (remaining differences) | `$DEBUG_DIR/diffs/delta-table.md` |

### Screenshot naming

When debug mode is on, copy capture output to `$DEBUG_DIR/screenshots/` for the permanent record:

```bash
cp .theme-forge/tmp/capture-live/desktop.png $DEBUG_DIR/screenshots/step4-live.png
cp .theme-forge/tmp/capture-dev/desktop.png $DEBUG_DIR/screenshots/step4-dev.png
cp .theme-forge/tmp/capture-verify/desktop.png $DEBUG_DIR/screenshots/step8-verify.png
```

Also copy tablet and mobile screenshots:
```bash
cp .theme-forge/tmp/capture-live/tablet.png $DEBUG_DIR/screenshots/step4-live-tablet.png
cp .theme-forge/tmp/capture-live/mobile.png $DEBUG_DIR/screenshots/step4-live-mobile.png
```

### Transcript format

The transcript should be a self-contained document that tells the full story. A reviewer reading only the transcript should understand:
- What the section looked like on the live site vs dev site
- What settings were changed and why
- What CSS was added and why
- What variances remain and why they couldn't be fixed
- What errors occurred and how they were handled

Example transcript entry:

```markdown
## Step 4: Render & Inspect
**Time:** 2026-04-09 14:23:15
**Live URL:** https://example.com
**Dev URL:** http://127.0.0.1:9292

### Screenshots
- Live: screenshots/step4-live.png
- Dev: screenshots/step4-dev.png

### Visual Differences
1. Heading "Most-Loved Gifts" — live: 2 lines, dev: 1 line (font-size differs)
2. Hero overlay — live: darker, dev: lighter (background opacity differs)
3. CTA button — live: outline style, dev: filled (button variant setting)

### Computed Style Diff
See: diffs/computed-live.json, diffs/computed-dev.json
Key differences:
- h1 font-size: 48px (live) vs 36px (dev)
- overlay background: rgba(0,0,0,0.4) (live) vs rgba(0,0,0,0.2) (dev)
- button border: 1px solid #fff (live) vs none (dev)
```

### Summary file

At the end of pull-section, write `$DEBUG_DIR/summary.json`:

```json
{
  "section": "featured-collection",
  "state_key": "featured-collection-1:index",
  "page": "index",
  "started_at": "2026-04-09T14:20:00Z",
  "completed_at": "2026-04-09T14:35:00Z",
  "final_status": "completed",
  "browse_tool_available": true,
  "screenshots_taken": 4,
  "json_changes": 12,
  "css_rules_added": 3,
  "variances_found": 8,
  "variances_fixed": 7,
  "variances_remaining": 1,
  "errors": [],
  "files_modified": [
    "config/settings_data.json",
    "assets/custom-migration.css"
  ]
}
```

**`final_status` rules — do not mark "completed" if variances remain:**

| Condition | `final_status` |
|-----------|---------------|
| `variances_remaining == 0` | `"completed"` |
| `variances_remaining > 0` and all remaining are accepted by user | `"completed_with_accepted_variances"` |
| `variances_remaining > 0` and any are unresolved | `"incomplete"` |
| Retry budget exhausted | `"failed"` |
| No browse tool available | `"completed_code_only"` |

**`variances_found` must equal `variances_fixed + variances_remaining`.** Count all variances when they're identified (Step 5), not when they're fixed. If you discover additional variances during fixing, increment `variances_found` too.

### When NOT in debug mode

When `--debug` is NOT passed, behavior is unchanged. Screenshots go to `.theme-forge/tmp/`, no transcript is written, no debug directory is created. Debug mode has zero overhead when disabled.

## Operational Rules

These rules prevent the most common mistakes observed in real migrations. Follow them strictly.

1. **Never do rem/em math manually.** Always extract computed pixel values via the browse tool (`getComputedStyle(el).fontSize`). Themes use different base font sizes, responsive scaling, and `clamp()` functions. Manual calculation is wrong more often than right.

2. **Read the target section schema FIRST.** Before setting any values, read the `{% schema %}` of the target section to understand what settings are available (presets, font_size options, color schemes, padding ranges). Don't guess what knobs exist — read the schema.

3. **Find the CSS loading mechanism early.** In Step 1, identify how the target theme loads custom CSS (e.g., `snippets/stylesheets.liquid`, `assets/custom.css`, `content_for_header`). You will need this for CSS overrides. Don't discover it halfway through.

4. **Use the capture skill for all screenshots.** Do not run `$B goto` or `$B screenshot` directly. The capture skill handles navigation, waiting, popup dismissal, and section targeting.

5. **Screenshot individual sections, not just full pages.** The capture skill enforces this. If you find yourself bypassing capture, stop.

6. **When a section uses simplified blocks** (text-only, no heading tags), match visual weight through font settings and CSS, not by changing HTML tags. Don't swap `<h3>` for `<p><strong>` unless that's how the target theme actually renders headings.

7. **Set global settings before sections.** Logo, favicon, global font settings, and global color schemes must be set in `settings_data.json` before working on individual sections. A wrong logo or missing font will affect every section.

8. **Always run the extraction script, never skip it.** The JavaScript extraction script (in Step 8 / Rendered Output Validation Checklist) MUST be executed on both live and dev sites. Do not skip it because "the screenshots look close enough." The extraction catches differences invisible in screenshots (1px font-size, letter-spacing, object-position). If the browse tool is available, there is no excuse for not running it.

9. **Never accept a variance without user approval.** You may not mark any difference as "accepted" or "known limitation" or "global theme setting" or "Shadow DOM limitation." If a property differs between live and dev, fix it with CSS. If you truly cannot fix it after trying, escalate to the user and wait for their decision. Do not silently accept it.

   **Common false "limitations" that are actually fixable:**
   - "Shadow DOM prevents CSS override" → CSS custom properties cascade through Shadow DOM. Override `--var-name` on `:root` or the host element.
   - "No isolated setting exists" → Add a CSS override with `!important`. You don't need a theme setting for every property.
   - "Close approximation" → Not good enough. Match the exact value.
   - "Not a visual difference" → If the numbers differ, it IS visual. A 109px height difference is obvious.

10. **Never rationalize variances as "intentional" or "better."** Common failure modes to watch for:
    - Calling a 128px height difference "intentional because dev accommodates more content" — NO. Match the live site.
    - Calling `object-fit: cover` "better for responsive" when the live site uses `fill` — NO. You are replicating, not redesigning.
    - Claiming a variance "doesn't apply" to the current slide/state — NO. If the mapping says this section maps to that live section, fix it.
    - Marking `final_status: "completed"` with `files_modified: []` and `variances_remaining > 0` — this is **never valid**. If you found variances and modified zero files, you didn't do any work.
    - Centering text when the live site has it left-aligned (or vice versa) — NO. Text alignment is one of the most visible properties. Match it exactly.
    - Accepting a shorter/taller section height as "header offset calculation" — NO. If the rendered section is 109px shorter, fix it.
    The live site is the spec. Your job is to match it, not improve it.

11. **A blank live screenshot is a hard stop.** After every live capture, read the screenshot with the Read tool. If it's blank, white, or missing the expected section content, do NOT continue. Retry once, then escalate. Proceeding without a valid live baseline means zero visual verification — every subsequent "comparison" is meaningless.

12. **Verify you are comparing the correct live section.** Before screenshotting, confirm the live section you're targeting matches the mapping. Check:
    - The section's content (heading text, images) matches what the mapping describes
    - The section's position on the page matches the expected order
    - If the live page has changed since the mapping was created, update the mapping — don't compare against a different section
    Log which live section selector/ID you used in the transcript so mismatches are auditable.

## Methodology

### Step 1: Load Context

1. Read `.theme-forge/config.json` for paths, URLs, and capabilities.
   **If `.theme-forge/config.json` does not exist**, check if it exists on another branch:
   ```bash
   git log --all --oneline -- .theme-forge/config.json | head -5
   ```
   - If found on another branch, tell the user:
     > **Config found on another branch but not on the current branch.** The onboard/scan work hasn't been merged to main yet. Merge it first, then branch from main:
     > ```bash
     > # On the branch that has .theme-forge/, create a PR to merge to main:
     > gh pr create --title "theme-forge: onboard + scan" --body "Base config and global settings"
     > # After merge, create your working branch from main:
     > git checkout main && git pull && git checkout -b <your-branch>
     > ```
   - If not found on any branch, tell the user to run `/theme-forge onboard` first.
2. Resolve the page context (see "How the page is resolved" above)
3. Check for existing mapping at `.theme-forge/mappings/sections/{section-name}.json`
   - If missing, run `map-section` first to find the target section and assess compatibility
4. Load the mapping to determine the approach (JSON-only, JSON+CSS, extension section, custom section)
5. **Load global maps** (generated by scan):
   - Read `.theme-forge/settings-map.json` — global theme settings cross-reference (typography, colors, spacing). Use this to translate base theme settings to target theme equivalents without guessing.
   - Read `.theme-forge/class-map.json` — CSS class cross-reference (buttons, typography, layout, custom properties, component patterns). Use this to write correct CSS selectors from the start.
   - **If either file is missing, STOP and recommend scan first:**

     > **Global maps not found.** Running pull-section without global maps means every section independently rediscovers theme settings and CSS class mappings. This is slower and more error-prone.
     >
     > A) Run `/theme-forge scan` first (recommended) — generates global maps and applies global settings (~2 min)
     > B) Continue without maps — I'll figure it out per-section

     **Wait for the user's choice.** If A, run scan (which includes `--apply-globals`), then resume this pull-section from Step 1. If B, continue without maps.
6. **Load and apply learnings** from `.theme-forge/learnings.json` (see `references/learnings.md`)
   - Filter to learnings whose trigger matches the current section or has `target_theme`/`universal` scope
   - **List the matching learnings by ID in the transcript** so it's clear which are being applied
   - These MUST be applied proactively in Steps 5, 6, and 7 — before writing code, not after it fails
   - Example: if a learning says the target theme uses `text-wrap: balance` on headings, include `text-wrap: wrap !important` in your FIRST CSS pass — don't wait to discover it again
7. **Find the target theme's CSS loading mechanism.** Search for how the theme includes stylesheets:
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

### Step 4: Capture & Compare (all breakpoints)

**⛔ BLOCKING GATE: No code changes are allowed until this step completes successfully.**

You MUST have:
1. Live site screenshots at all 3 breakpoints (stored in `.theme-forge/references/`)
2. Dev site screenshots at all 3 breakpoints
3. Visual comparison documented (what looks different?)

If the browse tool is unavailable or crashes, you may proceed with code-only analysis — but you MUST note this in the transcript and set `browse_tool_available: false` in the report. Do NOT silently skip screenshots and pretend you did visual comparison.

**Use the `capture` skill for all screenshots.** Read `capture/SKILL.md` and follow its workflow inline. Do NOT write browse commands directly.

#### 4.1 Live site reference

Check if a reference already exists at `.theme-forge/references/{section}-{page}/meta.json`.

**If reference exists:** Use the stored screenshots and computed styles. Read `desktop.png` with the Read tool to confirm it still looks correct.

**If no reference exists:** Run the capture workflow with `--reference {section}-{page} --extract-styles`:
- URL: the live site page URL
- Section: the CSS selector or index for this section
- Output: `.theme-forge/references/{section}-{page}/`

After capture, **read `desktop.png`** with the Read tool. Verify the screenshot shows the correct section with all content loaded (images visible, text rendered, no blank areas). If the capture looks wrong, retry once. If still wrong, note the issue and continue with code-only analysis.

#### 4.2 Dev site capture

Run the capture workflow with `--extract-styles`:
- URL: the dev server URL (e.g., `http://127.0.0.1:9292`)
- Section: same selector as live site
- Output: `.theme-forge/tmp/capture-dev/`

#### 4.3 Compare at each breakpoint

For **desktop, tablet, and mobile**:
1. Read the live reference screenshot and the dev screenshot side by side
2. List every visual difference you can see:
   - **Structural layout**: elements, positioning, proportions
   - **Element presence/absence**: missing or extra elements
   - **Colors and typography**: fonts, weights, sizes, spacing
   - **Images**: loaded vs placeholder, sizing, cropping
3. Compare the computed styles JSON files (live vs dev) to catch variances invisible in screenshots (1px spacing, letter-spacing, font-weight)
4. Combine visual + computed style differences into a single work list per breakpoint
5. Categorize by severity (HIGH / MEDIUM / LOW)

**Responsive-specific variances** (only visible at tablet/mobile):
- Layout changes (side-by-side → stacked)
- Hidden/shown elements at different breakpoints
- Different font sizes or padding
- Navigation collapse (hamburger menu)

These are tracked separately and may require breakpoint-specific CSS overrides (`@media` queries).

#### 4.4 ⛔ USER GATE: Confirm captures before code changes

**This is a tool-enforced gate, not a suggestion.** After completing Steps 4.1-4.3, you MUST present the captures and variance list to the user using `AskUserQuestion` (MCP tool `mcp__conductor__AskUserQuestion`) before proceeding to Step 5.

Present:
```
Section: {section-name} on {page}

Live reference (desktop): [Read desktop.png]
Dev current (desktop):    [Read desktop.png]

Variances found: {count}
- {variance 1}
- {variance 2}
...

A) Proceed to fix these variances
B) Recapture (screenshots look wrong)
C) Skip this section
```

**Do NOT proceed to Step 5 until the user responds.** In batch mode (`pull-page` or `--full`), auto-select A and log "batch mode: auto-proceeding" in the transcript.

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

**Self-test before marking any variance as "acceptable":** Would the user, looking at the live site and dev site side by side, notice the difference? If yes, it's a defect. A 128px height difference is obvious. A different `object-fit` changes how photos look. These are not acceptable. Fix them.

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

**Before writing any CSS, consult the global maps loaded in Step 1:**
- Check `class-map.json` for the correct target theme class names (e.g., base `.btn` → target `.button`)
- Check `settings-map.json` for typography/color overrides already identified (e.g., heading weight 200 vs 400)
- Check `class-map.json` → `custom_properties` for the correct CSS variable names

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

1. Run the `capture` workflow on the dev URL with `--extract-styles`. Output to `.theme-forge/tmp/capture-verify/`. This produces screenshots at all three breakpoints (desktop, tablet, mobile).
2. For each breakpoint, read the dev screenshot and compare against the stored live reference in `.theme-forge/references/{section}-{page}/`. The live reference is NOT re-captured.
3. Compare against the live site screenshot. Check:
   - The specific variance — is it fixed?
   - No regressions — did the fix break anything else?
4. **Run the FULL extraction script** (see below) on BOTH live and dev sites. This is mandatory, not optional. Compare every property in the output. If any property differs (font weight, font size, letter spacing, container width, image object-fit, image container size, padding, colors), the fix is NOT complete. Go back and fix it.
5. If the variance persists, go back to Step 6. **Retry up to `default_retry_limit` times** (from `config.json`, default 3).

#### ⛔ Escalation protocol (retries exhausted)

**After 2 failed fix attempts**, you MUST escalate to the user using `AskUserQuestion`. Do NOT silently accept the variance. Do NOT mark it as "accepted" or "theme limitation."

Present via `AskUserQuestion`:
```
Section: {section-name} — variance not resolved after {N} attempts

Property: {property name}
Live: {live value}
Dev: {dev value}
Attempted fixes: {list what was tried}

A) Try a different approach (describe what you'd try)
B) Accept this variance (user approves)
C) Skip this section entirely
D) I'll fix it manually — move on
```

**Only option B creates an accepted variance**, and it sets `user_approved: true` in the report. The agent CANNOT set `user_approved: true` on its own.

If all retries are exhausted without escalation (should not happen), classify the error (see Error Classification) and log as outstanding.
6. **Capture learnings — on EVERY successful fix, not just retries.**
   After verification passes, review each CSS override or settings change you made. For each fix, ask: *"Would this same issue appear in other sections?"* If yes, write a learning to `.theme-forge/learnings.json`.

   **When to capture:**
   - **Retry fixes** (first attempt failed): Record the anti-pattern AND the working fix. Trigger = why the first approach failed.
   - **Theme default overrides** (first attempt succeeded but you overrode a target theme default): The same default applies to every section. Capture it so future sections apply the override proactively.
   - **Pattern recognition**: You've now seen the same fix on 2+ sections. Promote it to a learning.

   **What to capture:**
   - The trigger condition (what to look for — e.g., "target theme applies text-wrap: balance to headings")
   - The action (what to do — e.g., "add text-wrap: wrap !important to override")
   - The scope (`target_theme` if it's a theme-wide default, `section_type` if specific to a section pattern)
   - The anti-pattern (what NOT to do, if applicable)

   **Example — theme default override (first-attempt success):**
   You discovered the target theme sets `text-wrap: balance` on headings, which changes line breaks. You fixed it with `text-wrap: wrap !important`. This wasn't a retry — you got it right the first time. But every heading in every section will have this same default. Capture it:
   ```json
   {
     "trigger": { "condition": "target_theme_heading_text_wrap", "property": "text-wrap", "description": "Target theme applies text-wrap: balance to headings, changing line break positions vs the live site" },
     "action": { "description": "Override with text-wrap: wrap !important on headings", "anti_pattern": "Leaving text-wrap: balance (default) — line breaks won't match live site" },
     "scope": "target_theme",
     "confidence": "medium"
   }
   ```

   The key insight: **if you had to override a theme default to match the live site, the next section will have that same default.** Capture it now so the next section one-shots it.

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

**Extraction script:** The computed style extraction script lives in `capture/SKILL.md` and runs automatically when `--extract-styles` is passed. The output is a JSON file at each breakpoint (`desktop.styles.json`, `tablet.styles.json`, `mobile.styles.json`). Compare the live and dev results property by property. Every difference is a variance that needs fixing.

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

1. **Use the computed styles from the last Step 8 capture** (both live reference and dev). You already have styles at all three breakpoints from the capture workflow. No need to re-extract.

2. **Build the final delta table at each breakpoint.** For every property in the extraction output, compare live vs dev:

```
Breakpoint | Property                | Live          | Dev           | Delta    | Status
-----------|-------------------------|---------------|---------------|----------|--------
desktop    | heading fontWeight      | 400           | 400           | 0        | PASS
desktop    | heading fontSize        | 24px          | 24px          | 0        | PASS
desktop    | body letterSpacing      | 0.96px        | 0.96px        | 0        | PASS
desktop    | image[0] objectFit      | cover         | cover         | -        | PASS
tablet     | heading fontSize        | 20px          | 20px          | 0        | PASS
tablet     | padding top             | 24px          | 24px          | 0        | PASS
mobile     | heading fontSize        | 18px          | 18px          | 0        | PASS
mobile     | padding top             | 16px          | 16px          | 0        | PASS
```

3. **If ANY row has a non-zero delta or mismatched value: FAIL.** Go back to Step 6 and fix it. Do not proceed to Step 11.

4. **Read the final screenshots** (desktop, tablet, mobile) from the last Step 8 capture. Visually confirm they match the live references at each breakpoint. If you see ANY visual difference not captured in the delta table, investigate and fix it.

5. No separate responsive pass is needed. All three breakpoints have been compared throughout the entire fix loop (Steps 4-8-10).

**You MUST show the final delta table in your output.** The user needs to see the evidence that every property matches at all breakpoints. A section reported as "complete" without a passing delta table is a bug in your process.

### Step 10.5: Present Final Screenshots to User

**This step is mandatory.** Before writing the report, show the user what the dev site looks like at all three breakpoints. This gives them a chance to flag issues the automated comparison missed.

Read each screenshot with the Read tool and present them:

1. Read `.theme-forge/tmp/capture-verify/desktop.png` — "**Desktop (1280px):**"
2. Read `.theme-forge/tmp/capture-verify/tablet.png` — "**Tablet (768px):**"
3. Read `.theme-forge/tmp/capture-verify/mobile.png` — "**Mobile (375px):**"

Present them via `AskUserQuestion` (tool-enforced gate):
```
Section: {section-name} on {page} — final result

Desktop (1280px): [Read desktop.png]
Tablet (768px):   [Read tablet.png]
Mobile (375px):   [Read mobile.png]

Delta table: all properties PASS at all breakpoints.
Files modified: {list}
Variances fixed: {count}

A) Looks good — mark as completed
B) I see an issue — go back to fix (describe what's wrong)
C) Acceptable — mark as completed with notes
```

**Do NOT proceed to Step 11 until the user responds.** This is the final quality gate. In batch mode (`pull-page` or `--full`), auto-select A and log "batch mode: auto-approved" in the transcript. The user can review batch-approved sections later via the page report.

### Step 11: Write Report

Save to `.theme-forge/reports/sections/{section-key}.json` (e.g., `featured-collection-1:index`). Use the section key, not the bare section name, to prevent report collisions when the same section type appears multiple times:

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

### Step 12: Commit and Push

**This step is mandatory.** Uncommitted work is invisible to parallel sessions and lost on crash.

```bash
git add .theme-forge/reports/sections/{section-key}.json \
        .theme-forge/learnings.json \
        .theme-forge/mapping-rules.json \
        .theme-forge/references/ \
        templates/ sections/ assets/ snippets/ config/ \
        .theme-forge/debug/
git commit -m "pull: {section-name} on {page} — {status}"
git push
```

Replace `{status}` with the report's `final_status` (e.g., `completed`, `incomplete`, `failed`).

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

### Grid/Mosaic Sections Need Exact Proportions
**This is a common regression.** When the base section uses a custom grid layout with asymmetric columns or variable heights (e.g., `layout: "right"`, `grid_height: "56%"`, or CSS Grid with `span 2`), the target must reproduce the exact proportions. Using equal-width columns or equal-height rows is NOT a fix. It produces a visibly different layout.

**What to do:**
- Extract the live grid's computed column/row sizes (`grid-template-columns`, `grid-template-rows`, `aspect-ratio`) via the browse tool
- If the target theme's section type doesn't support asymmetric grids, use CSS Grid overrides or create a custom section
- Never use `image_ratio: "square"` when the live site uses `image_ratio: "adaptive"` or variable aspect ratios. The image proportions ARE the layout.
- A flat equal-size grid is never "close enough" to an asymmetric mosaic. If you can see the difference, it's wrong.

### "Close Approximation" Is Not a Resolution
**Never accept a variance as "close approximation."** This is the #1 way sections get marked "completed" while looking wrong. Common false resolutions:
- "Images appear roughly square" — measure them. If live is 4:3 and dev is 1:1, that's a 25% height difference.
- "Minor size differences due to theme presets" — override the preset. CSS custom properties cascade through Shadow DOM.
- "Text renders correctly with [font]" — check font-size, line-height, letter-spacing, and weight. "Correct font" is necessary but not sufficient.
- "Layout matches the structure" — structure is not layout. A 4+2 grid with equal cells is structurally correct but visually wrong if the live site has a mosaic.

If the visual output doesn't match, the fix is incomplete. Period.

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

### Blank or White Live Capture = Hard Stop
**If the live site screenshot is blank, white, or clearly missing content, STOP.** Do not proceed with code-only analysis. Do not proceed with "the target looks reasonable." Without a live baseline, you have nothing to match against — any work you do is guesswork.

**What to do:**
- Retry the capture once with a longer wait (`sleep 5` instead of `sleep 3`)
- Try a different selector (the footer may be inside a shadow root or loaded lazily)
- If still blank, escalate to the user via `AskUserQuestion`. Explain the capture failed and ask whether to retry with different parameters or skip this section.
- **NEVER silently continue without a valid live capture.** A blank screenshot means zero visual verification happened. Marking the section "completed" without ever seeing the live site is the worst possible outcome.

### Footer Groups Have Multiple Base Sections
When the base theme has separate sections for different footer areas (e.g., `footer` + `footer_top`), ALL base sections must be mapped and their content pulled into the target footer group. Don't just map the obvious one.

**Common miss:** The base `footer_top` contains contact info, hours, navigation links, and newsletter signup — the richest part of the footer. The base `footer` is just copyright and legal links. If you only look at `footer` → `footer`, you'll produce a skeleton footer and miss 80% of the content.

**What to do:**
- Check `site-inventory.json` for ALL base sections tagged as footer/shared
- Check the live site to see what's actually rendered in the footer area
- Map every base footer section to its target equivalent
- Pull content from ALL mapped sections, not just the first match

### Third-Party Form Integrations Must Be Preserved
**Never replace a third-party form with the target theme's native equivalent.** If the base theme has a Klaviyo email signup form (`action="https://manage.kmail-lists.com/subscriptions/subscribe"`), a Mailchimp form, or any other third-party integration, the target must use the SAME form action and hidden fields — not Shopify's built-in email marketing block.

**Why this matters:** The store's email marketing flows, list segmentation, and automations are wired to the third-party provider. Swapping to a native Shopify email block silently breaks all of that. The form looks identical but emails go nowhere useful.

**What to do:**
- During extraction (Step 8), check every `<form>` element's `action` URL. If it points to a third-party domain (`kmail-lists.com`, `mailchimp`, `omnisend`, `drip`, etc.), flag it.
- In the target theme, use a custom HTML block or snippet to reproduce the exact form markup — `action` URL, hidden fields (`g`, `$fields`, list ID), and input names must match.
- Do NOT use the target theme's `email-signup` block type as a substitute. It posts to Shopify, not the third-party provider.
- Check `site-inventory.json` integrations list for known third-party services.

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

When a section fails, write a structured error report to `.theme-forge/reports/sections/{section-name}.json` with `"status": "failed"` and the error details:

```json
{
  "status": "failed",
  "error_class": "css_override_failed",
  "attempts": 3,
  "last_error": {
    "timestamp": "2026-04-08T12:15:00Z",
    "description": "font-weight override not applying despite !important",
    "suggested_remediation": "Try creating extension section to control font-weight directly",
    "files_modified_before_failure": ["assets/custom.css"]
  },
  "error_history": [...]
}
```

This enables `status` to show actionable failure summaries and `--retry-failed` to identify which sections to re-attempt (by deleting their failed reports).
