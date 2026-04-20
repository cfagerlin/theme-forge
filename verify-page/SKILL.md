---
name: verify-page
description: >
  Run regression assertions across every section on a template page. Loops verify-section
  for each section that has an assertions.json, aggregates results, and prints a single
  page-level report. Read-only.
  - MANDATORY TRIGGERS: theme-forge verify-page, verify page, regression test page, check page assertions, run page checks
---

# verify-page — Page-Level Regression Runner

Loop `verify-section` across every section on a template page that has saved
assertions. Emit a single consolidated report with per-section breakdowns and one
page-level summary line.

## When this runs

1. **Manually**, any time, after sections have been refined and promoted.
2. **After bulk refactors** (CSS rename, design token update, theme-wide change) to
   catch cross-section regressions in one pass.
3. **NOT from `pull-page` or `refine-page`.** The read-only contract (inherited from
   `verify-section`) forbids coupling verify into the pull pipeline.

## Arguments

```
/theme-forge verify-page <template> [options]
```

**Required:**
- `<template>` — e.g., `index`, `product`, `collection`

**Options:**
- `--only <section-key>` — limit to a single section (equivalent to
  `verify-section <section-key> --page <template>`)
- `--rebaseline` — forwarded to each verify-section run (interactive per STALE)
- `--format <terminal|markdown>` — output target (default `terminal`)

## Read-only contract (inherited)

verify-page calls verify-section per section. Neither command mutates code. Neither
invokes refine. The page-level report ends with a consolidated next: line for each
FAIL across the page.

## Discovery

To find which sections to verify on a template:

1. Read `.theme-forge/verify/` subdirectories
2. For each subdirectory, read `assertions.json`
3. Filter to those where `page === <template>` (or section appears on template per
   `.theme-forge/reports/sections/<section>.json`)
4. Skip sections without `assertions.json` (not an error — just nothing to verify)

If zero sections have assertions for this page, print:

```
No assertions yet for template "<template>".

Run this to promote section variances into assertions:
  /theme-forge refine-page <template>
```

Exit 0.

## Execution

For each section in discovery order:

1. Invoke `verify-section <section-key> --page <template>` (same arguments
   forwarded: `--rebaseline`, etc.)
2. Collect the per-section run log from
   `.theme-forge/verify/<section-key>/run-logs/<latest>.json`
3. Accumulate into a page-level totals object

Do not short-circuit on FAIL or STALE. Run every section, always.

## Output (terminal, primary)

```
verify-page index

──── header ────
PASS  logo:width:desktop:default
PASS  nav:fontSize:desktop:default
FAIL  cta:backgroundColor:mobile:default
  expected: rgb(20, 110, 200)  actual: rgb(50, 50, 50)

──── hero-1 ────
PASS  (all 4 assertions)

──── featured-collection ────
STALE heading:fontWeight:tablet:default
  selector: .old-heading  (not found)

──── product-list ────
PASS  (all 6 assertions)

──────────────────────────────────────────────
Page summary — index
  4 sections · 13 assertions
  11 PASS · 1 FAIL · 1 STALE · 0 ERROR

Failures to fix:
  /theme-forge refine-section header --page index --variances ".cta-button:backgroundColor"

Stale assertions:
  /theme-forge verify-section featured-collection --page index --rebaseline

Run logs: .theme-forge/verify/*/run-logs/20260419-164201.json
```

### Multi-section FAIL consolidation

If FAILs span multiple sections, verify-page prints one `refine-section` command
per section (not one consolidated line), because `refine-section` is scoped to a
single section at a time.

### PASS-only collapsing

When every assertion in a section passes, collapse to one line: `PASS  (all N
assertions)`. Don't flood the terminal with green.

## Output (markdown, when `--format markdown`)

Write to `.theme-forge/verify/_page-reports/<template>-<timestamp>.md`. Same content
as terminal output but markdown-formatted. Useful for pasting into a PR description
or email. Never overwrites per-section `generated.md` — page reports are separate.

## Page run log

After all sections complete, write:

```
.theme-forge/verify/_page-reports/<template>-<timestamp>.json
```

```json
{
  "timestamp": "2026-04-19T16:42:01Z",
  "template": "index",
  "sections_verified": ["header", "hero-1", "featured-collection", "product-list"],
  "totals": { "pass": 11, "fail": 1, "stale": 1, "error": 0 },
  "sections": {
    "header": { "pass": 2, "fail": 1, "stale": 0, "error": 0 },
    "hero-1": { "pass": 4, "fail": 0, "stale": 0, "error": 0 },
    "featured-collection": { "pass": 0, "fail": 0, "stale": 1, "error": 0 },
    "product-list": { "pass": 6, "fail": 0, "stale": 0, "error": 0 }
  },
  "failures": [
    {
      "section": "header",
      "assertion_id": "cta:backgroundColor:mobile:default",
      "next": "/theme-forge refine-section header --page index --variances \".cta-button:backgroundColor\""
    }
  ],
  "stale": [
    {
      "section": "featured-collection",
      "assertion_id": "heading:fontWeight:tablet:default",
      "next": "/theme-forge verify-section featured-collection --page index --rebaseline"
    }
  ]
}
```

## MVP Cut (what's IN v1)

- `/theme-forge verify-page <template>` (read-only)
- Discovery via `.theme-forge/verify/<section-key>/assertions.json` files
- Loops verify-section per section, no short-circuit
- PASS-only collapsing (one line per all-green section)
- Multi-section FAIL list with per-section refine commands
- Page run log in `.theme-forge/verify/_page-reports/`
- Forwards `--rebaseline` to each verify-section run
- Empty-state message when no assertions exist for the page

## NOT in scope (v2+)

- `/theme-forge verify --all` (all templates)
- Parallel section execution
- Retries on ERROR
- CI-style exit codes (non-zero on FAIL) — v1 exit is always 0 (informational)
- Pass/fail trend graphs over time
- Integration with `review` skill

## Verification suite (T8-T10) — blocking for merge

- **T8 Empty page → empty-state.** Template with no sections having assertions →
  prints empty-state message, exit 0.
- **T9 Mixed results aggregate correctly.** 4 sections: 2 all-PASS, 1 with FAIL,
  1 with STALE → page totals match section totals, per-section next: commands
  printed correctly.
- **T10 All-PASS collapses.** Section with 6 assertions, all PASS → one line
  `PASS  (all 6 assertions)`, not 6 separate PASS lines.

## Hard rules summary

1. **Read-only.** Inherited from verify-section. Never edits code, never invokes refine.
2. **No short-circuit.** Runs every section regardless of failures in earlier ones.
3. **Per-section refine commands.** refine-section is single-section only; don't
   fake a page-level refine.
4. **Page reports separate from section reports.** `_page-reports/` is its own
   directory; section `generated.md` files untouched.
