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

### Dev server MUST use the script (no manual startup)
- **NEVER run `shopify theme dev` directly.** Always use the dev-server script. The script handles safety checks (blocks live themes), parallel session isolation (unpublished themes), port discovery, and URL capture. Running `shopify theme dev` manually bypasses all of these safeguards.
  ```bash
  # Find the script (project-local or global install)
  DS="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/dev-server.sh"
  [ -x "$DS" ] || DS="$HOME/.claude/skills/theme-forge/scripts/dev-server.sh"
  eval "$("$DS" start --path .)"
  ```
  **If the script fails (non-zero exit or `DEV_STATUS=error`): STOP.** Do not continue without a running dev server.
- **For restarts, use `"$DS" restart --path .`.** Do not kill and restart the process yourself.
- **For cleanup, use `"$DS" cleanup --path .`.** This deletes unpublished themes and scans for orphans.

### Screenshots are MANDATORY before code changes
- **You MUST capture live site screenshots BEFORE making any code changes.** No exceptions. The capture step (Step 4) must run before Steps 5-7. If you skip capture and go straight to code, you are flying blind. STOP and go back.
- **ALL screenshots are taken by the `capture` skill.** Do not run browse tool commands directly. Invoke `capture/SKILL.md` for every screenshot. This ensures section-scoped capture, proper `wait --networkidle`, popup dismissal, and all three breakpoints (desktop, tablet, mobile).
- **NEVER take a full-page screenshot.** The capture skill enforces this. If you find yourself writing `$B screenshot` commands directly, stop. Use capture instead.
- **Live reference screenshots MUST be stored** in `.theme-forge/references/`. If the references directory for this section is empty after Step 4, something went wrong. Fix it before proceeding.

### Debug mode
- **`transcript.md` is mandatory.** Write to it incrementally at every step, not at the end. A debug session without a transcript is a failed debug session. Do not skip it.
- **All 5 mandatory artifacts must exist**: transcript.md, step4-live.png, step4-dev.png, step8-verify.png, summary.json.
- **Write transcript FIRST at each step, THEN do the work.** This ensures crashes leave partial transcripts, not empty ones.

### find-variances is MANDATORY (no inline extraction)
- **You MUST invoke the `find-variances` skill at Step 4.3.** Do NOT extract computed styles yourself with inline `page.evaluate()` or browse tool JS. find-variances produces the structured `variances` array in the section report. Without this array, Steps 5-10 cannot function.
- **The `variances` array in the section report is the ONLY valid work queue.** If you reach Step 5 and the section report does not contain a `variances` array, STOP. Go back and run find-variances. Old-style `variances_found`/`variances_fixed`/`variances_remaining` counter fields are NOT a substitute.
- **If you find yourself writing JS to extract `getComputedStyle()` inline, STOP.** That is find-variances' job. The only exception is ad-hoc element inspection during fix work (Step 5.5 selector discovery).

### refine-section is recommended for remaining variances
- **If Step 8 leaves `open` variances, report them and recommend `refine-section`.** Do NOT continue the old Step 5→8 loop manually. If the user wants to close remaining variances, they invoke refine-section separately.
- **pull-section's job is the first pass.** Get as close as possible with settings, CSS overrides, and structural changes. Remaining variances are reported with status `needs_refinement` so the user can decide whether to refine.

### Extraction FAIL = must fix (no rationalizing)
- **If the computed style extraction marks a row as FAIL, you MUST fix it or escalate.** You may not reclassify a FAIL as "measurement artifact," "visually equivalent," or "not a real difference." The extraction compares exact computed values from the browser. If live says `text-align: center` and dev says `text-align: left`, that is a real difference — fix it. Do not argue that "the container is narrow so they look the same."
- **The extraction table is the spec, not a suggestion.** Screenshots are a secondary check. The extraction catches sub-pixel differences that screenshots miss. If the extraction says FAIL and the screenshot looks "close enough," trust the extraction.
- **Common rationalizations that are NOT allowed:**
  - "The visual appearance looks the same" — if the values differ, fix them.
  - "Measurement artifact" — computed styles are exact, not approximate.
  - "The container is narrow so center and left are equivalent" — they aren't. Multi-line text wraps differently.
  - "Close approximation" — match the exact value.

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

### Commit and push after each section
- **Always commit and push after completing a section.** Code changes, reports, debug artifacts, and learnings must be committed. Uncommitted work is invisible to parallel sessions and lost on crash.
- **On first push, use `git push -u origin <branch-name>`.** Subsequent pushes can use plain `git push`. If `git push` fails with "no upstream branch," you forgot the `-u` — run `git push -u origin $(git branch --show-current)`.
- **Verify the push succeeded.** After pushing, check that the remote branch exists: `git log origin/<branch-name> --oneline -1`. If this fails, the push didn't work — fix it before continuing.

### "Requires custom section" means build it, not skip it
- **If a section needs a custom section, build the custom section.** The mapping classification `requires_customization` or `incompatible` describes the approach, not a reason to defer. You have the tools: create a `.liquid` file in `sections/`, build the schema, write the CSS, register it in the template JSON. The spec sheet (Step 2.75) tells you exactly what to build.
- **"Requires custom section" is NEVER a valid skip reason.** If you write `status: "skipped"` with reason "requires custom section," that is a bug. The only valid reason to skip a section is if the user explicitly approved the skip via `AskUserQuestion`.
- **Below-fold content is NOT optional.** Collapsible product details, FAQ accordions, trust badges, recommendation carousels — if it's visible on the live page, it must be replicated. "Below the fold" does not mean "low priority."

