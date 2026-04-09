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

### Step -1: Base Theme Freshness Check

Before any work, verify the base theme export is current:

1. Read `base_theme_exported_at` from `.theme-forge/config.json`. If it's more than 24 hours old, warn the user:
   > "The base theme export is from {date} ({N days ago}). The live site may have changed since then. Content like hero headlines, section ordering, and settings are stored in Shopify and update independently of theme code."
   >
   > A) Re-export the base theme now (`shopify theme pull --store <store> --theme <live_theme_id> --path <base_theme_path>`)
   > B) Continue with the existing export (I know it's current)

2. If `base_theme_exported_at` is missing from config (older project), check file timestamps:
   ```bash
   stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%S" <base_theme_path>/config/settings_data.json
   ```
   If older than 24 hours, show the same warning.

3. If the user chooses A, re-export and update `base_theme_exported_at` in config.

### Step 0: Global Settings (first run only)

Before pulling any sections, verify that global theme settings are correct. These affect every section and must be set first:

1. **Logo**: Check `settings_data.json` for the logo image field. Copy the logo reference from the base theme's `settings_data.json`. If the field name differs between themes, find the equivalent field in the target theme's `config/settings_schema.json`.
2. **Favicon**: Extract the favicon from the live site's HTML using the browse tool:
   ```javascript
   document.querySelector('link[rel="icon"], link[rel="shortcut icon"]')?.href
   ```
   If the live site has a favicon, set it in the target theme's `settings_data.json`. The favicon field is typically `favicon` under the global `current` settings. Use the `shopify://shop_images/filename.ext` reference if the image is already in the store's files, or note it for manual upload if it's served from a CDN path. If the live site has no favicon, skip this step.
3. **Global fonts**: Compare `--font-body-family` and `--font-heading-family` (or equivalent) between themes. Set the target's font settings to match the live site. Check font weight especially — some themes default to 700 for headings while others use 400.
4. **Global color schemes**: Read the live site's color schemes from `settings_data.json`. For each scheme used by sections on this page, ensure a matching scheme exists in the target theme (matched by RGB values, not by name). Create new named schemes if needed.
5. **Body text size**: Compare the base paragraph font size between themes. Set the target's paragraph size setting to match.

**IMAGE SOURCING RULE**: Images do NOT need to be uploaded or set via the Shopify admin. The store's images already exist on Shopify's CDN. Copy image references (`shopify://shop_images/filename.ext`) from the **base theme's** `config/settings_data.json` to the **target theme's** `config/settings_data.json`. These URLs resolve to the store's CDN automatically — they work in any theme on the same store. **Never tell the user images need to be uploaded manually.** If an image shows a placeholder, go back and copy the correct URL from the base theme.

**Save global settings locally** — write the updated `settings_data.json` to the target theme directory. If `shopify theme dev` is running, it will hot-reload the changes automatically. **Do NOT run `shopify theme push`** — all changes stay local until the user explicitly approves a push. The dev preview server (`shopify theme dev`) serves files from the local directory, so pushing is unnecessary for development work.

### Step 0.5: Verify Browse Tool

Before pulling any sections, verify the browse tool is available. **The browse tool is a CLI binary you run via Bash — it is NOT a named tool in your tool list.** You will not see "browse" listed in your tools. That's normal.

**Run this via Bash:**
```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse && [ -x "$B" ] && echo "BROWSE READY: $B" || echo "NOT FOUND"
```

- **`BROWSE READY`**: The browse binary path is printed. Use this path (prefixed with `B=<path> &&`) in every Bash command that needs the browse tool — shell variables do not persist between Bash calls.
- **`NOT FOUND`**: Check alternate location: `B="$(git rev-parse --show-toplevel)/.claude/skills/gstack/browse/dist/browse" && [ -x "$B" ] && echo "BROWSE READY: $B"`. If still not found, check for Playwright MCP tools (`mcp__playwright__*`). If nothing is available, proceed in code-only mode for all sections.

**Do NOT decide browse availability by inspecting your tool list.** The browse binary is a CLI, not a named tool. Always run the Bash check.

**Do NOT attempt visual verification with curl, WebFetch, or other non-browse tools.** These return HTML/markdown, not rendered pages.

### Step 1: Parse Template

1. Load config and read the page's template JSON from the **target theme** (since we're modifying the target)
2. Cross-reference with the **base theme's** template to identify the source section for each. **IMPORTANT**: Use only the active template file (e.g., `templates/index.json`), never alternate templates like `index.sl-*.json` or `index.*.json`. The base theme export may contain dozens of old/unused alternate templates with stale content. The active template is the one without a suffix, or the one referenced in `config/settings_data.json`.
3. **Content comes from `settings_data.json`**: Many themes store section content (headlines, descriptions, button text) in `config/settings_data.json` under the section's key, not in the template JSON. Always check `settings_data.json` first for content values. The template JSON defines structure; `settings_data.json` defines content.
4. If a page mapping exists at `.theme-forge/mappings/pages/{page-path}.json`, use it for ordering

### Step 1.5: Find CSS Loading Mechanism

Before pulling sections, identify how the target theme loads CSS:
1. Search for the stylesheets snippet (e.g., `snippets/stylesheets.liquid`)
2. Check `layout/theme.liquid` for stylesheet loading patterns
3. Record the path where a custom CSS file can be added (e.g., add `{{ 'custom-migration.css' | asset_url | stylesheet_tag }}` to the stylesheets snippet)

You will need this when sections require CSS overrides that can't be achieved through JSON settings alone. Finding it now saves time later.

### Step 2: Determine Section Order

Pull sections in this order:
1. Sections already mapped as `compatible` (quick wins)
2. Sections mapped as `partially_compatible`
3. Sections mapped as `requires_customization`
4. Sections mapped as `incompatible`

Within each group, maintain the top-to-bottom page order.

### Step 3: Pull Each Section

For each section:

1. Check if a report already exists at `.theme-forge/reports/sections/{section-type}.json`
   - If yes and `status` is `complete`, skip (unless `--force`)
2. Run `pull-section` on it. **If `--debug` was passed to pull-page, thread it through:** invoke pull-section with `--debug` so each section gets its own debug directory.
3. After each section completes, log progress

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

## Output

- `.theme-forge/reports/pages/{page-path}.json` — Page pull report
- Individual section reports in `.theme-forge/reports/sections/`
- `.theme-forge/cutover.json` — Running cutover checklist (appended to)
- Modified target theme files
