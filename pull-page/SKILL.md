---
name: pull-page
description: >
  Pull all sections on a Shopify page sequentially using pull-section. Works top-to-bottom, then does a full-page visual comparison.
  - MANDATORY TRIGGERS: theme-forge pull-page, pull page, match page, fix page
---

# pull-page — Pull All Sections on a Page

Execute `pull-section` on every section in a page's template, working top to bottom. After all sections are pulled, do a full-page visual comparison.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)

## Arguments

```
/theme-forge pull-page [page-path]
```

Defaults to `index` (homepage) if omitted.

## Workflow

### Step -2: Verify Branch Strategy

Before any work, verify that shared foundations are on main:

1. **Check main has globals:** `git log main --oneline | grep -q "apply global settings"`. If not, STOP:
   > **Global settings are not on main.** Merge the scan/globals branch to main first. Without this, page branches won't have the correct baseline (fonts, colors, spacing will be wrong).

2. **Check main has header/footer** (if they've been pulled): `git log main --oneline | grep -q "pull: header"`. If header/footer reports exist but aren't on main, recommend merging first.

3. **Branch from main for this page** (if not already):
   ```bash
   git checkout main
   git pull
   git checkout -b pull-page-{page}
   ```
   Each page gets its own branch off main. This enables parallel sessions and clean PRs.

4. **Push the branch immediately** so it's visible in VS Code and to other collaborators:
   ```bash
   git push -u origin pull-page-{page}
   ```
   Do not wait until the first section is done. Push the branch as soon as it's created.

### Step -1: Git Pull + Globals Check

1. **`git pull origin main`** to get the latest shared state.
2. **Check global maps:** Look for `.theme-forge/settings-map.json` and `.theme-forge/class-map.json`. If either is missing, STOP and recommend scan first:

   > **Global maps not found.** Running pull-page without global maps means every section independently rediscovers theme settings and CSS class mappings. This is slower and more error-prone.
   >
   > A) Run `/theme-forge scan` first (recommended) — generates global maps and applies global settings (~2 min)
   > B) Continue without maps — I'll figure it out per-section

   **Wait for the user's choice.** If A, run scan (which includes `--apply-globals`), then resume from here.

3. **Check header/footer:** Look for `.theme-forge/reports/sections/header.json` and `footer.json` with `status: "completed"`. If both exist, globals are done. If not, ask: "Header/footer haven't been pulled yet. Run them now before starting page sections?" If yes, run `pull-header` and `pull-footer`, commit changes, and push.
4. **Read global standards:** Load `.theme-forge/mapping-rules.json`, all files in `.theme-forge/learnings/`, and `.theme-forge/conventions.json` (if they exist).

### Step 0: Targeted Base Pull

Pull code, templates, and settings from the live theme (~10-15 seconds, always fresh):

```bash
mkdir -p .theme-forge/base-cache && git -C .theme-forge/base-cache init 2>/dev/null
shopify theme pull --theme <live_theme_id> \
  --only 'templates/*' --only 'config/*' \
  --only 'sections/*' --only 'snippets/*' \
  --only 'blocks/*' --only 'layout/*' \
  --only 'assets/*.css' --only 'assets/*.js' \
  --path .theme-forge/base-cache/
```

The `live_theme_id` comes from `.theme-forge/config.json`. The base-cache directory is gitignored (session-local). Sections, snippets, blocks, and layout are needed to understand how the base theme implements its features (form handlers, JS, conditional logic, custom blocks).

### Step 0.3: Scoped Scan + Map

Check if `.theme-forge/mappings/pages/{page}.json` exists. If not, run a scoped scan:

1. Read `templates/{page}.json` from the target theme
2. Read `templates/{page}.json` from `.theme-forge/base-cache/`
3. Cross-reference sections, applying rules from `.theme-forge/mapping-rules.json`
4. Write `mappings/pages/{page}.json` and `mappings/sections/*.json` for each new section
5. Add any new mapping rules to `mapping-rules.json`
6. Commit the mappings and push

### Step 0.5: Global Settings (first run only)

Before pulling any sections, verify that global theme settings are correct. These affect every section and must be set first:

1. **Logo**: Check `settings_data.json` for the logo image field. Copy the logo reference from the base theme's `settings_data.json` (in `.theme-forge/base-cache/config/settings_data.json`). If the field name differs between themes, find the equivalent field in the target theme's `config/settings_schema.json`.
2. **Favicon**: Extract the favicon from the live site's HTML using the browse tool:
   ```javascript
   document.querySelector('link[rel="icon"], link[rel="shortcut icon"]')?.href
   ```
   If the live site has a favicon, set it in the target theme's `settings_data.json`. The favicon field is typically `favicon` under the global `current` settings. Use the `shopify://shop_images/filename.ext` reference if the image is already in the store's files, or note it for manual upload if it's served from a CDN path. If the live site has no favicon, skip this step.
3. **Global fonts**: Compare `--font-body-family` and `--font-heading-family` (or equivalent) between themes. Set the target's font settings to match the live site. Check font weight especially — some themes default to 700 for headings while others use 400.
4. **Global color schemes**: Read the live site's color schemes from `settings_data.json`. For each scheme used by sections on this page, ensure a matching scheme exists in the target theme (matched by RGB values, not by name). Create new named schemes if needed.
5. **Body text size**: Compare the base paragraph font size between themes. Set the target's paragraph size setting to match.

**IMAGE SOURCING RULE**: Images do NOT need to be uploaded or set via the Shopify admin. The store's images already exist on Shopify's CDN. Copy image references (`shopify://shop_images/filename.ext`) from the **base theme's** `config/settings_data.json` (`.theme-forge/base-cache/config/settings_data.json`) to the **target theme's** `config/settings_data.json`. These URLs resolve to the store's CDN automatically — they work in any theme on the same store. **Never tell the user images need to be uploaded manually.** If an image shows a placeholder, go back and copy the correct URL from the base theme.

**Save global settings locally** — write the updated `settings_data.json` to the target theme directory. If `shopify theme dev` is running, it will hot-reload the changes automatically. **Do NOT run `shopify theme push`** — all changes stay local until the user explicitly approves a push. The dev preview server (`shopify theme dev`) serves files from the local directory, so pushing is unnecessary for development work.

### Step 0.6: Verify Browse Tool

Before pulling any sections, verify the browse tool is available. **The browse tool is a CLI binary you run via Bash — it is NOT a named tool in your tool list.** You will not see "browse" listed in your tools. That's normal.