### App integrations must be migrated, not parked
- **If an app is running on the live store, it must be brought to the dev theme.** Apps visible on the live site (star ratings, loyalty points, payment installments, wishlists, personalization builders) are part of the live experience. They are not optional. They are not "cutover items" to deal with later.
- **"App embed that loads at runtime" is NOT a valid skip reason.** If the live store has Okendo rendering star ratings, the dev theme must also render star ratings. If the live store shows Shop Pay installments, the dev theme must show them too. The migration is not complete until the dev theme is functionally equivalent to the live site.
- **Three-step process for every live app integration** (in preference order, simplest first):
  1. **Enable the app block in the template JSON.** Many Shopify apps use theme app extensions (app blocks) that just need to be added to the section's block list in `templates/{page}.json`. Check the live theme's template JSON for app blocks — if they exist, copy them to the target template. This is the simplest and most correct approach.
  2. **Enable the app embed on the dev theme.** Check `settings_data.json` on the live theme for app embed blocks under `current.blocks`. If `.theme-forge/base-cache/config/settings_data.json` does not exist, fetch it: `shopify theme pull --theme LIVE_THEME_ID --store STORE --path .theme-forge/base-cache --only config/settings_data.json`. Copy any app embed blocks that power visible features to the target theme's `settings_data.json`. This enables the app on the dev theme — it does NOT require reinstalling the app.
  3. **Scaffold with `custom-liquid` only as last resort.** If the app has no app block and no embed, add a `custom-liquid` block in the correct template position with the rendering snippet. This is the least preferred approach because it creates markup that the app doesn't own and may break on app updates.
  4. **Verify rendering on the dev site.** If the app is installed on the store (most are — the store is the same), it should render. If it doesn't render, note the specific issue as a **variance with status `open`** — NOT a cutover item. The variance tracks what's missing; cutover items are for things that literally cannot be done until go-live day (DNS changes, theme publishing).
- **The only valid cutover items for apps are:**
  1. Apps that require a paid plan upgrade to run on multiple themes simultaneously
  2. Apps that are store-level settings requiring merchant authorization (e.g., Shopify Payments configuration)
  3. DNS/domain changes that only apply at go-live
- **"The app isn't installed on the dev store" is almost always wrong.** Theme-forge uses dev themes on the SAME store as the live theme. If the app is installed on the store, it works on all themes on that store — including unpublished dev themes. The app embed just needs to be enabled in the theme's `settings_data.json`.

### No positional CSS selectors for variant options
- **NEVER use `:first-child`, `:nth-child(2)`, `:nth-child(3)` to target variant option types (Material, Size, Color, etc.).** These break when a product has a different number of variant options. A selector targeting `:nth-child(3)` for Size will match Finish on a 3-option product and nothing on a 2-option product.
- **Use option-name-based selectors instead.** Inspect the rendered DOM to find data attributes or classes that identify the option type (e.g., `[data-option-name="Material"]`, `[data-option="Size"]`). If no data attributes exist, use the option label text content to identify which option group you're styling.
- **Test with multiple products.** If your CSS works on a ring (2 options: Material, Size) but would break on a necklace (3 options: Material, Finish, Length), it's wrong. CSS must be robust across all product variant configurations.

### Extraction consistency
- **Extract styles from the SAME product on live and dev.** If you extract live styles from "Kindred Birthstone Necklace" but dev styles from "Diamond Pavé Flow Ring," the comparison is meaningless. Navigate to the same product URL path on both sites.
- **Record which product URL you extracted from** in the transcript or report. If extraction data shows contradictory values (e.g., ATC is dark on live but you see a light button in screenshots), the extraction was likely from a different product.

### Thrash loop prevention
- **If you revert a commit, STOP and escalate to the user.** A revert means your approach isn't working. Do NOT immediately try a v6 after reverting v5. Instead, present the user with what you tried, why it failed, and ask for direction.
- **Before retrying a failed fix, review the diff and explain WHY it failed.** Read the git diff of your last commit. If you can't explain why the previous approach failed, you will repeat the mistake.
- **3 failed attempts at the SAME variance = escalate.** If you've tried 3 different approaches to fix the same property (e.g., font-weight on the price) and none worked, escalate via `AskUserQuestion`. You are likely fighting a structural issue (Shadow DOM, wrong selector, settings conflict) that more CSS won't fix. But making 20 small *successful* verified changes is fine — the limit is on thrashing, not on forward progress.

### Section identity
- **Verify you are comparing the correct live section** before screenshotting. Confirm the content matches the mapping. Log the selector used.

### Never save files to the repo root
- **All screenshots go in `.theme-forge/` subdirectories.** Debug screenshots go in `.theme-forge/debug/{session}/`. Reference screenshots go in `.theme-forge/references/{section}/`. Temporary captures go in `.theme-forge/tmp/capture/`. NEVER save `.png` files, `.yml` files, or any working artifacts to the repo root directory. The repo root is for theme files only (sections/, assets/, config/, templates/, snippets/, layout/).
- **All Playwright CLI files stay in `.playwright-cli/`.** Do not move or copy them elsewhere. This directory is gitignored.

### Learnings are mandatory
- **After completing any section, write learnings to `.theme-forge/learnings/{section-key}.json`.** Each section gets its own file (e.g., `learnings/hero-1_index.json`, `learnings/header.json`). This prevents merge conflicts when parallel sessions write learnings simultaneously. The file contains an array of learning objects for that section.
- **After EVERY fix attempt (successful or not), write a learning.** Especially capture: which CSS selectors work vs don't work on this theme, Shadow DOM boundaries discovered, settings that control specific properties, variant option DOM structure. These prevent the next iteration from repeating the same mistakes.
- **Before starting any section, read ALL files in `.theme-forge/learnings/` and apply matching learnings.** If a prior section discovered that Horizon headings default to font-weight 700 but the live site uses 200, apply that override proactively — don't wait to rediscover it.
- **An empty `.theme-forge/learnings/` directory after 2+ sections is a red flag.** Stop and review what you learned from previous sections. Six iterations on the product page with zero learnings is a critical failure — you're repeating mistakes you should have captured.
- **Migration from single file:** If `.theme-forge/learnings.json` exists (old format), read it, split entries by `created_by`/`source.section` into per-section files in `learnings/`, then delete the old file.

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

1. **`transcript.md`** — the step-by-step narrative. This is the MOST important artifact. Without it, screenshots and diffs lack context. **Write to it at EVERY step as you complete it.** Append each step's entry immediately after finishing that step, not later. Must include the **full settings migration table** from Step 2.1 (every setting, its classification, and the target mechanism).
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
  ],
  "settings_migration": {
    "total": 12,
    "native": 2,
    "mapped": 3,
    "css_only": 4,
    "extend": 1,
    "custom_section": 0,
    "deprecate": 2,
    "approach": "target_section_with_overrides",
    "upgradability": "high",
    "settings": [
      { "name": "Heading Text", "category": "native", "target": "text block → text setting" },
      { "name": "Text Width", "category": "css_only", "target": "gldn-global-overrides.css", "value": "25em", "varies": false },
      { "name": "Make it h1?", "category": "deprecate", "reason": "auto heading hierarchy" }
    ]
  }
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

