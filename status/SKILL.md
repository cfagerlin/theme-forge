---
name: status
description: >
  Human-readable migration progress report. Reads JSON reports from .theme-forge/ and displays a clear summary of what has been mapped, pulled, and what remains.
  - MANDATORY TRIGGERS: theme-forge status, migration status, migration progress, what's done, what's left
---

# status — Migration Progress Report

Read all JSON state in `.theme-forge/` and produce a clear, human-readable progress report.

## Prerequisites

- `.theme-forge/config.json` must exist

## Arguments

```
/theme-forge status [--detail] [--page <template>] [--next]
```

- `--detail` shows per-section breakdowns. Without it, shows summary only.
- `--page <template>` shows sections on a specific page with their pull commands (see Quick Query below).
- `--next` shows just the next section to pull with a ready-to-run command.

## Workflow

### Step 1: Load All State

Read from `.theme-forge/`:

1. `config.json` — Project configuration
2. `mappings/sections/*.json` — All section mappings
3. `mappings/pages/*.json` — All page mappings
4. `reports/sections/*.json` — All section pull reports
5. `reports/pages/*.json` — All page pull reports
6. `reports/review-*.json` — All review reports
7. `site-inventory.json` — Full inventory (if full scan has been run, optional)
8. `plan.json` — Migration plan (if full scan has been run, optional)

### Step 2: Compute Progress

Section reports are the primary source of truth. A section's status is determined by its report file at `.theme-forge/reports/sections/{name}.json`:
- Report exists with `status: "completed"` or `"completed_code_only"` → done
- Report exists with `status: "failed"` → failed
- Report exists with `status: "skipped"` → skipped
- No report exists but mapping exists → pending (not started)
- No mapping exists → not scanned yet

For each page in the migration plan:

1. Count sections: total, mapped, pulled (completed + completed_code_only), failed, skipped, reviewed
2. Determine page status:
   - `not_started` — No mappings or reports exist
   - `mapped` — All sections mapped but not pulled
   - `in_progress` — Some sections pulled
   - `pulled` — All sections pulled (completed or completed_code_only)
   - `reviewed` — Review completed
   - `complete` — Review passed

### Step 3: Generate Report

Print a summary like:

```
═══════════════════════════════════════════
  theme-forge — Migration Status
  Project: Legacy Theme → Horizon
  Live: https://example.com
═══════════════════════════════════════════

  OVERALL PROGRESS
  ────────────────
  Sections mapped:  18 / 42  (43%)
  Sections pulled:  12 / 42  (29%)
  Sections failed:   2 / 42  ( 5%)
  Pages reviewed:    1 / 7   (14%)

  PAGE BREAKDOWN
  ────────────────
  ✅ Homepage (index)     8/8 pulled, reviewed ✓
  🔄 Product (product)   3/6 pulled
  📋 Collection           mapped, not started
  ⬜ Cart                 not started
  ⬜ Blog                 not started
  ⬜ Article              not started
  ⬜ Search               not started

  SHARED SECTIONS
  ────────────────
  ✅ Header               pulled, reviewed ✓
  🔄 Footer               3/4 sub-sections pulled
  ⬜ Announcement Bar     not started

  FAILED SECTIONS
  ────────────────
  ❌ hero-slideshow:index    css_override_failed (3 attempts)
     → Try creating extension section for font-weight control
  ❌ product-gallery:product  schema_incompatible (1 attempt)
     → Target schema lacks video block

  OUTSTANDING ISSUES
  ────────────────
  2 major variances (homepage hero, product gallery)
  5 minor variances (logged, non-blocking)

  NEXT RECOMMENDED ACTIONS
  ────────────────
  1. Run: /theme-forge pull-section product-gallery
  2. Run: /theme-forge pull-footer (1 sub-section remaining)
  3. Run: /theme-forge pull-page collection
  4. Run: /theme-forge --full --retry-failed (retry all failures)
═══════════════════════════════════════════
```

### Step 4: Detail Mode

If `--detail` is passed, additionally show:

1. Per-section status for each page:
   ```
   Homepage Sections:
   ├── ✅ hero-slideshow      Compatible → pulled (3 CSS overrides)
   ├── ✅ featured-collection  Partially compatible → pulled (5 changes)
   ├── ✅ dynamic-collections  Custom build → pulled (1 outstanding issue)
   └── ✅ trust-bar           Custom build → pulled
   ```

2. Outstanding issues with details:
   ```
   Outstanding Issues:
   ├── [major] hero-slideshow: Heading font-weight renders 400 vs 200
   │   Root cause: Horizon CSS variable needs !important
   │   Suggested: Add font-weight: 200 !important
   └── [minor] dynamic-collections: Bottom padding 8px over
       Root cause: Horizon spacing system minimum
       Status: Accepted variance
   ```

### Quick Query: `--page <template>`

When `--page` is provided, skip the full report. Instead, list every section on that page with its status and the exact `pull-section` command to run. Read the page mapping from `.theme-forge/mappings/pages/{template}.json` and cross-reference with section reports in `.theme-forge/reports/sections/`:

```
Homepage (index) — 5 sections
─────────────────────────────
 #  Status       Section Type                  Pull Command
 1  ✅ completed  hero                          /theme-forge pull-section hero --page index
 2  ✅ completed  custom-cta-gallery            /theme-forge pull-section custom-cta-gallery --page index
 3  ❌ incomplete custom-testimonial-carousel   /theme-forge pull-section custom-testimonial-carousel --page index
 4  ⬜ pending    product-list                  /theme-forge pull-section product-list --page index
 5  ⬜ pending    custom-brand-story            /theme-forge pull-section custom-brand-story --page index
                  (live: home_anatomy)
```

**Include the base/live section name** in parentheses when it differs from the target section type (read from the section mapping's `base_section` field). This helps the user connect what they see on the live site with the command they need to run.

### Quick Query: `--next`

When `--next` is provided, skip the full report. Find the first section with status `pending` or `incomplete` (in page order: index first, then product, collection, remaining) and print:

```
Next section: custom-testimonial-carousel (live: how_it_works) on index

  /theme-forge pull-section custom-testimonial-carousel --page index
```

If all sections are completed, say so and suggest running `review`.

## Natural Language Routing

The orchestrator should route these natural questions to `status`:

- "what's next?" / "next section" → `status --next`
- "list sections on homepage" / "show me the index sections" → `status --page index`
- "what sections are left?" → `status --detail`

## Output

- Human-readable report printed to conversation
- No files written (this is a read-only command)
