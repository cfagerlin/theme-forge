---
name: scan
description: >
  Inventory all pages, layouts, sections, and settings in both the base and target Shopify themes. Produces a full site inventory and migration plan.
  - MANDATORY TRIGGERS: theme-forge scan, scan theme, inventory theme, site inventory, migration plan
---

# scan — Full Theme & Site Inventory

Crawl both the base theme and target theme to inventory every page, section, and setting. Produce a migration plan with effort estimates.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)

## Workflow

### Step 1: Load Config

Read `.theme-forge/config.json` to get base_theme, target_theme, and target_type paths.

### Step 2: Inventory Base Theme

Parse the base (live/exported) theme:

1. **Layouts** — Read `layout/*.liquid`. List each layout file and what it includes.
2. **Templates** — Read `templates/*.json` and `templates/*.liquid`. For each template:
   - Record the template name (maps to a page type: `index`, `product`, `collection`, `cart`, `page`, `blog`, `article`, `404`, `search`, `password`, `gift_card`, `customers/*`)
   - **JSON templates** (`.json`): parse the `sections` and `order` keys to get the section list. Record each section's `type` key and configured settings.
   - **Liquid templates** (`.liquid`, legacy themes): sections are NOT listed in the template file. Instead, the section composition lives in `config/settings_data.json` under the `current` key. For each page type, find the corresponding entry and extract the sections from its `content_for_index` or similar keys.
   - Note any template alternates (e.g., `page.bridal.json`)

   **Legacy Theme Detection:** If `templates/index.liquid` exists but `templates/index.json` does not, this is a legacy theme. All section-to-page mappings must come from `config/settings_data.json` → `current` → `content_for_index` (for homepage) and similar keys for other pages. Sections in `settings_data.json` are keyed by a unique ID and have a `type` field pointing to the section file in `sections/`.
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
3. Identify any existing `.theme-forge/` state from prior runs

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

### Step 4.5: Template Migration Map

Build a complete map of every base theme template, its type, the sections it uses, and each section's snippet/asset dependencies. **Every base template gets migrated** — the question is format and approach, not whether to include it.

#### 1. Classify every base template

For each template in `.theme-forge/base-cache/templates/`:

| Classification | Description | Migration approach |
|---|---|---|
| **page** | Full page template (index, product, collection, page, blog, article, cart, search, 404, customers/*) | Create `.json` template in target theme with mapped sections |
| **alternate** | Variant of a page type (e.g., `page.about.json`, `product.featured.json`) | Create `.json` alternate in target theme |
| **functional** | AJAX endpoint, quick-view modal, app data loader (renders a single section or snippet, not a full page) | Copy as `.liquid` template — these don't use the JSON section architecture |
| **redirect** | Template that just redirects to another page (e.g., `product.donate-gift` → homepage) | Copy as `.liquid` template with redirect logic |
| **app-artifact** | Template created by a Shopify app that's no longer active or relevant | Document in cutover; migrate only if the app is still installed |

**How to classify:**
- Read the template file. If it contains `{% section %}` tags or a `sections`/`order` JSON structure → **page** or **alternate**
- If it contains a single `{% render %}` call, an AJAX response, or raw JSON output → **functional**
- If it contains `{% redirect %}` or a `<meta http-equiv="refresh">` → **redirect**
- If it references an app that isn't in the app embeds inventory → **app-artifact**
- `.liquid` templates that render full pages (legacy themes) are still **page** type

**⛔ `target_format` must match classification:**
- `page` and `alternate` → `target_format: "json"` (these use Shopify's JSON section architecture)
- `functional` and `redirect` → `target_format: "liquid"` (these are raw Liquid — AJAX endpoints, data feeds, redirects — they CANNOT be `.json` because they don't use sections/order)
- `app-artifact` → `target_format: "liquid"` (or omit if not migrating)

This is a hard rule. A functional template with `target_format: "json"` is always a bug.

#### 2. Build the dependency cascade

For each template, trace the full dependency tree:

```
template → sections → snippets → assets
                   → blocks
                   → snippets → assets
```

Concretely:
1. **Template → Sections**: Parse the template JSON `sections` key (JSON templates) or find `{% section 'name' %}` tags (Liquid templates). Also check `config/settings_data.json` for section composition (legacy themes).
2. **Section → Snippets**: For each section `.liquid` file, find all `{% render 'name' %}` and `{% include 'name' %}` calls.
3. **Section → Blocks**: Check the section's schema for block types, then find the block definitions in `blocks/`.
4. **Snippet → Snippets**: Snippets can render other snippets. Follow the chain.
5. **Section/Snippet → Assets**: Find `{{ 'filename.js' | asset_url }}` and `{{ 'filename.css' | asset_url }}` references.

#### 3. Save the template map

Save to `.theme-forge/template-map.json`:

```json
{
  "generated_at": "<ISO timestamp>",
  "templates": [
    {
      "base_template": "templates/index.json",
      "classification": "page",
      "target_format": "json",
      "target_template": "templates/index.json",
      "sections": [
        {
          "key": "slideshow-1",
          "base_type": "cta_banner",
          "target_type": "hero",
          "match_quality": "candidate",
          "snippets": ["mega-menu-list", "social-icons"],
          "blocks": ["text", "button", "image"],
          "assets": ["cta-banner.css"]
        }
      ]
    },
    {
      "base_template": "templates/product.quick-view.liquid",
      "classification": "functional",
      "target_format": "liquid",
      "target_template": "templates/product.quick-view.liquid",
      "description": "AJAX endpoint — renders product card partial in modal",
      "sections": [],
      "snippets_referenced": ["product-card", "quick-add-form"],
      "assets_referenced": ["quick-view.js"]
    },
    {
      "base_template": "templates/product.donate-gift.liquid",
      "classification": "redirect",
      "target_format": "liquid",
      "target_template": "templates/product.donate-gift.liquid",
      "description": "Redirects to homepage",
      "sections": [],
      "snippets_referenced": []
    }
  ],
  "summary": {
    "total_templates": 15,
    "page": 8,
    "alternate": 3,
    "functional": 2,
    "redirect": 1,
    "app_artifact": 1
  },
  "all_sections_referenced": ["cta_banner", "featured-collection", "..."],
  "all_snippets_referenced": ["mega-menu-list", "social-icons", "product-card", "..."],
  "all_assets_referenced": ["cta-banner.css", "quick-view.js", "..."]
}
```

**This map drives everything downstream.** The `--full` workflow uses it to enumerate templates. `pull-page` uses it to know which sections to pull. The dependency lists ensure no snippet or asset is forgotten.

### Step 5: Identify Gaps

Compare theme-level settings between base and target:

1. **Typography** — Font families, weights, sizes used globally
2. **Colors** — Color schemes, named colors, brand colors
3. **Spacing** — Padding/margin conventions, responsive breakpoints
4. **Features** — Theme-level features that exist in base but not target (e.g., announcement bar variants, mega-menu styles)

### Step 5.5: Build Global Settings Map

Cross-reference the global theme settings between base and target. This map is used by every pull-section to translate settings without rediscovering mappings.

For each category, compare the base theme's `settings_schema.json` + `settings_data.json` against the target theme's equivalents:

1. **Typography** — Map font family settings, weight settings, size settings, letter-spacing, line-height.
   - Resolve the base theme's current values (e.g., `type_heading_font` → `Spectral`, weight `200`, letter-spacing `-0.02em`)
   - Find the target theme's equivalent settings (may use different names, e.g., `--font-heading-family`, `--font-heading--weight`)
   - Record both the setting key mapping AND the resolved values

2. **Colors** — Map color settings, color schemes, named colors.
   - For each base theme color, find the closest target theme color scheme or custom property
   - Record hex values for both so sections can match by value, not just name
   - Map base theme background + text color pairs to target theme color schemes

3. **Spacing** — Map padding/margin conventions, section spacing settings.
   - Record base theme section padding defaults and target theme equivalents

4. **Features** — Map theme-level toggles (e.g., `show_announcement_bar`, `enable_sticky_header`)

Save to `.theme-forge/settings-map.json`:

```json
{
  "generated_at": "<ISO timestamp>",
  "typography": {
    "heading_font": {
      "base_setting": "type_heading_font",
      "base_value": "Spectral",
      "target_setting": "--font-heading-family",
      "target_value": "var(--font-heading-family)",
      "notes": "Set via theme editor Typography > Headings"
    },
    "heading_weight": {
      "base_setting": "heading_font_weight",
      "base_value": "200",
      "target_setting": "--font-heading--weight",
      "target_value": "400",
      "override_needed": true,
      "notes": "Target defaults to 400, base uses 200. CSS override required."
    },
    "heading_letter_spacing": {
      "base_setting": "heading_letter_spacing",
      "base_value": "-0.02em",
      "target_setting": "heading_letter_spacing",
      "target_value": "0.06em",
      "override_needed": true
    }
  },
  "colors": {
    "schemes": [
      {
        "base_bg": "#ffffff",
        "base_text": "#333333",
        "target_scheme": "scheme-1",
        "target_bg": "#ffffff",
        "target_text": "#121212",
        "notes": "Default light scheme. Text color differs — CSS override needed."
      },
      {
        "base_bg": "#4c544c",
        "base_text": "#ffffff",
        "target_scheme": "scheme-3",
        "target_bg": "#4c544c",
        "target_text": "#ffffff",
        "notes": "Dark green scheme. Exact match."
      }
    ],
    "named_colors": {
      "base_primary": "#614731",
      "target_closest": "--color-accent",
      "target_value": "#614731"
    }
  },
  "spacing": {
    "section_padding_top": { "base_default": "36px", "target_default": "40px", "override_needed": true },
    "section_padding_bottom": { "base_default": "36px", "target_default": "40px", "override_needed": true }
  },
  "features": {
    "sticky_header": { "base": true, "target": true, "setting": "header_sticky" },
    "announcement_bar": { "base": true, "target": true, "setting": "announcement_bar_enabled" }
  }
}
```

### Step 5.6: Build CSS Class Map

Cross-reference CSS classes, custom properties, and component patterns between the two themes. This prevents every pull-section from independently rediscovering that base `.btn` maps to target `.button`.

**Method:**

1. **Extract base theme classes** — Parse all `sections/*.liquid` and `assets/*.css` files. Collect every CSS class used in HTML (`class="..."`) and defined in stylesheets (`.class-name { ... }`).

2. **Extract target theme classes** — Same for the target theme. For Shadow DOM themes (Horizon), also check web component template HTML inside `<template>` tags and any `adoptedStyleSheets` in JS.

3. **Cross-reference** — For each major base theme class, find the target theme equivalent by:
   - Name similarity (e.g., `.btn` → `.button`, `.heading` → `h2`)
   - Functional equivalence (e.g., both are CTA buttons, both are grid containers)
   - DOM role (e.g., both are the primary product image container)

4. **Custom properties** — Map CSS custom properties (`--var-name`) between themes. These are especially important for Horizon which uses custom properties heavily.

5. **Component patterns** — Map higher-level patterns (e.g., "slider with Flickity" → "slider with `<slide-show>` web component").

Save to `.theme-forge/class-map.json`:

```json
{
  "generated_at": "<ISO timestamp>",
  "classes": {
    "buttons": {
      ".btn": ".button",
      ".btn--primary": ".button--primary",
      ".btn--secondary": ".button--secondary",
      ".btn--outline": ".button--outline"
    },
    "typography": {
      ".heading": "h2 (no wrapper class)",
      ".subheading": ".subtitle",
      ".rte": ".rich-text__content"
    },
    "layout": {
      ".grid": ".grid",
      ".grid__item": ".grid > *",
      ".container": ".page-width",
      ".row": ".grid"
    },
    "sections": {
      ".shopify-section": ".shopify-section (same)",
      ".section-header": "section heading inside Shadow DOM"
    }
  },
  "custom_properties": {
    "--color-primary": "--color-foreground",
    "--color-secondary": "--color-accent",
    "--color-bg": "--color-background",
    "--font-heading": "--font-heading-family",
    "--font-body": "--font-body-family",
    "--spacing-section": "--section-padding"
  },
  "component_patterns": {
    "flickity-slider": "<slide-show> web component with Declarative Shadow DOM",
    "jquery-accordion": "<details>/<summary> native HTML",
    "modal-popup": "<dialog> element or <modal-opener>/<modal-dialog> components",
    "tabs-widget": "<tab-group> web component"
  },
  "shadow_dom_notes": "Horizon uses Declarative Shadow DOM. Sections render inside shadow roots. querySelector() won't penetrate — use deepQuery (dq/dqAll) from the capture skill. Classes inside shadow roots are scoped and not accessible from outside."
}
```

**This map is committed to git** so all parallel sessions share it.

### Step 5.7: Inventory App Embeds

Shopify app embeds are third-party integrations that inject scripts, tracking pixels, widgets, and overlays into the storefront. They live in `config/settings_data.json` under `current.blocks` as entries with `shopify://apps/` type URIs. **These must be migrated to the target theme** or those integrations will stop working.

1. **Extract app embeds from base theme**: Read `.theme-forge/base-cache/config/settings_data.json` → `current.blocks`. Filter entries where `type` starts with `shopify://apps/`. For each, record:
   - App name (from the type URI, e.g., `klaviyo-email-marketing-sms`)
   - Block type (e.g., `klaviyo-onsite-embed`, `script-tag`, `pixel`)
   - Enabled/disabled status
   - Settings (any configuration the merchant has set)
   - The full block key (UUID)

2. **Check target theme**: Read the target theme's `config/settings_data.json` → `current.blocks`. Check which app embeds already exist.

3. **Copy missing app embeds**: For each base app embed NOT in the target theme, copy the entire block entry (key, type, disabled status, settings) into the target theme's `settings_data.json` → `current.blocks`. Preserve the original block key so Shopify associates it with the installed app.

4. **Record in inventory**: Save the app embeds list to `.theme-forge/app-embeds.json`:

```json
{
  "generated_at": "<ISO timestamp>",
  "embeds": [
    {
      "app": "klaviyo-email-marketing-sms",
      "block_type": "klaviyo-onsite-embed",
      "block_key": "2632fe16-c075-4321-a88b-50b567f42507",
      "enabled": true,
      "settings": {},
      "status": "migrated",
      "notes": "Requires Klaviyo app installed on dev store to function"
    },
    {
      "app": "triple-pixel",
      "block_type": "script-tag",
      "block_key": "abc123...",
      "enabled": true,
      "settings": { "pixel_id": "..." },
      "status": "migrated",
      "notes": "Tracking pixel — works automatically if app is installed"
    }
  ],
  "summary": {
    "total": 15,
    "migrated": 15,
    "already_present": 0,
    "requires_app_install": 15
  }
}
```

**Important:** App embeds only function if the corresponding Shopify app is **installed on the store**. On a dev store, many embeds will be inert because the app isn't installed. This is expected — the embeds are pre-configured so they activate automatically when the theme goes live on the production store (where the apps are installed). Note this in the inventory.

**Present summary to user:**

> **App embeds migrated:** {N} app embeds copied from base theme to target.
> - {list each app name and block type}
>
> ⚠️ These embeds require their apps to be installed on the store. On dev, they'll be inert. On production, they'll activate automatically.

### Step 5.8: Audit Layouts for Third-Party Scripts

Compare `layout/theme.liquid` (and any other layout files) between the base and target themes. Third-party apps sometimes inject code directly into layouts via Shopify's theme editor, or merchants/developers add custom script tags manually.

1. **Read base layout**: Read `.theme-forge/base-cache/layout/theme.liquid` and any other layout files (`layout/checkout.liquid`, `layout/password.liquid`, etc.). For each, extract:
   - All `<script>` tags (inline and external `src=""`)
   - All `<link>` tags beyond standard Shopify
   - All `{% render %}` / `{% include %}` calls (and read the referenced snippets)
   - Any `{{ content_for_header }}` placement (standard — apps inject here automatically)
   - Any custom `<meta>` tags
   - Any `{% section %}` tags (section references in the layout)

2. **Read target layout**: Same extraction on the target theme's layout files.

3. **Diff and classify**: For each item found in the base but not in the target:
   - **Shopify-managed** (`{{ content_for_header }}`, `{{ content_for_layout }}`): These are standard. Apps inject via `content_for_header` automatically — no manual migration needed.
   - **App sections** (e.g., `{% section 'searchspring-results' %}`): May need to be added to target layouts.
   - **Custom scripts** (manually added `<script>` tags): Must be copied to target layout. These are often tracking pixels, chat widgets, or A/B testing tools added by the merchant's developer.
   - **Custom snippets** (e.g., `{% render 'custom-tracking' %}`): Copy both the render call and the snippet file.

4. **Save to inventory**: Add a `layout_audit` section to `.theme-forge/site-inventory.json`:

```json
{
  "layout_audit": {
    "base_layouts": ["theme.liquid", "password.liquid"],
    "custom_scripts": [
      {
        "file": "layout/theme.liquid",
        "type": "inline_script",
        "description": "Google Tag Manager container",
        "action": "copy_to_target"
      }
    ],
    "custom_snippets": [
      {
        "render_call": "{% render 'custom-tracking' %}",
        "snippet_file": "snippets/custom-tracking.liquid",
        "action": "copy_snippet_and_render_call"
      }
    ],
    "app_sections_in_layout": [],
    "shopify_managed": ["content_for_header", "content_for_layout"]
  }
}
```

5. **Apply**: Copy custom scripts and snippets to the target theme. For custom snippets, copy both the snippet file and add the `{% render %}` call to the target layout in the same position (before `</head>`, before `</body>`, etc.).

**Present summary:**

> **Layout audit complete:**
> - Base layouts: {list}
> - Custom scripts found: {N} — {list descriptions}
> - Custom snippets found: {N} — {list}
> - Shopify-managed (auto-migrated): content_for_header, content_for_layout
>
> {N} items copied to target layout.

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

Save to `.theme-forge/`:

1. `site-inventory.json` — Full inventory of both themes (including layout audit results)
2. `settings-map.json` — Global settings cross-reference (typography, colors, spacing, features)
3. `class-map.json` — CSS class, custom property, and component pattern cross-reference
4. `template-map.json` — Every base template classified with full section→snippet→asset dependency cascade
5. `app-embeds.json` — App embeds inventory and migration status
6. `plan.json` — Migration plan with phases and effort estimates

Commit all files to git.

### Step 8: Apply Global Settings (`--apply-globals`)

**This step runs automatically at the end of scan** unless `--no-apply-globals` is passed.

Using the `settings-map.json` generated in Step 5.5, apply the base theme's global settings to the target theme's `config/settings_data.json`. This ensures every section starts from the correct baseline instead of each pull-section overriding the same defaults with CSS `!important`.

**What to apply:**

1. **Typography** — For each typography setting where `override_needed: true`:
   - Set the target theme's font family, weight, size, letter-spacing to match base values
   - Use the target theme's setting key from the map (e.g., set `--font-heading--weight` to `200`)

2. **Colors** — For each color scheme mapping:
   - Set the target theme's color scheme values to match the base theme's colors
   - Create new color schemes if needed for base colors that don't have a close match

3. **Spacing** — Set section padding defaults to match base theme

4. **Features** — Enable/disable feature toggles to match base theme (sticky header, announcement bar, etc.)

**What NOT to apply:**
- Section-level settings (those are per-section, handled by pull-section)
- Content (text, images, links — handled by pull-section)
- Layout choices that depend on section structure

**After applying, present a summary:**

> **Global settings applied to target theme:**
> - Typography: heading font set to Spectral 200, letter-spacing -0.02em
> - Colors: scheme-1 text updated #333 → matches base, scheme-3 created for #4c544c backgrounds
> - Spacing: section padding set to 36px top/bottom
> - Features: sticky header enabled, announcement bar enabled
>
> {N} settings changed in `config/settings_data.json`.

Commit the changes:
```bash
git add config/settings_data.json .theme-forge/
git commit -m "theme-forge: apply global settings from base theme"
git push
```

### Step 8.5: ⛔ MERGE POINT — PR and Merge to Main

**Global settings affect every section on every page.** This must be on main before any section work begins. Header, footer, and all page branches must start from this baseline.

Create a PR:
```bash
gh pr create --title "theme-forge: scan + apply global settings" \
  --body "Site inventory, settings map, class map, and global settings applied (fonts, colors, spacing). Must be on main before header/footer/page work begins."
```

Tell the user:

> **PR created. Please review and merge to main.** Global settings (fonts, colors, spacing) are applied. Every future branch (header, footer, pages) needs this as its baseline.

Wait for the user to confirm the merge. After merge, create a new branch for header/footer:
```bash
git checkout main && git pull && git checkout -b theme-forge/header-footer
```

### Step 9: Recommend Next Steps

After scan completes and branch is merged to main, present the recommended workflow:

> **Scan complete and merged to main.** Here's the recommended order:
>
> 1. ~~Apply global settings~~ ✓ Done (fonts, colors, spacing applied)
> 2. `/theme-forge pull-header` — Pull the site header (appears on every page)
> 3. `/theme-forge pull-footer` — Pull the site footer (appears on every page)
> 4. **Merge header/footer to main** — these appear on every page, must be shared
> 5. `/theme-forge pull-page index` — Start pulling the homepage
>
> **Git strategy for parallel sessions:**
> ```
> main: base theme → onboard → globals → header/footer → ──────────────→ merge pages
>                                                          \             /
> page branches:                                            └─ pull-page ─┘
> ```
> After header/footer are merged to main, open additional sessions and branch from main for each page. Each page branch PRs back to main when complete.

## Output Schema

### site-inventory.json

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "base_theme": {
    "name": "Legacy Theme",
    "path": "../legacy-theme-export",
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