**Run this via Bash:**
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && [ -x "$B" ] && echo "BROWSE READY: $B" || echo "NOT FOUND"
```

- **`BROWSE READY`**: The browse binary path is printed. Use this path (prefixed with `B=<path> &&`) in every Bash command that needs the browse tool — shell variables do not persist between Bash calls.
- **`NOT FOUND`**: Check alternate location: `B="$(git rev-parse --show-toplevel)/.claude/skills/gstack/browse/dist/browse" && [ -x "$B" ] && echo "BROWSE READY: $B"`. If still not found, check for Playwright MCP tools (`mcp__playwright__*`). If nothing is available, proceed in code-only mode for all sections.

**Do NOT decide browse availability by inspecting your tool list.** The browse binary is a CLI, not a named tool. Always run the Bash check.

**Do NOT attempt visual verification with curl, WebFetch, or other non-browse tools.** These return HTML/markdown, not rendered pages.

### Step 0.8: Start Dev Server

Follow the **Dev Server Protocol** in the orchestrator `SKILL.md`. This finds an open port, starts with `--theme` + `--port`, saves `dev_port`/`dev_url`/`dev_preview_url`/`dev_editor_url` to config, and presents the session URLs to the user.

If the server is already running (config has `dev_port` and the process matches port + theme ID), reconnect to it. Do not start a second server.

The dev server runs in the background for the duration of the session and hot-reloads local file changes automatically.

### Step 1: Parse Template

1. Load config and read the page's template JSON from the **target theme** (since we're modifying the target)
2. Cross-reference with the **base theme's** template (in `.theme-forge/base-cache/`) to identify the source section for each. **IMPORTANT**: Use only the active template file (e.g., `templates/index.json`), never alternate templates like `index.sl-*.json` or `index.*.json`. The base theme export may contain dozens of old/unused alternate templates with stale content. The active template is the one without a suffix, or the one referenced in `config/settings_data.json`.
3. **Content comes from `settings_data.json`**: Many themes store section content (headlines, descriptions, button text) in `config/settings_data.json` under the section's key, not in the template JSON. Always check `settings_data.json` first for content values. The template JSON defines structure; `settings_data.json` defines content.
4. Use the page mapping at `.theme-forge/mappings/pages/{page-path}.json` for ordering (created during scoped scan in Step 0.3)

### Step 2: Determine Section Order

Pull sections in this order:
1. Sections already mapped as `compatible` (quick wins)
2. Sections mapped as `partially_compatible`
3. Sections mapped as `requires_customization`
4. Sections mapped as `incompatible`

Within each group, maintain the top-to-bottom page order.

> **HARD RULE: Every section gets attempted.** You may NOT skip a section because it
> "requires custom section" or is "incompatible." Those classifications describe the
> *approach* needed, not a reason to skip. `requires_customization` means build a custom
> section. `incompatible` means build a custom section with more effort. The only valid
> reasons to skip are: (1) it's an app embed that loads at runtime, or (2) the user
> explicitly tells you to skip it via `AskUserQuestion`.
>
> **HARD RULE: No self-skipping.** If you believe a section should be skipped, you MUST
> escalate to the user via `AskUserQuestion` with your reasoning. The user decides, not you.
> Do NOT write a report with `status: "skipped"` without user approval.

### Step 3: Pull Each Section

For each section:

1. **`git pull`** to get the latest state (another session may have completed sections since we started)
2. Check if a report already exists at `.theme-forge/reports/sections/{section-type}.json`
   - If yes and `status` is `completed` or `completed_code_only`, skip
   - If yes and `status` is `failed`, skip (use `--retry-failed` to delete failed reports first)
   - If yes and `status` is `skipped`, skip
3. Run `pull-section` on it. **Pass `--css-file assets/custom-migration-{page}.css`** so CSS overrides go to the per-page file. **Thread debug mode through:** if `--debug` was passed to pull-page, or if `.theme-forge/config.json` has `"debug": true` (and `--no-debug` was NOT passed), invoke pull-section with `--debug` so each section gets its own debug directory.
4. After each section completes, **validate the report quality** before counting it as done:
   - Read `.theme-forge/reports/sections/{section}.json`
   - Check: `files_modified` is non-empty (work was actually done)
   - Check: `screenshots` array is non-empty (visual verification happened)
   - Check: every entry in `variances_accepted` (if any) has `user_approved: true`
   - Check: `variances_found == variances_fixed + variances_remaining` (math checks out)
   - Check: `final_status` is NOT `"completed"` when `variances_remaining > 0`
   - Check: responsive breakpoints were verified (tablet + mobile, not just desktop)
   - **If any check fails**, flag via `AskUserQuestion`:
     ```
     Section {section} report has quality issues:
     - {list failing checks}

     A) Re-run pull-section for this section
     B) Accept report as-is and continue
     C) Skip this section
     ```
   - **If the section was skipped without user approval** (no `AskUserQuestion` was called), **this is a bug**. Re-run the section — skips require explicit user approval.
5. After each section completes validation, **commit and push**:
   ```bash
   git add .theme-forge/reports/sections/{section}.json \
           .theme-forge/learnings/ \
           .theme-forge/mapping-rules.json \
           sections/ templates/ assets/ snippets/ config/
   git commit -m "pull: {section} on {page} — completed"
   git push -u origin $(git branch --show-current)
   ```
   **Always use `git push -u origin <branch>`.** Plain `git push` fails silently if no upstream is set. Using `-u` every time is safe (it's a no-op if upstream already exists) and guarantees the push actually goes to GitHub.

   **Verify the push succeeded** — check that `git log origin/$(git branch --show-current) --oneline -1` shows your commit. If it doesn't, the push failed. Fix it before continuing.

### Step 3.5: Completeness Gate

Before proceeding to full-page comparison, verify coverage:

1. **Count sections**: How many sections were in the template? How many have reports with `status: "completed"` or `"completed_code_only"`?
2. **Flag gaps**: If any section has `status: "incomplete"`, `"failed"`, or `"skipped"`, list them.
3. **Escalate if coverage is low**: If fewer than 80% of sections are completed, escalate to the user:
   ```
   Page {page} coverage: {N}/{total} sections completed.
   Incomplete/skipped: {list with reasons}

   A) Continue with remaining sections before full-page comparison
   B) Proceed to full-page comparison as-is
   ```
4. **Below-fold audit**: Scroll the live page from top to bottom. List every visible content block. Cross-reference against the sections you pulled. If there's live content that has NO corresponding section work (even a "skipped" report), you missed it — go back and pull it.

### Step 4: Full-Page Comparison

After all sections are pulled:

1. Take a full-page screenshot of the live site
2. Take a full-page screenshot of the dev site. **For Shadow DOM themes (e.g., Horizon):** wait 3-5 seconds after navigation before screenshotting. Use `$B js "await new Promise(r => setTimeout(r, 3000))"` to let custom elements hydrate. If the screenshot is blank/white, this is the most likely cause.
3. Scroll through both top-to-bottom, comparing section by section
4. Look for:
   - Inter-section spacing issues (gaps between sections that don't match)
   - Color continuity (do adjacent sections' colors flow correctly?)
   - Any section that regressed due to changes in a later section
5. Log any full-page variances

### Step 5: Write Page Report

Save to `.theme-forge/reports/pages/{page-path}.json`:

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "page": "index",
  "status": "complete",
  "sections_pulled": 8,
  "sections_skipped": 0,
  "sections_with_issues": 2,
  "full_page_variances": [
    {
      "location": "between hero and featured-collection",
      "description": "40px gap on dev, 20px on live",
      "severity": "medium"
    }
  ],
  "section_reports": [
    "sections/slideshow.json",
    "sections/featured-collection.json"
  ],
  "cutover_items": 2,
  "cutover_summary": [
    "Assign template 'page.about-us' to /pages/about-us after theme goes live",
    "Upload hero-banner.jpg to store files before cutover"
  ]
}
```

