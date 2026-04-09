---
name: map-page
description: >
  Map all sections on a Shopify page by running map-section on each. Produces a page-level compatibility summary with migration effort estimate.
  - MANDATORY TRIGGERS: theme-forge map-page, map page, assess page, page compatibility
---

# map-page — Page-Level Section Mapping

Map all sections on a page by running `map-section` on each. Produces a page-level summary.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)

## Arguments

```
/theme-forge map-page [page-path]
```

`[page-path]` is the template name (e.g., `index`, `product`, `collection`, `cart`). Defaults to `index` (homepage) if omitted.

## Workflow

### Step 1: Parse Template

1. Read `.theme-forge/config.json` for the base theme path
2. Read the base theme's template JSON: `{base_theme}/templates/{page-path}.json`
   - If multiple variants exist (e.g., `index.sl-*.json`), use the primary one
3. Extract the `order` array and `sections` object to get the list of sections on this page
4. Also check section groups (header-group, footer-group) referenced by the layout

### Step 2: Map Each Section

For each section in the page's template:

1. Check if a mapping already exists at `.theme-forge/mappings/sections/{section-type}.json`
   - If yes, load it (skip re-mapping unless `--force` is passed)
   - If no, run `map-section` on it
2. Collect all mapping results

### Step 3: Page-Level Summary

Aggregate the section mappings into a page-level report:

- Count sections by compatibility level
- Identify the highest-effort sections
- Calculate overall page migration effort
- Flag any sections that are `incompatible` (these need the most attention)

### Step 4: Write Report

Save to `.theme-forge/mappings/pages/{page-path}.json`:

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "page": "index",
  "template": "templates/index.json",
  "sections": [
    {
      "id": "slideshow_abc123",
      "type": "slideshow",
      "compatibility": "partially_compatible",
      "effort": "medium"
    },
    {
      "id": "featured_collection_def456",
      "type": "featured-collection",
      "compatibility": "compatible",
      "effort": "low"
    }
  ],
  "summary": {
    "total_sections": 8,
    "compatible": 3,
    "partially_compatible": 3,
    "requires_customization": 1,
    "incompatible": 1,
    "overall_effort": "medium-high"
  },
  "recommended_order": [
    "Start with the 3 compatible sections (JSON-only changes)",
    "Then the 3 partially compatible (JSON + CSS)",
    "Then the customization section",
    "Finally the incompatible section (custom build)"
  ]
}
```

## Output

- `.theme-forge/mappings/pages/{page-path}.json` — Page mapping report
- Individual section mappings in `.theme-forge/mappings/sections/`
- Summary printed to conversation
