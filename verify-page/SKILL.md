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
- `--rebaseline` — forwarded to each verify-section run (interactive per STALE).
  In case mode, `--rebaseline --cases` requires `--yes` (matrix multiplier
  acknowledgement — one STALE prompt per cell gets overwhelming fast).
- `--breakpoint <name>` — forwarded to each verify-section run. Restricts every
  section to assertions at that breakpoint only (`desktop`, `tablet`, or `mobile`).
  Sections with zero assertions at the target breakpoint are reported as
  `(no assertions at <name>)` and skipped without spinning up a browser. Every
  per-section `next:` line in the page report carries the same `--breakpoint` flag,
  so the followup `refine-section` / `verify-section` calls stay scoped.
- `--cases` — enable multi-case matrix mode. Iterates every `active` case from
  `.theme-forge/cases/<template>.json`. For each case, verifies every section
  with assertions. Emits a matrix-style summary. Alias: `--archetypes`.
- `--case <key>` — scope the run to one case only (still multi-section).
  Mutually exclusive with `--cases` — passing both hard-errors.
- `--live-url <origin>` — override the live origin for this run (stateless
  URL resolution). Paired with `--dev-url`. Passing one without the other
  hard-errors.
- `--dev-url <origin>` — override the dev origin for this run. Paired with
  `--live-url`.
- `--yes` — acknowledge the matrix multiplier for destructive flags
  (`--rebaseline --cases`). Without `--yes`, `--rebaseline --cases` hard-errors
  and prints the cell count that would be affected.
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

In case mode, the filter is identical (one assertions.json per section — case
is a field inside assertion entries, not a file-level partition). For each
discovered section, the per-cell filter is:
- `assertion.case === <scoped-case-key>` (case-specific)
- OR `assertion.case === null` / missing (universal — applies to all cases)

Sections with zero assertions matching the scoped case are skipped with
`(no assertions for <case>)` — not an error.

If zero sections have assertions for this page, print:

```
No assertions yet for template "<template>".

Run this to promote section variances into assertions:
  /theme-forge refine-page <template>
```

In case mode, if the `.theme-forge/cases/<template>.json` file is missing,
hard-error BEFORE any section discovery:

```
ERROR: No cases file for template "<template>".

Expected:
  .theme-forge/cases/<template>.json

Create it with:
  /theme-forge intake-cases <template> --from <screenshot-or-csv>
```

Exit 0 on empty discovery (not an error). Exit nonzero on missing cases file
in case mode (configuration error).

## Execution

**Legacy path (no `--cases` / `--case`)** — for each section in discovery order:

1. Invoke `verify-section <section-key> --page <template>` (same arguments
   forwarded: `--rebaseline`, `--breakpoint`, etc.)
2. Collect the per-section run log from
   `.theme-forge/verify/<section-key>/run-logs/<latest>.json`
3. Accumulate into a page-level totals object

Do not short-circuit on FAIL or STALE. Run every section, always.

When `--breakpoint <name>` is set: validate `<name>` is `desktop`, `tablet`, or
`mobile` once at page entry (hard-error otherwise), then forward verbatim to every
verify-section call. Sections whose assertion file has no entries at the target
breakpoint get a single-line `── <section> ── (no assertions at <name>)` and are
not executed. Page summary counts only the executed sections + assertions.

Every `next:` line written to the page report MUST include `--breakpoint <name>`
when the page run was scoped, so a user iterating mobile-only stays mobile-only
across the whole loop.

**Case-mode path (`--cases` or `--case`)** — iterate the matrix:

1. **Preflight.** Reject `--cases` + `--case` combo (hard-error). Read
   `.theme-forge/cases/<template>.json`, validate every active case has a
   `path` starting with `/`, resolve scoped cases (`--case <key>` = one; 
   `--cases` = all active). Print dormant / draft cases as skipped.

2. **Rebaseline gate.** If `--rebaseline --cases` and NOT `--yes`:
   ```
   ERROR: --rebaseline --cases is destructive across the whole matrix.

   This would prompt for STALE rewrites across <C> cases × <S> sections ×
   <B> breakpoints = <cells> cells.

   Re-run with --yes to acknowledge:
     /theme-forge verify-page <template> --cases --rebaseline --yes
   ```
   Exit nonzero.

3. **Loop ordering.** Outer loop = breakpoint (one browser resize per sweep),
   middle loop = case (one navigate per case change), inner loop = section.
   Mirrors refine-page's matrix loop so cache semantics align.

   ```
   for bp in [breakpoints in scope]:
     resize browser to bp
     for case in [scoped active cases]:
       navigate to live_url + case.path
       navigate to dev_url + case.path
       for section in [sections with assertions matching (bp, case)]:
         invoke verify-section <section-key> \
           --page <template> \
           --case <case-key> \
           --breakpoint <bp> \
           --live-url <live_url> \
           --dev-url <dev_url>
   ```

   verify-section already understands `--case` (task #46) and filters its
   assertion scope to that case + universals. No new filtering needed here.

4. **Cell identity + status.** Each cell is one (template, section,
   breakpoint, case) tuple. Cell status derives from verify-section's run log:
   - `PASS` — all assertions in scope passed
   - `FAIL` — ≥1 assertion failed
   - `STALE` — ≥1 assertion's selector resolved missing (not an assertion
     failure; a selector-drift signal)
   - `ERROR` — infrastructure failure
   - `SKIP` — no assertions matched this cell

   No short-circuit. Run every cell, always.

