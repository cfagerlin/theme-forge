---
name: status
description: >
  Human-readable migration progress report. Reads JSON reports from .theme-pull/ and displays a clear summary of what has been mapped, pulled, and what remains.
  - MANDATORY TRIGGERS: theme-pull status, migration status, migration progress, what's done, what's left
---

# status — Migration Progress Report

Read all JSON state in `.theme-pull/` and produce a clear, human-readable progress report.

## Prerequisites

- `.theme-pull/config.json` must exist

## Arguments

```
/theme-pull status [--detail]
```

`--detail` shows per-section breakdowns. Without it, shows summary only.

## Workflow

### Step 1: Load All State

Read from `.theme-pull/`:

1. `config.json` — Project configuration
2. `site-inventory.json` — Full inventory (if scan has been run)
3. `plan.json` — Migration plan (if scan has been run)
4. `mappings/sections/*.json` — All section mappings
5. `mappings/pages/*.json` — All page mappings
6. `reports/sections/*.json` — All section pull reports
7. `reports/pages/*.json` — All page pull reports
8. `reports/review-*.json` — All review reports

### Step 2: Compute Progress

For each page in the migration plan:

1. Count sections: total, mapped, pulled, reviewed
2. Determine page status:
   - `not_started` — No mappings or reports exist
   - `mapped` — All sections mapped but not pulled
   - `in_progress` — Some sections pulled
   - `pulled` — All sections pulled
   - `reviewed` — Review completed
   - `complete` — Review passed

### Step 3: Generate Report

Print a summary like:

```
═══════════════════════════════════════════
  theme-pull — Migration Status
  Project: GLDN Legacy → Horizon
  Live: https://gldn.com
═══════════════════════════════════════════

  OVERALL PROGRESS
  ────────────────
  Sections mapped:  18 / 42  (43%)
  Sections pulled:  12 / 42  (29%)
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

  OUTSTANDING ISSUES
  ────────────────
  2 major variances (homepage hero, product gallery)
  5 minor variances (logged, non-blocking)

  NEXT RECOMMENDED ACTIONS
  ────────────────
  1. Run: /theme-pull pull-section product-gallery
  2. Run: /theme-pull pull-footer (1 sub-section remaining)
  3. Run: /theme-pull pull-page collection
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

## Output

- Human-readable report printed to conversation
- No files written (this is a read-only command)
