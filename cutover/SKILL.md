---
name: cutover
description: >
  Display and manage the cutover checklist for production go-live. Shows all items that require manual action when switching to the new theme.
  - MANDATORY TRIGGERS: theme-forge cutover, cutover checklist, go-live checklist
---

# cutover — Production Go-Live Checklist

Display all items that require manual action when switching from the old theme to the new one. These are accumulated automatically during `pull-section` and `pull-page` runs.

## Prerequisites

- `.theme-forge/cutover.json` must exist (populated by `pull-section` and `pull-page`)

## Arguments

```
/theme-forge cutover [--verify]
```

- `--verify` — Check that each referenced file exists in the target theme and is syntactically valid

## Workflow

### Step 1: Load Checklist

1. Read `.theme-forge/cutover.json`
2. If the file does not exist or is empty, report: "No cutover items found. Run `pull-page` or `pull-section` to generate items."

### Step 2: Display Checklist

Group items by type and display:

```
PRODUCTION CUTOVER CHECKLIST
════════════════════════════
Generated from theme-forge migration data.
These items require manual action AFTER the new theme goes live.

TEMPLATE ASSIGNMENTS (2)
  ☐ Assign template 'page.about-us' to /pages/about-us
    Shopify Admin > Pages > About Us > Theme template dropdown
    Created by: pull-page about-us (2026-04-08)

  ☐ Assign template 'page.contact' to /pages/contact
    Shopify Admin > Pages > Contact > Theme template dropdown
    Created by: pull-page contact (2026-04-08)

ASSET UPLOADS (1)
  ☐ Upload hero-banner.jpg to store files
    Shopify Admin > Settings > Files
    Referenced by: sections/custom-hero.liquid

COLOR SCHEMES (0)
  All color schemes are embedded in settings_data.json. No action needed.

CUSTOM SECTIONS (3)
  ☐ Verify sections/custom-hero.liquid renders correctly on live theme
  ☐ Verify sections/custom-trust-bar.liquid renders correctly on live theme
  ☐ Verify sections/custom-footer.liquid renders correctly on live theme

TOTAL: 6 items requiring manual action
```

### Step 3: Verify (if --verify)

For each item:
1. **Template assignments**: Check that the template file exists in the target theme (`templates/{name}.json`)
2. **Asset uploads**: Check if the file is referenced in any section and whether it exists in `assets/`
3. **Custom sections**: Check that the `.liquid` file exists and has a valid `{% schema %}` block
4. **Color schemes**: Check that the scheme name exists in `settings_data.json`

Report pass/fail for each item.

### Step 4: Export (optional)

If the user asks, export the checklist as a markdown file at `.theme-forge/CUTOVER.md` suitable for sharing with the team doing the production switchover.

## Output

- Terminal display of grouped checklist
- Optional: `.theme-forge/CUTOVER.md` — Shareable cutover checklist