2. **Read the target section AND block schemas FIRST.** Before setting any values, read the `{% schema %}` of the target section AND the `{% schema %}` of every block type it references (in `blocks/*.liquid`). The section schema often just lists block type names — the actual settings (what knobs exist, what values are valid, what conditions control visibility) are in the block definition files. Don't guess what knobs exist — read the block schemas.

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

12. **Prefer native blocks over `custom-liquid`.** For each piece of base content, check if the target theme has a native block type that handles it (e.g., `menu` for navigation, `social-links` for social icons, `email-signup` for newsletter forms, `footer-copyright` for copyright text). Only use `custom-liquid` when: (a) no native block type exists for that content, OR (b) a third-party integration requires exact HTML preservation (e.g., Klaviyo forms). Native blocks are editable in the Shopify theme editor; custom-liquid blocks are opaque blobs that merchants can't modify.

13. **Verify you are comparing the correct live section.** Before screenshotting, confirm the live section you're targeting matches the mapping. Check:
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
6. **Load and apply learnings** from all files in `.theme-forge/learnings/` (see `references/learnings.md`)
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
2. Read the **base theme's section `.liquid` file** from `.theme-forge/base-cache/sections/` — this is the PRIMARY code reference. Extract:
   - The inline `<style>` block with all CSS rules, breakpoints, responsive behavior
   - The `{% schema %}` with available settings and their types
   - The HTML structure and Liquid logic
   - **All `{% render %}` and `{% include %}` calls** — these reference snippets in `.theme-forge/base-cache/snippets/` that may contain form handlers, JS, tracking code, or reusable components. Read every referenced snippet.
   - **All `<script>` tags and JS references** — inline scripts, external asset references (`{{ 'filename.js' | asset_url }}`). If the section uses JavaScript for form submission, AJAX, animations, or tracking, you need to understand and port it.
   - **All block type references** — check `.theme-forge/base-cache/blocks/` for block definitions.

   **If `.theme-forge/base-cache/sections/` is empty or missing the section file:** The base pull may have only fetched templates and config (old behavior). Re-run the targeted base pull with the full set of `--only` patterns (see orchestrator SKILL.md "Targeted Base Pull"). Do NOT proceed without reading the base section code — you will be guessing at how things are implemented instead of knowing.
3. Read the **base theme's configured values** from `settings_data.json` first, then template JSON as fallback. `settings_data.json` is the source of truth for content because it reflects what the theme editor shows on the live site.
4. **Resolve all Liquid variables in the section CSS** (skip if resolved CSS was loaded from inventory). If the base section's `<style>` block contains `{{settings.something}}` or `{{section.settings.something}}`, look up the actual values in `settings_data.json`. Pay special attention to:
   - Font family, weight, style, and letter-spacing
   - Color values
   - Padding/margin values with theme-level variables
   - Also check the HTML for global CSS classes that apply fonts not visible in the section's `<style>` block
5. Read the **target theme's section `.liquid` file** — its `{% schema %}`, CSS, and HTML structure. **Pay special attention to the `{% schema %}` block**: what settings exist, what presets are available, what font_size/type_preset options can be used. This determines what can be fixed via JSON vs what needs CSS overrides.
6. **Read every block type's schema.** The section schema lists block types by name (e.g., `"type": "text"`, `"type": "menu"`, `"type": "group"`), but the actual settings for each block type live in `blocks/{type}.liquid`. Read the `{% schema %}` of every block type you plan to use. Pay critical attention to:
   - **`visible_if` conditions**: Many settings are conditional. For example, `font`, `font_size`, `line_height`, `letter_spacing`, `case`, and `wrap` on a `text` block may only take effect when `type_preset == "custom"`. If you set these values with `type_preset: "h2"`, they are **silently ignored** by Shopify. You must either use `type_preset: "custom"` (and set all typography explicitly) or accept the preset's defaults.
   - **Available options**: Settings like `font_size` may only accept specific values (e.g., `""`, `"0.625rem"`, `"0.75rem"`, etc.), not arbitrary pixel values. Settings like `line_height` may accept keywords (`"tight"`, `"normal"`, `"loose"`), not numeric values. Check the `options` array.
   - **Native block capabilities**: Check if the theme has native blocks for the content you need (e.g., `menu` for nav links, `social-links` for social icons, `email-signup` for newsletter, `footer-copyright` for copyright). Use native blocks first — they're editable in the theme editor. Only fall back to `custom-liquid` when no native block handles the content or when a third-party integration requires exact HTML.
7. Read the **target theme's configured values** from template JSON

### Step 2.1: Settings Migration Analysis

**Before writing any code, classify every base section setting.** This analysis determines the implementation approach (JSON-only, CSS overrides, custom blocks, or custom section) and preserves the merchant's authoring capabilities without over-engineering.

#### The Rubric

Classify each setting from the base section's `{% schema %}` into one of six categories:

**NATIVE** — Target theme has an equivalent setting. Map the value directly.
- Example: base "Heading Text" → target `text` block with `text` setting
- Example: base "Background Image" → target `image` setting on section
- Implementation: JSON settings only. No code changes. Maximum upgradability.

**MAPPED** — Target theme achieves the same outcome through a different mechanism. The merchant's intent is preserved but the control surface changes.
- Example: per-element color pickers → target theme color scheme
- Example: "Button Style: White" → target button settings or color scheme
- Example: "Show Section" toggle → target theme's built-in section visibility
- Implementation: JSON settings only. Different knob, same outcome.

**CSS-ONLY** — The current value gets hardcoded in CSS overrides. No authoring capability needed because the merchant doesn't change this value.
- Example: "Text Width: 25em", "Text Padding (Desktop): 7em 2em 0 0"
- Example: "Text Shadow: [CSS value]", responsive padding/alignment per breakpoint
- Implementation: CSS override file. Separate from theme code, survives updates.