5. **Per-cell delta vs prior run.** If a prior page-matrix report exists at
   `.theme-forge/verify/_page-reports/<template>-matrix-latest.json`, compare
   each cell's current status against the prior status. A cell is a
   **regression** iff prior was `PASS` and current is `FAIL`. Record regressions
   in the matrix report — refine-page's `--gate` step reads them.

## Output (terminal, primary — legacy mode)

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

### Output (terminal — case mode, TD-2 row layout)

Cases as rows, breakpoints as column groups, sections concat within a group:

```
verify-page product --cases

MATRIX RESULTS: product — 99/99 cells
════════════════════════════════════════════════════════════════════════
                     │ desktop        │ tablet         │ mobile
case                 │ H PF TB CC CTA │ H PF TB CC CTA │ H PF TB CC CTA
─────────────────────┼────────────────┼────────────────┼───────────────
full_personalizer    │ ✓ ✓  ✓  ✓  ✓  │ ✓ ✓  ✓  ✗  ✓  │ ✓ ✓  ✓  ✓  ✓
tag_personalizer     │ ✓ ✗  ✓  ✓  ✓  │ ✓ ✓  ✓  ✓  ✓  │ ✓ ✓  ✓  ✓  ✓
ready_to_ship        │ ✓ ✓  ✓  ✓  ✓  │ ✓ ✓  ✓  ✓  ✓  │ ✓ ✓  ✓  ✓  ✓
...
════════════════════════════════════════════════════════════════════════
Legend: ✓ PASS  ✗ FAIL  S STALE  E ERROR  · SKIP
Sections: H=hero-1 PF=product-form TB=trust-bar CC=cross-sell CTA=sticky-cta

Totals: 97 PASS · 2 FAIL · 0 STALE · 0 ERROR · 0 SKIP

Regressions introduced since prior run:
  • product-form:color:desktop:tag_personalizer  (was PASS, now FAIL)

Failures to fix:
  /theme-forge refine-section product-form --page product --case tag_personalizer --variances ".btn:color"
  /theme-forge refine-section cross-sell --page product --case full_personalizer --breakpoint tablet --variances ".card:padding"

Run logs: .theme-forge/verify/*/run-logs/20260420-140200.json
Matrix report: .theme-forge/verify/_page-reports/product-matrix-20260420-140200.json
```

When section count > 5, wrap to per-breakpoint blocks. When case count > 10,
paginate to 10 per block. Legend stays visible on every page.

### Multi-section FAIL consolidation

If FAILs span multiple sections, verify-page prints one `refine-section` command
per section (not one consolidated line), because `refine-section` is scoped to a
single section at a time.

In case mode, each FAIL → one `refine-section ... --case <key>` line. A single
section with FAILs across 3 cases = 3 lines (user can batch with
`refine-page ... --cases --only-failed --resume` for the rollup).

### PASS-only collapsing

When every assertion in a section passes, collapse to one line: `PASS  (all N
assertions)`. Don't flood the terminal with green.

In case mode, the matrix grid is the rollup — per-section listings are
suppressed. A `--verbose` flag (future) could re-enable them.

## Output (markdown, when `--format markdown`)

Write to `.theme-forge/verify/_page-reports/<template>-<timestamp>.md`. Same content
as terminal output but markdown-formatted. Useful for pasting into a PR description
or email. Never overwrites per-section `generated.md` — page reports are separate.

## Page run log

After all sections complete, write (legacy mode):

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

### Matrix run log (case mode)

Written to:
```
.theme-forge/verify/_page-reports/<template>-matrix-<timestamp>.json
```

Plus a `-latest.json` symlink / copy updated atomically (for delta diffing
against the next run):
```
.theme-forge/verify/_page-reports/<template>-matrix-latest.json
```

Schema:
```json
{
  "timestamp": "2026-04-20T14:02:00Z",
  "template": "product",
  "scope": {
    "breakpoints": ["desktop", "tablet", "mobile"],
    "cases": ["full_personalizer", "tag_personalizer", "ready_to_ship"],
    "sections": ["hero-1", "product-form", "trust-bar", "cross-sell", "sticky-cta"]
  },
  "totals": { "pass": 97, "fail": 2, "stale": 0, "error": 0, "skip": 0 },
  "cells": [
    {
      "section": "product-form",
      "breakpoint": "desktop",
      "case": "tag_personalizer",
      "status": "FAIL",
      "pass": 4, "fail": 1, "stale": 0, "error": 0,
      "failed_assertion_ids": ["btn:color:desktop:tag_personalizer"]
    }
  ],
  "regressions": [
    {
      "cell_key": "product-form:desktop:tag_personalizer",
      "prior_status": "PASS",
      "current_status": "FAIL",
      "assertion_id": "btn:color:desktop:tag_personalizer",
      "next": "/theme-forge refine-section product-form --page product --case tag_personalizer --variances \".btn:color\""
    }
  ],
  "failures": [
    {
      "section": "product-form",
      "case": "tag_personalizer",
      "breakpoint": "desktop",
      "assertion_id": "btn:color:desktop:tag_personalizer",
      "next": "/theme-forge refine-section product-form --page product --case tag_personalizer --variances \".btn:color\""
    }
  ]
}
```

Cell identity = `{template, section, breakpoint, case}`. The `regressions`
array is the hook refine-page's `--gate` reads to detect cross-case damage.

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
