---
name: scan
description: >
  Inventory all pages, layouts, sections, and settings in both the base and target Shopify themes. Produces a full site inventory and migration plan.
  - MANDATORY TRIGGERS: theme-pull scan, scan theme, inventory theme, site inventory, migration plan
---

# scan — Full Theme & Site Inventory

Crawl both the base theme and target theme to inventory every page, section, and setting. Produce a migration plan with effort estimates.

## Prerequisites

- `.theme-pull/config.json` must exist (run `onboard` first)

## Workflow

### Step 1: Load Config

Read `.theme-pull/config.json` to get base_theme, target_theme, and target_type paths.

### Step 2: Inventory Base Theme

Parse the base (live/exported) theme:

1. **Layouts** — Read `layout/*.liquid`. List each layout file and what it includes.
2. **Templates** — Read `templates/*.json` (and any `.liquid` templates). For each template:
   - Record the template name (maps to a page type: `index`, `product`, `collection`, `cart`, `page`, `blog`, `article`, `404`, `search`, `password`, `gift_card`, `customers/*`)
   - For JSON templates: parse the `sections` and `order` keys to get the section list
   - Record each section's type (the `type` key) and its configured settings
   - Note any template alternates (e.g., `page.bridal.json`)
3. **Sections** — Read `sections/*.liquid`. For each:
   - Record section name, schema settings, blocks schema
   - Identify section groups (header-group, footer-group, overlay-group)
   - Count settings, blocks, and presets
4. **Section Groups** — Read `sections/*.json` (group files like `header-group.json`, `footer-group.json`). Record which sections are in each group.
5. **Snippets** — List all `snippets/*.liquid` files
6. **Assets** — List all `assets/*` files, categorize (CSS, JS, SVG, images, fonts)
7. **Global Settings** — Parse `config/settings_schema.json` for theme-level settings (fonts, colors, spacing, etc.)
8. **Settings Data** — Parse `config/settings_data.json` for current/active values of all settings
9. **Resolved CSS** — For each section with an inline `<style>` block or `{% stylesheet %}`:
   - Extract all CSS from the section's `.liquid` file
   - Find every Liquid template variable (`{{ settings.* }}`, `{{ section.settings.* }}`, `{{ block.settings.* }}`)
   - Resolve each variable against `settings_data.json` (for global `settings.*`) or the section's configured values in the template JSON (for `section.settings.*`)
   - Also resolve theme-level font variables: look up `type_heading_font`, `type_body_font`, etc. in settings_data.json and expand them to their CSS values (font-family, weight, style)
   - Also check the section HTML for global CSS class references (e.g., `heading_font`, `body_font`) that apply typography not visible in the `<style>` block — document these as implicit style dependencies
   - Store the fully-resolved CSS alongside the raw CSS in the inventory
   - This eliminates manual cross-referencing during `pull-section` and prevents the #1 time sink: chasing Liquid variables through settings files

   **Example**: Raw CSS contains `font-weight: {{ settings.heading_font_weight }};` → settings_data.json has `"heading_font_weight": "200"` → Resolved CSS contains `font-weight: 200;`

   **Unresolvable variables**: If a variable references a dynamic value (e.g., `{{ section.settings.custom_color }}` where the color changes per-instance), keep the Liquid syntax but add a comment with the current configured value: `font-weight: 200; /* from {{ settings.heading_font_weight }} */`

### Step 3: Inventory Target Theme

Repeat Step 2 for the target theme. Additionally:

1. Identify which sections are **core** (part of the base target theme) vs **custom** (extension layer files matching the configured prefix)
2. Note which templates already have sections assigned
3. Identify any existing `.theme-pull/` state from prior runs

### Step 4: Cross-Reference

For each section in the base theme:

1. **Auto-match** — Find candidate matches in the target theme by:
   - Exact name match (e.g., `featured-collection` → `featured-collection`)
   - Prefix match (e.g., `featured-collection` → `custom-featured-collection`)
   - Schema similarity (compare setting types and names)
   - HTML structure similarity (shared class names, similar DOM patterns)
2. **Classify match quality**:
   - `exact` — Same section name exists in target
   - `custom` — A `{prefix}*` version exists in target
   - `candidate` — Similar section found, needs verification
   - `none` — No match found
3. Record in inventory with confidence score

### Step 5: Identify Gaps

Compare theme-level settings between base and target:

1. **Typography** — Font families, weights, sizes used globally
2. **Colors** — Color schemes, named colors, brand colors
3. **Spacing** — Padding/margin conventions, responsive breakpoints
4. **Features** — Theme-level features that exist in base but not target (e.g., announcement bar variants, mega-menu styles)

### Step 6: Generate Migration Plan

Create a prioritized plan:

```json
{
  "phases": [
    {
      "name": "Global Settings",
      "description": "Fonts, colors, color schemes, spacing",
      "items": [...],
      "effort": "low"
    },
    {
      "name": "Shared Sections",
      "description": "Header, footer, announcement bar",
      "items": [...],
      "effort": "high"
    },
    {
      "name": "Homepage",
      "description": "All sections on the index template",
      "items": [...],
      "effort": "medium"
    },
    ...
  ],
  "summary": {
    "total_sections": 42,
    "matched": 18,
    "candidates": 12,
    "unmatched": 12,
    "estimated_effort": "medium-high"
  }
}
```

**Phase ordering:**
1. Global settings (fonts, colors) — affects everything downstream
2. Shared sections (header, footer) — appears on every page
3. Homepage — highest traffic, most visible
4. PDP (product page) — revenue-critical
5. Collection page — discovery path
6. Cart — conversion path
7. Other pages (blog, article, search, 404, etc.)

### Step 7: Write Output

Save to `.theme-pull/`:

1. `site-inventory.json` — Full inventory of both themes
2. `plan.json` — Migration plan with phases and effort estimates

## Output Schema

### site-inventory.json

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "base_theme": {
    "name": "GLDN Legacy",
    "path": "../gldn-theme-040626",
    "layouts": [...],
    "templates": [...],
    "sections": [...],
    "section_groups": [...],
    "snippets": [...],
    "assets": { "css": [...], "js": [...], "svg": [...], "images": [...], "fonts": [...] },
    "global_settings": {...},
    "settings_data": {...}
  },
  "target_theme": {
    "name": "Horizon",
    "path": ".",
    "type": "horizon",
    "layouts": [...],
    "templates": [...],
    "sections": { "core": [...], "custom": [...] },
    "section_groups": [...],
    "snippets": [...],
    "assets": {...},
    "global_settings": {...},
    "settings_data": {...}
  },
  "cross_reference": {
    "section_matches": [
      {
        "base_section": "slideshow",
        "target_section": "custom-hero-slideshow",
        "match_type": "custom",
        "confidence": 0.85
      },
      ...
    ],
    "setting_gaps": [...],
    "feature_gaps": [...]
  }
}
```

### plan.json

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "phases": [...],
  "summary": {
    "total_base_sections": 42,
    "total_target_sections": 35,
    "matched": 18,
    "candidates": 12,
    "unmatched": 12,
    "custom_sections_needed": 8,
    "estimated_effort": "medium-high"
  }
}
```