**EXTEND** — Real authoring capability the merchant uses, and the target theme can't provide natively. Requires a custom block type or extending an existing section's schema.
- Example: base has a "Klaviyo list ID" the merchant changes per-form → custom block
- Example: base has a "Video URL" the target section doesn't support → add video block
- Implementation: Custom blocks are additive, don't modify existing section code. Good upgradability.

**CUSTOM-SECTION** — The base section's authoring model is fundamentally different from the target's. No combination of native settings, CSS overrides, or custom blocks can preserve the merchant's editing workflow. Requires a fully custom `.liquid` section.
- This is the **last resort**. The section is frozen at the target theme version it was forked from. Theme updates won't apply.
- Implementation: Fork the target section. Document which version it was forked from.

**DEPRECATE** — Implementation artifact, dead setting, or concern that should be handled programmatically. Drop it.
- Example: "Make it h1?" → automatic heading hierarchy (first section gets h1)
- Example: "Lazy Load?" → always lazy below fold, eager above
- Example: settings where only one value was ever used across all instances
- Example: responsive visibility toggles → CSS media queries

#### How to Classify

For each setting in the base section's `{% schema %}`:

1. **Check usage**: Read `settings_data.json` for the configured value. Compare against the schema `default`. If value === default across all instances, the merchant never touched it → likely CSS-ONLY or DEPRECATE.

2. **Check variation**: If this section type appears on multiple pages, do the setting values differ across instances? Variation = real authoring need. Uniform = design constant.

3. **Check the target theme**: Does it have a native or mapped equivalent? Read the target section's schema and block schemas.

4. **Apply the decision tree**:
   - Setting value === schema default across all instances? → **CSS-ONLY** or **DEPRECATE**
   - Target has equivalent setting? → **NATIVE**
   - Target achieves same intent differently? → **MAPPED**
   - Value varies AND no target equivalent → **EXTEND** (custom block)
   - 5+ EXTEND settings requiring structural Liquid changes → consider **CUSTOM-SECTION**

#### Produce the Settings Migration Table

Write this table to the debug transcript AND include a summary in the section report.

```
SETTINGS MIGRATION: {section-name}
═══════════════════════════════════════════════════════════════════════════════════
| Base Setting           | Value(s)         | Varies? | Category       | Target Mechanism                |
|------------------------|------------------|---------|----------------|---------------------------------|
| Heading Text           | "$10 off..."     | yes     | NATIVE         | text block → text setting       |
| Background Image       | shop_images/...  | yes     | NATIVE         | section → image setting         |
| Text Width             | 25em             | no      | CSS-ONLY       | gldn-global-overrides.css       |
| Text Padding Desktop   | 7em 2em 0 0      | no      | CSS-ONLY       | gldn-global-overrides.css       |
| Text Padding Tablet    | 0 0 3em          | no      | CSS-ONLY       | gldn-global-overrides.css       |
| Eyebrow Color          | #FDFDFD          | no      | MAPPED         | color scheme (scheme-1)         |
| Title Color            | #FDFDFD          | no      | MAPPED         | color scheme (scheme-1)         |
| Arrow Buttons Color    | #FDFDFD          | no      | MAPPED         | color scheme (scheme-1)         |
| Text Shadow            | [css value]      | no      | CSS-ONLY       | gldn-global-overrides.css       |
| Button Version         | White            | no      | MAPPED         | button style + color scheme     |
| Make it h1?            | true             | yes*    | DEPRECATE      | auto heading hierarchy          |
| Klaviyo List ID        | HMuMXy           | no      | EXTEND         | custom-liquid block             |
═══════════════════════════════════════════════════════════════════════════════════
SUMMARY: 2 NATIVE, 3 MAPPED, 4 CSS-ONLY, 1 EXTEND, 0 CUSTOM-SECTION, 1 DEPRECATE
APPROACH: Target section + CSS overrides + 1 custom block
UPGRADABILITY: HIGH — no modifications to target section code
```

* "varies by page position, not merchant choice" = DEPRECATE

#### The Upgradability Decision

The table summary drives the implementation approach:

- **All NATIVE + MAPPED + CSS-ONLY + DEPRECATE** → Use the target theme's existing section. Best upgradability. This should be the outcome for most sections.
- **Some EXTEND** → Target section + custom blocks. Blocks are additive, survive theme updates. Good upgradability.
- **Heavy EXTEND (5+ settings needing structural Liquid changes)** → Flag for user: "This section needs N custom settings that can't be handled with custom blocks. Options: A) Accept reduced authoring capability, B) Fork as custom section (breaks upgradability for this section)."
- **CUSTOM-SECTION** → Fork the target section. Document the fork version. Accept the maintenance cost.

#### Patterns to Watch For

**Developer-facing workarounds exposed as merchant settings** — DEPRECATE these:
- Heading hierarchy (`h1`/`h2`/`h3` toggles) → handle programmatically
- Responsive visibility toggles → CSS media queries
- "Full Width?" → target theme's section width settings
- "Lazy Load?" → standard browser lazy loading
- Any setting with only one value ever used

**Per-element color pickers that all use the same value** — MAPPED to a color scheme. If the base section has 5 color pickers (eyebrow, title, text, button, arrow) and they're all `#FDFDFD`, that's one color scheme, not 5 settings.

**Responsive design tokens set once and never changed** — CSS-ONLY. Text width, padding per breakpoint, alignment per breakpoint, gap values. These are design decisions baked in during the original build.

**This step gates Step 3.** Do not write JSON or CSS until the settings migration table is complete. The table IS the implementation plan for this section.

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

### Step 2.75: Build the Spec Sheet (Mandatory)

**Before writing ANY settings or CSS**, build a complete spec sheet for this section. The base theme source code is the primary reference — you already have it in `.theme-forge/base-cache/`. The browser is for verification, not discovery.

#### 2.75a: Extract values from base theme source (primary)

You already read the base section in Step 2. Now resolve every visual property to a concrete value:

1. **From `settings_data.json`**: Section settings (colors, text-align, padding, font choices, toggle states)
2. **From the section's `<style>` block**: CSS rules with Liquid variables resolved to their `settings_data.json` values
3. **From the section's `{% schema %}`**: Default values for settings not overridden in `settings_data.json`
4. **From referenced snippets/assets**: Shared CSS, JS form handlers, typography mixins

Build the spec table from source:

```
SOURCE SPEC: {section-name} on {page}

Element               | Property         | Value              | Source
----------------------|------------------|--------------------|---------------------------
section container     | text-align       | center             | settings_data.json → text_align
section container     | padding          | 7em 2em 0 0        | settings_data.json → text_padding
h1                    | font-family      | Spectral, serif    | global font setting
h1                    | font-weight      | 200                | section CSS → .cta-heading
body text             | font-weight      | 300                | global CSS → body
button                | text-transform   | uppercase          | section CSS → .btn
button                | letter-spacing   | 1.2px              | section CSS → .btn
grid container        | grid-template    | 1fr 1fr 1fr 2fr    | section CSS → .grid
grid container        | gap              | 8px                | section CSS → .grid
```

The "Source" column traces each value back to a specific file and location. This is your primary spec for Steps 3-7.

#### 2.75b: Browser extraction for verification (secondary)

After building the source spec, use the browser to verify values that involve CSS cascade, inheritance, or calc() — things that are hard to resolve by reading source alone. This catches:
- Inherited styles from parent elements or global CSS
- Computed values from CSS variables or calc() expressions
- Overrides from higher-specificity selectors elsewhere in the theme
- Values set by JavaScript at runtime

Navigate to the live page and extract computed styles for each element type (section container, headings, body text, buttons, links, images). Run at desktop (1280px) at minimum, plus tablet (768px) and mobile (375px) if the section has responsive breakpoints.

**Compare source spec vs browser extraction.** If they disagree, the browser wins — it shows what the user actually sees. Update the spec table with the browser value and note the discrepancy in the transcript. This usually means a CSS cascade issue the source reading missed.

**If the browse tool is unavailable**, proceed with the source-only spec from 2.75a. Mark the report as `extraction_method: "source_analysis"` to flag that browser verification was skipped.

### Step 3: Align Settings (JSON)

Using the computed value table from Step 2.5 and the extraction data from Step 2.75, apply all setting changes via JSON (template config or `settings_data.json`):

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

#### Custom Section Spec Sheet (when creating a new section)

When the mapping recommends `extension_section` or `custom_from_scratch`, you MUST produce a settings spec before writing any code. Use the extraction data from Step 2.75.

Write a spec to the transcript:

```
SECTION SPEC: gldn-cta-gallery
LAYOUT: CSS Grid, 4 columns (1fr 1fr 1fr 2fr), 2 rows, gap: 8px
CONTAINER: max-width 1296px, padding 0 72px, background rgb(253, 253, 253)

ELEMENT: Category tile image
  width: 100%, height: 100%, object-fit: cover

ELEMENT: Category label (on hover)
  font-family: freight-sans-pro, font-size: 12px, font-weight: 400
  letter-spacing: 1.2px, color: rgb(253, 253, 253), text-transform: none

ELEMENT: Feature title
  font-family: Spectral, font-size: 32px (2rem), font-weight: 200
  letter-spacing: -0.32px (-0.02em), color: rgb(253, 253, 253), line-height: 1.1

ELEMENT: CTA button
  font-family: freight-sans-pro, font-size: 12px, font-weight: 400
  letter-spacing: 1.2px, text-transform: uppercase
  background: rgb(253, 253, 253), color: rgb(51, 51, 51)
  padding: 14px 24px, min-width: 176px
```

Every CSS value in the custom section MUST come from this spec, and every spec value MUST come from the Step 2.75 extraction. No guessing font sizes or spacing values. If a value isn't in your extraction table, go back and extract it — do not approximate.

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

**If no reference exists:** Run the capture workflow with `--reference {section}-{page}`:
- URL: the live site page URL
- Section: the CSS selector or index for this section
- Output: `.theme-forge/references/{section}-{page}/`

After capture, **read `desktop.png`** with the Read tool. Verify the screenshot shows the correct section with all content loaded (images visible, text rendered, no blank areas). If the capture looks wrong, retry once. If still wrong, note the issue and continue with code-only analysis.

#### 4.2 Dev site capture

Run the capture workflow (screenshots only):
- URL: the dev server URL (e.g., `http://127.0.0.1:9292`)
- Section: same selector as live site
- Output: `.theme-forge/tmp/capture-dev/`

#### 4.3 Run find-variances (extraction + comparison) — MANDATORY

> **This step is NOT optional.** Steps 5-10 depend on the structured `variances` array
> that only find-variances produces. If you skip this step, you will be blocked at Step 5
> and again at Step 10. Do not attempt to extract computed styles yourself.

Invoke the `find-variances` skill:

```
/theme-forge find-variances <section-key> --page <page>
```

find-variances navigates both live and dev sites, extracts computed styles at all 3 breakpoints, compares property-by-property, runs the rendered output validation checklist, and writes the structured variance array to the section report. Each variance includes a test condition for refine-section to execute.

**Verify after completion:** Read the section report and confirm the `variances` array exists. If it doesn't, find-variances failed — check its output for errors and retry.

#### 4.4 Compare screenshots at each breakpoint

For **desktop, tablet, and mobile**:
1. Read the live reference screenshot and the dev screenshot side by side
2. List every visual difference you can see:
   - **Structural layout**: elements, positioning, proportions
   - **Element presence/absence**: missing or extra elements
   - **Colors and typography**: fonts, weights, sizes, spacing
   - **Images**: loaded vs placeholder, sizing, cropping
3. Cross-reference visual differences against the variance array from find-variances. If you see a visual difference NOT captured in the variance array, add it manually: `/theme-forge find-variances <section-key> --add "description of what you see"`
4. Categorize remaining visual-only differences by severity (HIGH / MEDIUM / LOW)

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

