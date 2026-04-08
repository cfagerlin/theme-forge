---
name: map-section
description: >
  Assess compatibility between a live/base theme section and the target theme. Finds the best match, compares schemas, and produces a compatibility report.
  - MANDATORY TRIGGERS: theme-pull map-section, map section, assess section, section compatibility
---

# map-section — Section Compatibility Assessment

Find the best target-theme match for a base-theme section and assess how much work is needed to replicate it.

## Prerequisites

- `.theme-pull/config.json` must exist (run `onboard` first)

## Arguments

```
/theme-pull map-section <section-name>
```

`<section-name>` is the base theme's section name (filename without `.liquid`), e.g., `featured-collection`, `slideshow`, `header`.

## Workflow

### Step 1: Load Section from Base Theme

1. Read `.theme-pull/config.json` for paths
2. Find the section in the base theme: `{base_theme}/sections/{section-name}.liquid`
3. Parse its `{% schema %}` block to extract:
   - Section name and class
   - All settings (id, type, default, label)
   - All block types and their settings
   - Presets
4. Analyze the section's CSS (inline `<style>` or `{% stylesheet %}` block):
   - Custom properties used
   - Breakpoints defined
   - Key layout patterns (grid, flex, absolute positioning)
5. Analyze the section's HTML/Liquid structure:
   - Key DOM elements and class names
   - Liquid logic branches
   - Snippet dependencies (`{% render %}` calls)
   - JavaScript dependencies (`{% javascript %}` or external script tags)

### Step 2: Find Candidates in Target Theme

Search the target theme's `sections/` directory for matches:

1. **Exact name match** — `{section-name}.liquid`
2. **Prefixed match** — `{extension_prefix}{section-name}.liquid`
3. **Fuzzy match** — Compare schema settings and HTML structure against all target sections:
   - Setting overlap: how many settings have matching IDs and types?
   - Block overlap: how many block types match?
   - Structural similarity: shared class names, similar DOM nesting
4. Rank candidates by match score

### Step 3: Deep Comparison

For the top candidate (or the user-specified target section):

1. **Schema comparison** — Side-by-side setting comparison:

   ```json
   {
     "setting_id": "heading",
     "base": { "type": "text", "default": "Featured Collection" },
     "target": { "type": "inline_richtext", "default": "" },
     "status": "compatible",
     "notes": "Type differs but functionally equivalent"
   }
   ```

   Status values:
   - `exact` — Same ID, same type, same behavior
   - `compatible` — Same ID, different type but functionally equivalent
   - `missing_in_target` — Setting exists in base but not target
   - `missing_in_base` — Setting exists in target but not base (extra feature)
   - `incompatible` — Same ID but fundamentally different behavior

2. **Block comparison** — Compare block types and their settings
3. **CSS comparison** — Compare key visual properties:
   - Layout model (grid vs flex vs block)
   - Responsive breakpoints
   - Typography approach
   - Color handling (CSS variables vs hardcoded)
4. **Feature comparison** — Functional capabilities:
   - Animations/transitions
   - Interactive elements (carousels, accordions, tabs)
   - Lazy loading / performance patterns
   - Accessibility patterns

### Step 4: Compatibility Assessment

Rate overall compatibility:

| Level | Criteria | Action Required |
|-------|----------|-----------------|
| **Compatible** | ≥80% setting overlap, same layout model, no missing features | JSON settings only |
| **Partially Compatible** | ≥50% setting overlap, similar layout, gaps fillable with CSS | JSON + CSS overrides |
| **Requires Customization** | <50% overlap or different layout model, but same general purpose | Extension section + CSS + possibly JS |
| **Incompatible** | Fundamentally different purpose or structure | Custom section from scratch |

### Step 5: Write Report

Save to `.theme-pull/mappings/sections/{section-name}.json`:

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "base_section": {
    "name": "slideshow",
    "file": "sections/slideshow.liquid",
    "settings_count": 15,
    "blocks_count": 3,
    "block_types": ["slide"],
    "has_css": true,
    "has_js": true,
    "breakpoints": [800, 480],
    "snippet_deps": ["responsive-image"],
    "features": ["autoplay", "pagination", "swipe"]
  },
  "target_section": {
    "name": "slideshow",
    "file": "sections/slideshow.liquid",
    "is_core": true,
    "settings_count": 12,
    "blocks_count": 2
  },
  "compatibility": {
    "level": "partially_compatible",
    "score": 0.65,
    "settings_overlap": 0.73,
    "blocks_overlap": 0.67,
    "structural_similarity": 0.55
  },
  "settings_comparison": [...],
  "blocks_comparison": [...],
  "gaps": [
    {
      "type": "missing_setting",
      "id": "autoplay_speed",
      "description": "Base theme has autoplay speed control, target does not",
      "severity": "low",
      "fix": "css_override"
    }
  ],
  "recommendation": {
    "approach": "json_and_css",
    "effort": "medium",
    "steps": [
      "Align JSON settings (heading, subheading, colors)",
      "Add CSS overrides for font sizing and letter-spacing",
      "Create custom overlay gradient (base uses partial, target uses full)"
    ]
  }
}
```

## Output

- `.theme-pull/mappings/sections/{section-name}.json` — Compatibility report
- Summary printed to conversation