After writing the page report, display the cutover items summary if any exist:

```
CUTOVER ITEMS (2):
  1. Assign template 'page.about-us' to /pages/about-us (Shopify Admin > Pages > Theme template)
  2. Upload hero-banner.jpg to store files (Settings > Files)

Run /theme-forge cutover for the full checklist.
```

### Step 6: Final Commit + Push

Commit the page report and any remaining changes:

```bash
git add .theme-forge/reports/pages/{page}.json \
        .theme-forge/cutover.json
git commit -m "pull: {page} page complete — {N} sections pulled"
git push -u origin $(git branch --show-current)
```

### Step 7: ⛔ MERGE POINT — PR Back to Main

**Each completed page should be merged to main** so other sessions and future work starts from the latest state.

Create a PR:
```bash
gh pr create --title "pull: {page} page complete — {N} sections" \
  --body "All sections on {page} pulled and verified. Ready to merge to main."
```

Tell the user:

> **PR created for {page}.** Please review and merge to main. This makes the pulled sections available to other sessions and prevents drift between page branches.

**If parallel page branches exist**, merging may produce conflicts in shared files (`config/settings_data.json`, global CSS). The PR diff will show these. Resolve by keeping both sets of changes (color schemes, CSS rules are additive).

If this is the first page pull after header/footer, also remind:

> **If header/footer haven't been merged to main yet**, merge those first. They appear on every page and should be in the shared baseline.

## Git Strategy Summary

```
main: base theme → onboard → globals → header/footer → merge index → merge product → ...
                                          \                /              /
page branches:                             └── pull-page ──┘             /
                                          \                             /
                                           └────── pull-page ──────────┘
```

**Merge points** (shared work that all branches need):
1. Base theme import + onboard config
2. Scan + apply-globals (fonts, colors, spacing)
3. Header + footer (appear on every page)

**Page branches** (can run in parallel after merge point 3):
- Each page branches from main after header/footer are merged
- Each page PRs back to main when complete
- Conflicts are minimal since pages mostly touch different template files

## Output

- `.theme-forge/reports/pages/{page-path}.json` — Page pull report (committed)
- Individual section reports in `.theme-forge/reports/sections/` (committed after each section)
- `.theme-forge/cutover.json` — Running cutover checklist (appended to)
- Modified target theme files (committed after each section)
