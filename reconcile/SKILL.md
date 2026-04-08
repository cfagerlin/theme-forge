---
name: reconcile
description: >
  Detect work already done in an in-progress Shopify theme migration. Diffs the target theme against its baseline, identifies custom sections, evaluates completeness, and creates report stubs so status and review reflect reality.
  - MANDATORY TRIGGERS: theme-pull reconcile, reconcile, import progress, pick up where we left off, detect existing work, resume migration
---

# reconcile — Detect Existing Migration Work

For migrations already in progress. Analyzes the target theme to figure out what work has been done, creates JSON report stubs, and feeds into `status` and `review`.

## When to Use

Run `reconcile` when:
- You're adopting theme-pull on a migration that's already underway
- Work was done manually or in prior sessions without theme-pull state
- You want `status` to reflect real progress, not show 0%

## Prerequisites

- `.theme-pull/config.json` must exist (run `onboard` first)
- The target theme should have some work already done (custom sections, modified settings, etc.)

## Arguments

```
/theme-pull reconcile [--page <template>] [--dry-run]
```

- `--page <template>` — Only reconcile sections on a specific page. Without this, reconciles all pages.
- `--dry-run` — Show what would be detected without writing any reports.

## Workflow

### Step 1: Load Context

1. Read `.theme-pull/config.json` for paths and extension prefix
2. Load `site-inventory.json` if it exists (from a prior `scan`). If not, run a lightweight inventory of just the template JSON files in both themes.
3. Check for any existing `SECTION_NOTES.md` or similar documentation from prior work

### Step 2: Detect Custom Sections

Find all extension-layer files in the target theme:

```
sections/{prefix}*.liquid
snippets/{prefix}*.liquid
assets/{prefix}*.css
assets/{prefix}*.js
blocks/{prefix}*.liquid
```

