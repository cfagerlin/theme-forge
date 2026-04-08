---
name: pull-page
description: >
  Pull all sections on a Shopify page sequentially using pull-section. Works top-to-bottom, then does a full-page visual comparison.
  - MANDATORY TRIGGERS: theme-pull pull-page, pull page, match page, fix page
---

# pull-page — Pull All Sections on a Page

Execute `pull-section` on every section in a page's template, working top to bottom. After all sections are pulled, do a full-page visual comparison.

## Prerequisites

- `.theme-pull/config.json` must exist (run `onboard` first)

## Arguments

```
/theme-pull pull-page [page-path]
```

Defaults to `index` (homepage) if omitted.

## Workflow

### Step 0: Global Settings (first run only)

Before pulling any sections, verify that global theme settings are correct. These affect every section and must be set first:

1. **Logo**: Check `settings_data.json` for the logo image field. Copy the logo reference from the base theme's `settings_data.json`. If the field name differs between themes, find the equivalent field in the target theme's `config/settings_schema.json`.
2. **Favicon**: Same as logo — find and copy the favicon reference.
3. **Global fonts**: Compare `--font-body-family` and `--font-heading-family` (or equivalent) between themes. Set the target's font settings to match the live site. Check font weight especially — some themes default to 700 for headings while others use 400.
4. **Global color schemes**: Read the live site's color schemes from `settings_data.json`. For each scheme used by sections on this page, ensure a matching scheme exists in the target theme (matched by RGB values, not by name). Create new named schemes if needed.
5. **Body text size**: Compare the base paragraph font size between themes. Set the target's paragraph size setting to match.

**Push global settings to the dev store** (`shopify theme push --theme <id> --only config/...`) before proceeding to sections. This prevents every section from having wrong fonts/colors on first render.

### Step 1: Parse Template

1. Load config and read the page's template JSON from the **target theme** (since we're modifying the target)
2. Cross-reference with the **base theme's** template to identify the source section for each
3. If a page mapping exists at `.theme-pull/mappings/pages/{page-path}.json`, use it for ordering

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

1. Check if a report already exists at `.theme-pull/reports/sections/{section-type}.json`
   - If yes and `status` is `complete`, skip (unless `--force`)
2. Run `pull-section` on it
3. After each section completes, log progress

### Step 4: Full-Page Comparison

After all sections are pulled:

1. Take a full-page screenshot of the live site
2. Take a full-page screenshot of the dev site
3. Scroll through both top-to-bottom, comparing section by section
4. Look for:
   - Inter-section spacing issues (gaps between sections that don't match)
   - Color continuity (do adjacent sections' colors flow correctly?)
   - Any section that regressed due to changes in a later section
5. Log any full-page variances

### Step 5: Write Page Report

Save to `.theme-pull/reports/pages/{page-path}.json`:

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
  ]
}
```

## Output

- `.theme-pull/reports/pages/{page-path}.json` — Page pull report
- Individual section reports in `.theme-pull/reports/sections/`
- Modified target theme files