> **HARD GATE: Before proceeding, verify the `variances` array exists in the section report.**
> Read `.theme-forge/reports/sections/{section-key}.json` and check for the `variances` field.
> - **If `variances` array exists**: Proceed. This is your work queue.
> - **If `variances` array is missing**: STOP. Go back and run Step 4.3 (`/theme-forge find-variances`). You cannot identify or fix variances without the structured extraction.
> - **If the report has old-style `variances_found`/`variances_fixed` counters but no `variances` array**: The report was written by an older workflow. Run find-variances to upgrade it — find-variances will merge new entries without losing existing data.

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
- **App integration variance**: Live section renders an app-powered feature (star ratings, payment installments, loyalty points, wishlist icons, personalization builders) that is missing or non-functional on the dev site. → Follow the three-step app migration process (scaffold position, enable embed, verify). This is NOT a cutover item — it is an open variance that must be fixed or escalated.
- **Settings variance (layout/presentation)**: Template JSON settings produce a different layout than the live site (e.g., image gallery in grid vs slideshow, wrong column count, different media presentation). → Fix in template JSON (Step 3). These are often invisible to CSS-level comparison because they affect DOM structure, not computed styles.
- **Accepted variance**: Matches a variance in `learnings.json` with `accepted: true` that was explicitly approved by the user during a prior session. **You (the agent) may NEVER create a new accepted variance on your own.** Only the user can accept a variance, and only by explicitly saying so. "Global theme setting" or "theme default" is not an acceptable reason to skip a fix — override it with CSS.

**Check learnings before planning fixes.** For each CSS variance, check if a learning applies:
- Does a learning say this property needs `!important`? Apply it from the start.
- Does a learning say to use a specific approach for this pattern? Follow it.
- Does a learning say this variance is acceptable? Mark it accepted.

This is how theme-forge one-shots sections: learnings from prior sections prevent re-discovering the same issues.

**Address structural variances FIRST.** Do not start CSS work until the HTML structure matches.

### Step 5.5: Inspect the Rendered DOM (Mandatory for CSS overrides)

> **HARD RULE: Never guess CSS selectors.** Before writing ANY CSS override, inspect the
> actual rendered DOM on the dev site to discover the correct selectors. Themes like Horizon
> use web components and Shadow DOM — the rendered DOM is different from what `.liquid` files
> suggest. A selector that looks right from reading the source may match nothing at runtime.

**For each element you plan to style:**

1. **Navigate to the dev site** and run JavaScript to discover the actual DOM path:
   ```javascript
   // Example: find where the product title actually renders
   function findElement(root, textOrTag, depth = 0) {
     const results = [];
     for (const el of root.querySelectorAll('*')) {
       if (el.matches(textOrTag) || el.textContent?.trim().startsWith(textOrTag?.slice(0, 20))) {
         results.push({ tag: el.tagName, classes: [...el.classList], parent: el.parentElement?.tagName });
       }
       if (el.shadowRoot) results.push(...findElement(el.shadowRoot, textOrTag, depth + 1));
     }
     return results;
   }
   ```

2. **Check for Shadow DOM boundaries.** If the element is inside a shadow root:
   - You CANNOT style it with normal CSS selectors
   - Check if the web component exposes CSS custom properties (`--var-name`) — these cascade through Shadow DOM
   - Check if the component uses `::part()` — allows external styling of named parts
   - Check if there's a JSON setting that controls the value — **settings always beat CSS**

3. **Check for CSS custom properties.** Run on the dev site:
   ```javascript
   // Get all custom properties on the product section
   const section = document.querySelector('.shopify-section--product-information');
   const styles = getComputedStyle(section);
   // Look for relevant custom properties
   const props = [...document.styleSheets].flatMap(s => {
     try { return [...s.cssRules] } catch { return [] }
   }).filter(r => r.selectorText?.includes('product')).map(r => r.cssText).join('\n');
   ```

4. **Record the working selector** in the debug transcript before writing CSS. Format:
   ```
   SELECTOR DISCOVERY: product title
   Target element: <h1> inside product-information-block shadow root
   Approach: CSS custom property --heading-font-size on host element
   Selector: product-information .product-details { --heading-font-size: 28px; }
   ```

5. **Settings-first rule.** Before writing a CSS override, verify the value isn't controlled by a JSON setting:
   - Read the section's `{% schema %}` and block schemas for settings that control the property
   - Check `settings_data.json` for the current value
   - **If a setting exists, change the setting** — don't override it with CSS. CSS overrides on top of wrong settings create fragile, hard-to-debug styling.
   - Example: `variant_button_width: "equal-width-buttons"` in settings fights CSS swatch overrides. Change the setting to `"auto"` first.

### Step 6: Apply CSS Overrides

**Before writing any CSS, consult the global maps loaded in Step 1:**
- Check `class-map.json` for the correct target theme class names (e.g., base `.btn` → target `.button`)
- Check `settings-map.json` for typography/color overrides already identified (e.g., heading weight 200 vs 400)
- Check `class-map.json` → `custom_properties` for the correct CSS variable names

For CSS variances, apply fixes in order of preference:

1. **JSON settings** — always first. If a setting controls the property, change the setting.
2. **CSS custom properties** — override `--var-name` on the host element or `:root`. These cascade through Shadow DOM.
3. **Section's own `{% stylesheet %}` block** — for custom sections we control
4. **Extension CSS file** (e.g., `assets/custom.css`) — for overriding core sections. Use selectors verified in Step 5.5.
5. **Inline `style` attribute via Liquid** — for per-instance values driven by settings

**One change at a time.** Apply ONE CSS fix, save the file, wait for hot-reload, then verify visually (screenshot or browser check) before writing the next fix. Do NOT batch multiple unrelated CSS changes into one edit — when something breaks, you can't tell which change caused it. Commit after each verified fix, not after a batch of untested changes.

Guidelines:
- **Use only selectors verified against the actual rendered DOM (Step 5.5).** Never write a CSS selector by guessing from the `.liquid` source.
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

1. Run the `capture` workflow on the dev URL. Output to `.theme-forge/tmp/capture-verify/`. This produces screenshots at all three breakpoints (desktop, tablet, mobile).
2. For each breakpoint, read the dev screenshot and compare against the stored live reference in `.theme-forge/references/{section}-{page}/`. The live reference is NOT re-captured.
3. Compare against the live site screenshot. Check:
   - The specific variance — is it fixed?
   - No regressions — did the fix break anything else?