For each custom section found:
1. Record the filename, line count, and last-modified date
2. Parse its `{% schema %}` to understand its settings and blocks
3. Check which template JSON files reference it (this tells us which pages it's on)
4. Look for a corresponding base-theme section it was likely built to replace

### Step 3: Detect Modified Settings

Compare template JSON files between base and target themes:

For each template (index.json, product.json, etc.):
1. Parse both the base and target versions
2. For each section in the target template:
   - Is it a custom section type? → Already captured in Step 2
   - Is it a core section with modified settings? → Compare setting values against base defaults
   - Are there new sections not present in the base template? → Flag as additions
3. Record which settings were changed and what they were changed to

### Step 4: Detect CSS Overrides

Check for extension CSS that targets specific sections:

1. Read `assets/{prefix}.css` (e.g., `assets/custom.css`) if it exists
2. Parse CSS rules and try to associate them with sections by selector patterns
3. Count override rules per section

### Step 5: Evaluate Completeness

For each section that has been worked on, produce a completeness assessment:

#### Code-Level Signals (what reconcile can measure)

| Signal | Weight | How it's measured |
|--------|--------|-------------------|
| **Settings coverage** | High | What % of the base section's settings have corresponding values in the target? |
| **Content populated** | High | Are text, image, and link settings filled in (not empty/default)? |
| **CSS overrides exist** | Medium | Does the section have custom CSS rules? |
| **Schema parity** | Medium | Does the target section's schema cover the base section's settings? |
| **Block count match** | Low | Does the target have the same number of configured blocks? |

#### Completeness Tiers

Based on the signals above, assign a tier:

| Tier | Criteria | Meaning |
|------|----------|---------|
| **Done** | ≥90% settings coverage, content populated, CSS exists if needed | Likely complete — run `review` to verify visually |
| **Mostly done** | 70-89% settings coverage, most content populated | Significant work done, some gaps remain |
| **In progress** | 30-69% settings coverage, partial content | Started but substantial work remains |
| **Scaffolded** | Custom section exists but <30% settings coverage | Structure created, needs configuration |
| **Not started** | No custom section, no setting changes | No work detected |

**Important**: These tiers are code-level estimates only. A section could be "Done" by code signals but still have visual variances that only `review` can catch. Reconcile is optimistic — it tells you what's probably done. Review is the ground truth.

### Step 6: Parse Existing Notes

If `SECTION_NOTES.md` or similar documentation exists:

1. Parse section headers and their contents
2. Extract:
   - Changes listed as completed
   - Outstanding issues noted
   - Accepted variances (things explicitly marked as "close enough")
3. Include these in the report stubs so `review` knows about accepted variances

### Step 7: Write Reports

For each section with detected work, write to `.theme-pull/reports/sections/{section-name}.json`:

```json
{
  "generated_at": "2026-04-07T22:00:00Z",
  "source": "reconcile",
  "section": "custom-dynamic-collections",
  "base_section": "sections/gldn-dynamic-collections.liquid",
  "target_section": "sections/custom-dynamic-collections.liquid",
  "status": "imported",
  "completeness": {
    "tier": "done",
    "settings_coverage": 0.95,
    "content_populated": true,
    "css_overrides": 12,
    "schema_parity": 0.88,
    "block_count_match": true
  },
  "detected_changes": [
    {
      "type": "custom_section_created",
      "file": "sections/custom-dynamic-collections.liquid",
      "lines": 285
    },
    {
      "type": "json_settings",
      "file": "templates/index.json",
      "settings_configured": 14
    },
    {
      "type": "css_overrides",
      "file": "sections/custom-dynamic-collections.liquid",
      "rules_count": 12
    }
  ],
  "from_notes": {
    "changes_documented": [
      "Title font-size adjusted to 1.625em (26px) to match live",
      "Subtitle font-size adjusted to 0.6875em (11px)",
      "Bottom padding set to 92 in JSON"
    ],
    "outstanding_issues": [
      "Bottom padding 8px larger than live (112px vs 104px) — Horizon spacing system"
    ],
    "accepted_variances": [
      {
        "description": "Bottom padding 8px over due to Horizon spacing minimum",
        "severity": "minor",
        "reason": "Horizon's min() formula adds unavoidable overhead"
      }
    ]
  },
  "files_detected": [
    "sections/custom-dynamic-collections.liquid",
    "templates/index.json"
  ],
  "recommendation": "Run /theme-pull review index to verify visually"
}
```

**Key field: `accepted_variances`** — These carry forward into `review`. When review encounters a variance that matches an accepted one, it marks it as `accepted` rather than flagging it as new work. This is how "close enough" decisions persist across sessions.

### Step 8: Summary

Print a summary:

```
═══════════════════════════════════════════
  theme-pull reconcile — Results
═══════════════════════════════════════════

  Detected work on 4 sections:

  ✅ custom-dynamic-collections  [Done]
     95% settings coverage, 12 CSS overrides
     1 accepted variance (padding)

  ✅ custom-footer-trust-bar     [Done]
     92% settings coverage, 8 CSS overrides
     Icons migrated to image_picker

  🔄 custom-hero-slideshow       [Mostly done]
     78% settings coverage, 3 CSS overrides
     Missing: mobile breakpoint styles

  📐 custom-featured-collection  [Scaffolded]
     Section file exists, 15% settings coverage

  Sections with no detected work: 12

  Next steps:
    /theme-pull status         — See full progress dashboard
    /theme-pull review index   — Verify completed sections visually
    /theme-pull pull-section custom-hero-slideshow --page index
                               — Finish in-progress sections
═══════════════════════════════════════════
```

## Idempotency

Running `reconcile` multiple times is safe:
- If a report already exists with `source: "reconcile"`, it will be updated (not duplicated)
- If a report exists with `source: "pull-section"` (from actual theme-pull work), reconcile will NOT overwrite it — pull-section reports are higher fidelity
- Accepted variances from notes are merged, not replaced

## Output

- `.theme-pull/reports/sections/{section-name}.json` for each detected section (with `status: "imported"`)
- Summary printed to conversation
- No files in the target theme are modified (reconcile is read-only)
