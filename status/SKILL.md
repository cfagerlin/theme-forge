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
/theme-forge status [--detail]
```

`--detail` shows per-section breakdowns. Without it, shows summary only.

## Workflow

### Step 1: Load All State

Read from `.theme-forge/`:

1. `config.json` — Project configuration
2. `state.json` — Pipeline state machine (if any pull has been run)
3. `site-inventory.json` — Full inventory (if scan has been run)
4. `plan.json` — Migration plan (if scan has been run)
5. `mappings/sections/*.json` — All section mappings
6. `mappings/pages/*.json` — All page mappings
7. `reports/sections/*.json` — All section pull reports
8. `reports/pages/*.json` — All page pull reports
9. `reports/review-*.json` — All review reports

### Step 2: Compute Progress

If `state.json` exists, use it as the primary source of truth for section status. Fall back to reports/ directory scanning only if state.json is missing (pre-0.4.0 projects).

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
  Project: GLDN Legacy → Horizon
  Live: https://gldn.com
═══════════════════════════════════════════

  PIPELINE STATE
  ────────────────
  Lock: none (or: locked by session-1712577600, 12 min ago)

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
  4. Run: /theme-forge --full --reset-failed (retry all failures)
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