4. **Run find-variances for full re-extraction.** This is mandatory, not optional. find-variances re-extracts dev styles, compares against cached live values, and updates the variance array in the section report. It runs the full rendered output validation checklist (18 checks). Each variance entry's status is updated: `fixed` if dev now matches live, `open` if still different.

   Read the updated variance table from the section report. Any `open` entries are FAILs that must be fixed.

5. If any `open` variances remain, proceed to Step 9 (Report & Recommend).

   > **HARD RULE: If a variance shows the SAME dev value as before your fix, your selector
   > is wrong.** The variance's test condition includes the selector used. If the test condition
   > has `custom_property` set, try overriding that custom property instead of direct CSS.
   > If it has `shadow_host` set, your selector needs to target through or around the Shadow DOM.

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

**Only option B creates an accepted variance**, and it sets `user_approved: true` in the variance entry AND the report. The agent CANNOT set `user_approved: true` on its own.

6. **Capture learnings — on EVERY successful fix, not just retries.**
   After verification passes, review each CSS override or settings change you made. For each fix, ask: *"Would this same issue appear in other sections?"* If yes, write a learning to `.theme-forge/learnings/{section-key}.json`.

   **When to capture:**
   - **Retry fixes** (first attempt failed): Record the anti-pattern AND the working fix.
   - **Theme default overrides** (first attempt succeeded but overrode a target theme default): The same default applies to every section.
   - **Pattern recognition**: Same fix on 2+ sections. Promote to a learning.

   The key insight: **if you had to override a theme default to match the live site, the next section will have that same default.** Capture it now so the next section one-shots it.

#### Theme Constants (after the first section)

After completing the FIRST section (usually header), identify values that are theme-wide constants vs section-specific overrides. Theme constants apply to every section and should be captured as learnings with `scope: "target_theme"` so every subsequent section applies them automatically in Step 3 — before any screenshots, not rediscovered in Step 8.

**Theme-wide constants** (apply to ALL sections — capture these):
- Font families (heading, body, subheading)
- Default font weights (body, heading, strong/bold)
- Default letter-spacing (heading, body)
- Button base styles (font-size, font-weight, letter-spacing, text-transform, padding)
- Link decoration styles
- Color scheme RGB values for common backgrounds

**Section-specific values** (apply only to ONE section — do NOT generalize):
- Section padding (hero has different padding than footer)
- Section background color (each section may use a different scheme)
- Section-specific font sizes (hero h1 is larger than footer h2)
- Layout dimensions (grid columns, flex ratios, container max-widths)

### Step 9: Report & Recommend

After Step 8, check the variance array in the section report for `open` entries.

**If ALL variances are `fixed` or `accepted`:** Set status to `completed`. Proceed to Step 10 (Final Validation Gate).

**If `open` variances remain:** Set status to `needs_refinement`. Present the remaining variances and recommend refine-section:

```
PULL COMPLETE: {section-key} — {fixed_count}/{total_count} variances fixed
════════════════════════════════════════════════════════════
Status: needs_refinement ({open_count} open variances remain)

REMAINING VARIANCES:
#  Element              Property         Live           Dev            Type
1  h1                   fontWeight       200            700            setting
2  .price-money         fontWeight       300            500            css
════════════════════════════════════════════════════════════
To close remaining variances, run:
  /theme-forge refine-section {section-key} --page {page}
```

refine-section uses a disciplined one-change-at-a-time experiment loop with per-element DOM inspection and per-fix learnings. It reads the variance array from the section report as its work queue.

Proceed to Step 10 regardless of whether variances remain.

### Step 10: Final Validation Gate

**You cannot declare a section "done" without passing this gate.** This is not optional.

> **HARD GATE: The section report MUST contain a `variances` array.**
> If the report does not have a `variances` array, you skipped find-variances. STOP.
> Go back to Step 4.3 and run find-variances before declaring anything "done."
> A report with only `variances_found`/`variances_fixed` counters (no array) is INVALID.

1. **Read the variance array from the section report.** Display the final variance table:

```
Breakpoint | Element              | Property         | Live         | Dev          | Status
-----------|----------------------|------------------|--------------|--------------|--------
desktop    | h1                   | fontWeight       | 200          | 200          | fixed
desktop    | .price-money         | fontWeight       | 300          | 300          | fixed
desktop    | .add-to-cart         | fontSize         | 13px         | 13px         | fixed
tablet     | h1                   | fontWeight       | 200          | 200          | fixed
mobile     | section              | paddingTop       | 80px         | 80px         | fixed
desktop    | h1                   | letterSpacing    | 0.1em        | 0.05em       | open
```

2. **If ALL entries are `fixed` or `accepted`:** Set report status to `completed`.

3. **If ANY entry has `status: "open"`:** Set report status to `needs_refinement`. This is the expected outcome when pull-section gets close but doesn't fully match. The user runs `refine-section` separately to close remaining gaps.

4. **Read the final screenshots** (desktop, tablet, mobile) from the last Step 8 capture. Visually confirm they match the live references at each breakpoint. If you see ANY visual difference not captured in the variance array, add it with `/theme-forge find-variances <section> --add "description"` and fix it.

5. No separate responsive pass is needed. All three breakpoints have been compared throughout the entire fix loop (Steps 4-8-10).

**You MUST show the final variance table in your output.** The user needs to see the evidence of what was fixed and what remains. A section reported as "completed" or "needs_refinement" without a variance table is a bug in your process.

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

Delta table: {fixed_count}/{total_count} variances fixed, {open_count} remaining
Files modified: {list}
Status: {completed | needs_refinement}

A) Looks good — finalize with current status
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
  "status": "completed",  // or "needs_refinement" if open variances remain
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

**Clean up unpublished theme (if applicable):** After a successful commit, run:
```bash
scripts/dev-server.sh cleanup
```
This stops the dev server, deletes the unpublished theme if this session created one, and scans for orphaned `[TF]` themes. This frees theme slots on the store (99-theme limit).

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

**Port the JavaScript, not just the HTML.** Third-party forms almost always depend on JS for:
- **AJAX submission** (e.g., Klaviyo's `data-ajax-submit` attribute, Mailchimp's `mc-embedded-subscribe-form`). Without JS, the form falls back to a full page redirect or opens a new tab.
- **Success/error state handling** (showing a "Thanks!" message, hiding the form, displaying validation errors). Without JS, the success `<div>` stays hidden forever.
- **Tracking/analytics** (firing conversion events on submit).

**How to handle form JS:**
1. Check the base theme's JS files for form handling code. Search for the form's class name, action URL, or `ajax` references in `assets/*.js` and `snippets/*.liquid`.
2. If the base theme has custom JS for the form, port it to a snippet or inline `<script>` in the custom-liquid block.
3. If the form depends on the third-party's JS (loaded via app embed), add a **lightweight inline fallback** so the form works even when the app JS hasn't loaded:
   ```html
   <script>
     (function() {
       var form = document.querySelector('.your-form-class');
       if (!form) return;
       form.addEventListener('submit', function(e) {
         var ajaxUrl = form.getAttribute('data-ajax-submit');
         if (!ajaxUrl) return; // let native form handle it
         e.preventDefault();
         var data = new FormData(form);
         var params = new URLSearchParams(data).toString();
         fetch(ajaxUrl + '?' + params)
           .then(function() {
             form.querySelector('.success-msg').style.display = 'block';
             form.querySelector('.form-wrap').style.display = 'none';
           })
           .catch(function() { form.submit(); }); // fallback to native submit
       });
     })();
   </script>
   ```
4. Test the form on the dev site. Click submit with a test email. Verify: does the success message appear? Does the page redirect? Does the submission reach the provider?

**App embeds vs form HTML — they serve different purposes:**
- The **app embed** (e.g., `klaviyo-onsite-embed` in `settings_data.json` global blocks) loads the third-party's tracking JS, popups, and onsite features. It does NOT render the footer form.
- The **footer form** is custom HTML in a `custom-liquid` block. It renders and submits independently of the app embed.
- Preserve BOTH: the app embed in `settings_data.json` (for popups/tracking) AND the form HTML in the section (for the actual signup).
- Theme-forge uses dev themes on the **same store** as the live theme. If the app is installed on the store (it is — the live site uses it), the embed works on all themes including unpublished dev themes. Copy the app embed block from the live theme's `settings_data.json` to the target theme's `settings_data.json` to enable it. If the embed doesn't render after copying, create a variance with `status: "open"` — do NOT park it as a cutover item.

### Block Schema Settings Are Conditional (`visible_if`)
**Many block settings are silently ignored if their `visible_if` condition isn't met.** This is the most common cause of "I set the setting but nothing changed." Shopify doesn't error — it just ignores the value.

**The #1 offender:** The `text` block's typography settings (`font`, `font_size`, `line_height`, `letter_spacing`, `case`, `wrap`) all have `visible_if: "{{ block.settings.type_preset == 'custom' }}"`. If you set `type_preset: "h2"` and also set `font_size: "1.5rem"`, the `font_size` is ignored — the block uses the h2 preset's default size.

**What to do:**
- Before setting any block value, read the block's `{% schema %}` in `blocks/{type}.liquid`
- Check every setting for a `visible_if` condition
- If you need custom typography (specific font size, weight, letter spacing), you MUST use `type_preset: "custom"` — then set ALL the typography fields explicitly
- If you use a preset like `"h2"` or `"rte"`, do NOT set typography fields — they're ignored

**Common conditional patterns in Horizon:**
- `text` block: typography fields require `type_preset: "custom"`
- `group` block: `color_scheme` requires `inherit_color_scheme: false`
- `menu` block: `accordion_icon` and `accordion_dividers` require `show_as_accordion: true`
- `text` block: `alignment` requires `width: "100%"`
- `text` block: `background_color` and `corner_radius` require `background: true`

### Native Blocks Before `custom-liquid`
**`custom-liquid` blocks are an escape hatch, not a default.** When the agent can't immediately see how to use a native block, it tends to dump raw HTML into `custom-liquid`. This produces a footer/section that "works" but:
- Is not editable in the Shopify theme editor (merchants see a code blob)
- Doesn't inherit theme typography, colors, or spacing updates
- Breaks when the theme updates its CSS class names
- Hardcodes URLs, social links, and menu items that should come from Shopify settings

**Decision tree for each piece of base content:**
1. Does the target theme have a native block for this? (e.g., `menu` for nav, `social-links` for social icons) → **Use the native block.** Read its schema, configure its settings.
2. Is this a third-party integration that requires exact HTML? (e.g., Klaviyo form with specific `action` URL and hidden fields) → **Use `custom-liquid`.** This is the correct use case.
3. Does the base theme have a unique layout not achievable with native blocks? (e.g., interleaved social icons within a menu column) → **Try native blocks with CSS overrides first.** Use a `group` with `menu` + `social-links` blocks and CSS positioning. Only use `custom-liquid` if CSS can't achieve the layout.

**Real example (GLDN footer):**
- BAD: `custom-liquid` with hardcoded `<nav>` HTML, inline SVGs, and `linklists.footer.links` Liquid → not editable, SVGs break on theme update
- GOOD: `menu` block (menu: "footer", heading: "", link_preset: "paragraph") + `social-links` block (facebook_url: "...", instagram_url: "...", pinterest_url: "...") → editable in theme editor, inherits theme styles

### Setting Values Must Match Schema Options
**Block settings with `options` arrays only accept values from that list.** Setting an arbitrary value silently falls back to the default.

**Examples:**
- `text` block `font_size` accepts `""`, `"0.625rem"`, `"0.75rem"`, `"0.875rem"`, `"1rem"`, etc. — NOT `"15px"` or `"14px"`
- `text` block `line_height` accepts `"tight"`, `"normal"`, `"loose"` — NOT `"1.4"` or `"24px"`
- `text` block `width` accepts `"fit-content"` or `"100%"` — NOT `"fill"` or `"50%"`
- `menu` block `heading_preset` accepts `""`, `"paragraph"`, `"h1"` through `"h6"` — NOT `"body"` or `"small"`

**What to do:** Read the schema. If the value you want isn't in the `options` array, pick the closest match from the available options, then use CSS overrides for the exact value.

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
