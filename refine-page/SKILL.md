---
name: refine-page
description: >
  Run refine-section on all sections of a page that have open variances. Reads section reports,
  identifies sections with status "needs_refinement", and processes them sequentially. Supports
  both JSON and Liquid page templates. Auto-creates missing reports via find-variances.
  - MANDATORY TRIGGERS: theme-forge refine-page, refine page, refine all sections
---

# refine-page — Refine All Sections on a Page

Run `refine-section` on every section that has open variances on a page. This is the refinement
counterpart to `pull-page`, closing the gaps that pull-section left behind.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)
- Dev server is running
- Section reports are optional — if missing, this skill auto-creates them via find-variances

## Arguments

```
/theme-forge refine-page [page-path] [--breakpoint <name>] [--cases] [--case <key>] [--gate <when>] [--fail-fast] [--resume] [--only-failed] [--summary] [--variances "<element>:<property>, ..."]
```

- `page-path` — defaults to `index` (homepage) if omitted.
- `--breakpoint <name>` — forwarded to each refine-section run (and to any
  auto-invoked find-variances run). Restricts every section's experiment loop to
  variances that include `<name>` (`desktop`, `tablet`, or `mobile`). Sections
  with zero open variances at the scoped breakpoint are reported as
  `(no open variances at <name>)` and skipped without entering the experiment
  loop. Validated once at page entry — any unknown value hard-errors with the
  allowed list. Promotion (Step 5 of refine-section) emits assertions only at
  the scoped breakpoint, so a mobile-only refine-page never claims a desktop fix
  it never verified.
- `--cases` — enable multi-case matrix mode. Iterates every `active` case from
  `.theme-forge/cases/<page>.json`. For each case, runs refine-section on
  every section with open variances. Emits a matrix-style progress view.
  Alias: `--archetypes`.
- `--case <key>` — scope the run to one case only (still multi-section).
  Useful when a specific archetype shows regressions.
- `--gate <when>` — cross-case regression gate cadence. One of:
  - `final` (default) — cross-case verify runs once at the end of the matrix.
    All refinement happens first; the gate reports any regressions introduced
    in one case that broke another. Pairs well with the user's typical flow
    (fix everything, then review).
  - `breakpoint` — gate runs after every breakpoint sweep across all scoped
    cases completes. Catches cross-case damage earlier at the cost of
    re-navigating.
  - `none` — skip cross-case gating entirely. Risky: regressions from one
    case's fix may silently persist in other cases until `verify-page` runs.
    **Final verification still runs** — the gate controls only the mid-run
    safety check, not final reporting. Prints a warning banner at start.
- `--fail-fast` — stop the matrix on the first ERROR or FAIL instead of
  marking the cell and continuing. Default: continue, mark cells, report at
  end (long-run-friendly).
- `--resume` — reuse an incomplete matrix report if one exists. By default,
  the skill detects an incomplete report and prompts before overwriting; the
  explicit flag makes the intent unambiguous.
- `--only-failed` — when a prior matrix run exists, process only the cells
  with status FAIL / ERROR / PENDING. Pairs with `--resume`.
- `--summary` — print only the matrix summary, not per-cell progress. For
  background runs where the user checks back later.
- `--variances` — optional user-specified priority variances, passed through to each refine-section invocation. These are applied to ALL sections on the page. For section-specific priorities, invoke refine-section directly.

## Workflow

### Step 1: Load Page Template and Section Reports

1. **Read the page template.** Check both formats:
   - **JSON template** (`templates/{page-path}.json`): Parse the `sections` and `order` keys to
     get the section list. Each key in `sections` maps to a section type and block configuration.
   - **Liquid template** (`templates/{page-path}.liquid`): Parse `{% section 'name' %}` and
     `{%- section 'name' -%}` tags to extract section names. Each tag references a section file
     at `sections/{name}.liquid`.
   - If both exist, prefer the JSON template (Shopify's default resolution order).
   - If neither exists, STOP and report: "Template not found for {page-path}."

2. **Build the section list.** For each section found in the template:
   - Derive the **section key** used for report filenames:
     - JSON templates: `{section-type}_{page-path}` (e.g., `hero-1_index`)
     - Liquid templates: `{section-name}_{page-path}` (e.g., `custom-bridal-hero_page.bridal`)
   - Verify the section file exists at `sections/{section-type}.liquid` or `sections/{section-name}.liquid`

3. **Read all section reports** for this page from `.theme-forge/reports/sections/`.
   Match reports to template sections by section key.

4. **Handle missing reports — auto-create via find-variances:**

   For each section in the template that has **no matching report**:

   ```
   MISSING REPORT: {section-key} — running find-variances to create variance baseline
   ```

   Run find-variances on the section:
   ```
   /theme-forge find-variances {section-key} --page {page-path}
   ```

   This creates the section report with a variance array. After find-variances completes:
   - Read the new report from `.theme-forge/reports/sections/{section-key}.json`
   - If variances were found, set status to `needs_refinement`
   - If no variances (live matches dev), set status to `completed`
   - Commit the new report:
     ```bash
     git add .theme-forge/reports/sections/{section-key}.json
     git commit -m "find-variances: {section-key} on {page-path} — baseline created"
     ```

   **Do NOT skip sections because they lack reports.** Do NOT make ad-hoc CSS fixes. The
   variance array is the work queue. No array = run find-variances to create one.

5. **Filter for sections that need refinement:**
   - Status `needs_refinement` — primary target
   - Status `completed` but with `open` entries in the variance array — catches edge cases where status wasn't updated
   - Skip sections with status `completed` (all variances fixed/accepted), `skipped`, or `failed`

6. **If no sections need refinement:**
   ```
   REFINE-PAGE: {page-path} — nothing to refine
   ════════════════════════════════════════════════════════════
   All {N} sections are completed. No open variances found.
   ════════════════════════════════════════════════════════════
   ```
   Exit.

### Step 1.5: Case-mode setup (`--cases` / `--case`)

When `--cases` or `--case <key>` is set:

1. **Reject the combo.** `--cases` + `--case` together hard-error.
2. **Locate the cases file** — `.theme-forge/cases/<page-path>.json`. Missing
   file hard-errors with the exact `intake-cases` next command:
   ```
   ERROR: No cases file for page "<page-path>".

   Expected:
     .theme-forge/cases/<page-path>.json

   Create it with:
     /theme-forge intake-cases <page-path> --from <screenshot-or-csv>
   ```
   No browser session has started yet — the error is pre-browser.
3. **Validate the case file.** Parse JSON. Verify every active case has a
   `path` starting with `/`. Invalid paths hard-error with the exact case key
   and offending value.
4. **Resolve scoped cases:**
   - `--case <key>`: exactly one active case.
   - `--cases`: all `active` cases. Dormant / draft cases printed as skipped.
5. **Compute matrix dimensions.**
   - `C` = count of scoped cases
   - `S` = count of sections with open variances on the page
   - `B` = count of breakpoints in scope (3 by default, 1 with `--breakpoint`)
   - `cells = C × S × B`
6. **Preflight print (BLOCKING DX requirement).** Before any browser work,
   print the full preflight block so the user knows what's about to happen:

   ```
   REFINE-PAGE MATRIX: <page-path>
   ════════════════════════════════════════════════════════════════════
   Cases:        <C> active (from .theme-forge/cases/<page-path>.json)
   Sections:     <S> with open variances
   Breakpoints:  <B> (<list>)
   Cells:        <cells> total
   Gate:         <--gate value> (cross-case verification cadence)
   Est. runtime: ~<X>-<Y> min (based on ~30-60s per cell)
   Report:       .theme-forge/reports/pages/<page-path>-matrix.json
   ════════════════════════════════════════════════════════════════════

   Dormant / draft cases skipped:
     • <dormant_key_1> (dormant)
     • <draft_key_1> (draft)

   Starting...
   ```

   If `--summary` was passed, this block still prints — it's the only thing
   the user sees until completion.

7. **Resume detection.** If `.theme-forge/reports/pages/<page-path>-matrix.json`
   exists AND has incomplete cells (status PENDING / RUNNING), prompt via
   AskUserQuestion BEFORE overwriting:

   ```
   An incomplete matrix run exists (<N> cells complete / <M> pending).

   A) Resume — skip completed cells, process pending/failed
   B) Start fresh — overwrite existing report
   C) Abort
   ```

   `--resume` auto-selects A. `--only-failed` with `--resume` filters to
   FAIL/ERROR cells as well.

### Step 2: Display Refinement Queue

**Legacy mode (no `--cases` / `--case`):** show the section queue:

```
REFINE-PAGE QUEUE: {page-path}
════════════════════════════════════════════════════════════
#  Section              Status              Open Variances
1  hero-1               needs_refinement    3
2  featured-collection  needs_refinement    5
3  trust-bar            needs_refinement    1
════════════════════════════════════════════════════════════
Sections to refine: 3/{total} — {total_open} open variances
Sections already completed: {completed_count}
Sections skipped/failed: {skip_count}
```

**Case mode:** the preflight block from Step 1.5 already printed. Do not
re-print the legacy queue — the matrix progress view in Step 3 replaces it.

### Step 3: Refine Each Section

**Legacy path (no `--cases` / `--case`)** — for each section in the queue:

1. **`git pull`** to get the latest state (another session may have completed sections since we started).

2. **Run refine-section:**
   ```
   /theme-forge refine-section <section-key> --page <page> [--breakpoint <name>] [--variances "<user-variances>"]
   ```
   Pass through the `--variances` and `--breakpoint` flags if the user provided
   them. When `--breakpoint <name>` is set: validate `<name>` once at page entry
   (`desktop`, `tablet`, or `mobile` — hard-error otherwise), then forward
   verbatim to every refine-section call. Sections whose variance array has zero
   open entries at the scoped breakpoint get a single-line
   `── <section> ── (no open variances at <name>)` and are not executed (no
   browser session, no commit). Page summary counts only the executed sections.

3. **After each section completes, validate the report:**
   - Read `.theme-forge/reports/sections/{section-key}.json`
   - Check: did the number of open variances decrease?
   - Check: status updated to `completed` if all variances closed

4. **Commit and push after each section:**
   ```bash
   git add .theme-forge/reports/sections/{section-key}.json \
           .theme-forge/learnings/ \
           sections/ templates/ assets/ snippets/ config/
   git commit -m "refine: {section-key} on {page} — {closed_count} variances closed"
   git push -u origin $(git branch --show-current)
   ```

5. **If a section fails (3 experiments fail on the same variance, user escalates):** Continue to the next section. Log the failure in the page report.

**Case-mode matrix path (`--cases` or `--case`)** — iterate the full matrix:

1. **Loop ordering.** Outer loop = breakpoint, middle loop = case, inner loop
   = section. Rationale: breakpoint is the expensive viewport boundary (one
   `browser_resize` per breakpoint sweep); case is the next-most-expensive
   boundary (one `browser_navigate` per case change); section is cheapest
   (DOM scoped within the already-loaded case page). This mirrors the find-
   variances / verify-section loop ordering so cache reuse stays consistent.

   ```
   for bp in [breakpoints in scope]:
     resize browser to bp
     for case in [scoped active cases]:
       navigate to live_url + case.path
       navigate to dev_url + case.path
       for section in [sections with open variances at (bp, case)]:
         run refine-section <section-key> \
           --page <page-path> \
           --case <case-key> \
           --breakpoint <bp> \
           --live-url <live_url> \
           --dev-url <dev_url>
   ```

   The `--live-url` / `--dev-url` overrides carry the resolved origin so every
   cell uses stateless URL resolution. `--case` tells refine-section to filter
   the variance queue to entries matching `case === <key>` OR `case === null`
   (universal variances).

2. **Skip cells with no work.** Before invoking refine-section for a cell,
   check the section report's variance array for open entries matching
   `(bp, case)`. Zero matches = skip with:
   ```
   ── <section> ── (no open variances at <case>/<bp>)
   ```
   Mark cell status `SKIP` in the matrix report (not `PASS` — a skip is not
   a verified pass).

3. **Per-cell status.** Each cell is one (page, section, breakpoint, case)
   tuple. Possible statuses:
   - `PASS` — refine-section closed all open variances for the cell
   - `PARTIAL` — some variances closed, some remain `open` or `user_accepted`
   - `FAIL` — refine-section hit max experiments on a variance
   - `ERROR` — infrastructure failure (404, server crash, missing file)
   - `SKIP` — no open variances at this cell
   - `PENDING` — not yet processed (resume state)

   With `--fail-fast`, the first `FAIL` or `ERROR` halts the matrix and jumps
   to Step 4 with the remaining cells marked `PENDING`. Default behavior
   continues through the matrix and reports everything at end (long-run
   friendly — CC session runs for hours, user checks back).

4. **Matrix report — append-after-cell.** After every cell completes, update
   `.theme-forge/reports/pages/<page-path>-matrix.json` with the cell result.
   This is the resume anchor: a crashed session picks up from here on next
   `--resume`.

   Schema:
   ```json
   {
     "page": "product",
     "started_at": "2026-04-20T12:00:00Z",
     "updated_at": "2026-04-20T14:22:00Z",
     "scope": {
       "breakpoints": ["desktop", "tablet", "mobile"],
       "cases": ["full_personalizer", "tag_personalizer", ...],
       "sections": ["hero-1", "product-form", ...]
     },
     "gate": "final",
     "cells": [
       {
         "section": "hero-1",
         "breakpoint": "desktop",
         "case": "full_personalizer",
         "status": "PASS",
         "opened": 3,
         "closed": 3,
         "remaining": 0,
         "duration_s": 42,
         "finished_at": "2026-04-20T12:04:00Z"
       },
       {
         "section": "product-form",
         "breakpoint": "desktop",
         "case": "full_personalizer",
         "status": "FAIL",
         "opened": 5,
         "closed": 3,
         "remaining": 2,
         "failed_variance_id": "btn-add-to-cart:color:desktop:full_personalizer",
         "duration_s": 180,
         "finished_at": "2026-04-20T12:07:00Z"
       }
     ],
     "summary": {
       "total_cells": 99,
       "completed": 99,
       "pass": 78,
       "partial": 12,
       "fail": 3,
       "error": 1,
       "skip": 5
     }
   }
   ```

   Cell identity key = `{page, section, breakpoint, case}`. Resume matches
   on that tuple — skip any cell already in terminal status (PASS / PARTIAL /
   FAIL / SKIP). Re-run cells with status `PENDING` or `RUNNING` (stale from
   crash).

5. **`--only-failed` filter.** When both `--resume` and `--only-failed` are
   set, pre-filter the cell list to those with status `FAIL` or `ERROR` in
   the existing report. Other cells pass through untouched. This is the
   "fix the regressions I didn't get to" mode.

6. **Progress view (row layout per TD-2).** Unless `--summary` is set, print
   the matrix after each cell. Cases are rows (scales to 20+), breakpoints
   are column groups, sections concatenate within a group. Keep one section
   per line when > 4 sections to avoid horizontal scroll:

   ```
   REFINE-PAGE MATRIX: product — 47/99 cells complete
   ════════════════════════════════════════════════════════════════════════
                        │ desktop        │ tablet         │ mobile
   case                 │ H PF TB CC CTA │ H PF TB CC CTA │ H PF TB CC CTA
   ─────────────────────┼────────────────┼────────────────┼───────────────
   full_personalizer    │ ✓ ✓  ✓  ✓  ✓  │ ✓ ✓  ✓  ⚠  ·  │ · ·  ·  ·  ·
   tag_personalizer     │ ✓ ✗  ✓  ✓  ✓  │ ✓ ·  ·  ·  ·  │ · ·  ·  ·  ·
   ready_to_ship        │ ✓ ✓  ✓  ·  ·  │ · ·  ·  ·  ·  │ · ·  ·  ·  ·
   ════════════════════════════════════════════════════════════════════════
   Legend: ✓ PASS  ⚠ PARTIAL  ✗ FAIL  E ERROR  ↓ SKIP  · PENDING
   Sections: H=hero-1 PF=product-form TB=trust-bar CC=cross-sell CTA=sticky-cta
   ```

   When section count > 5, wrap to per-breakpoint blocks (one table per
   breakpoint). When case count > 10, paginate to 10 cases per block.

7. **Commit cadence.** refine-section commits its own report after each cell
   (unchanged). refine-page does NOT commit between cells — the matrix report
   is the rollup and commits at end. Rationale: per-cell commits would be
   hundreds of commits for a 99-cell run. The section-level commits give
   fine-grained history; the matrix commit gives the page-level rollup.

8. **`--fail-fast` vs default.** Default (no flag): continue through the full
   matrix, mark cells, report at end. `--fail-fast`: first `FAIL` / `ERROR`
   halts with `PENDING` cells preserved — user can resume with `--resume`
   `--only-failed` after fixing the blocker.

### Step 3.5: Cross-Case Regression Gate (case mode only)

Matrix refinement introduces a new risk: a CSS fix for case A's variance
could regress case B. The gate catches this by running `verify-page --cases`
(or `verify-section --cases` per-section during sweeps) against all scoped
cases and failing loudly if a previously-green cell is now red.

**`--gate final` (default).** After the matrix loop completes, run:
```
/theme-forge verify-page <page-path> --cases
```
This verifies every section × case × breakpoint in scope. Any FAIL in a cell
that was not in the refine scope this run is a cross-case regression.

Output:
```
CROSS-CASE GATE: verify-page <page-path> --cases
════════════════════════════════════════════════════════════
Regressions introduced this run:
  • product-form:color:desktop:tag_personalizer  (was PASS before refine, now FAIL)
  • hero-1:font-size:mobile:ready_to_ship        (was PASS before refine, now FAIL)

Clean cells:  72
Still-open:   14  (unchanged from refine scope)
Regressions:  2   (NEW failures introduced this run)
════════════════════════════════════════════════════════════

next:
  review regressions: cat .theme-forge/reports/pages/<page-path>-verify.json
  refine the regressed cases:
    /theme-forge refine-page <page-path> --cases --only-failed --resume
```

Regression detection compares the pre-run assertion state against post-run:
a cell is a regression iff it passed in the prior verify (or was not in the
refine scope at all) AND fails now. Cells that were already failing before
this refine run are NOT regressions — they're just still-open variances.

**`--gate breakpoint`.** After each breakpoint sweep (all cases × sections
at one breakpoint), run `verify-page <page> --cases --breakpoint <bp>`. This
catches cross-case damage earlier but re-navigates every case per breakpoint
(~3× verify cost). Use when the run is short enough that early detection
matters more than the extra navigation.

**`--gate none`.** Skip the gate entirely. The warning banner from Step 1.5
already printed at start. Final verification still runs (via refine-section
per-cell), but no cross-case comparison happens. Regressions in other cases
silently persist until the next `verify-page --cases`.

Whatever the gate result, matrix refinement does NOT auto-loop. Fixing gate
failures is a new `refine-page --cases --only-failed --resume` invocation,
at the user's discretion.

### Step 4: Summary Report

**Legacy mode** — after all sections are processed:

```
REFINE-PAGE COMPLETE: {page-path}
════════════════════════════════════════════════════════════
Section              Before    After     Status
hero-1               3 open    0 open    completed
featured-collection  5 open    1 open    needs_refinement (1 user-accepted)
trust-bar            1 open    0 open    completed
════════════════════════════════════════════════════════════
Sections refined: 3
Variances closed: 8/9
Sections now completed: {count}
Sections still needs_refinement: {count}
```

**Case mode** — matrix summary (TD-2 row layout):

```
REFINE-PAGE MATRIX COMPLETE: {page-path}
════════════════════════════════════════════════════════════════════════
Scope:        <C> cases × <S> sections × <B> breakpoints = <cells> cells
Duration:     <HH:MM:SS>
Gate:         <--gate value> → <gate result: CLEAN / <N> regressions>
Report:       .theme-forge/reports/pages/<page-path>-matrix.json
════════════════════════════════════════════════════════════════════════

Cell outcomes:
  PASS:     <N>   (all variances closed)
  PARTIAL:  <N>   (some closed, some user-accepted)
  FAIL:     <N>   (hit experiment cap)
  ERROR:    <N>   (infrastructure — 404, crash, etc.)
  SKIP:     <N>   (no open variances at cell)

Per-case summary:
  full_personalizer     ✓ 30/33  (3 partial)
  tag_personalizer      ✗ 25/33  (7 partial, 1 fail)
  ready_to_ship         ✓ 33/33
  ...

Variances closed this run:  <total_closed>
Variances still open:       <total_remaining>
Regressions introduced:     <gate_regression_count>
```

With `--summary`, this block is the only thing printed (no progress view
during the run). It's the "run in background, check back later" mode.

Update the page report at `.theme-forge/reports/pages/{page-path}.json` with
refinement results (legacy mode):

```json
{
  "refine_session": {
    "timestamp": "2026-04-13T18:00:00Z",
    "sections_refined": 3,
    "variances_closed": 8,
    "variances_remaining": 1,
    "sections_completed": 2,
    "sections_still_open": 1
  }
}
```

In case mode, the matrix report at
`.theme-forge/reports/pages/{page-path}-matrix.json` is the authoritative
artifact — it carries per-cell detail the legacy page report cannot express.
A minimal legacy page report is still written for backwards compatibility
with `verify-page` and status tooling (sections_refined = sum of unique
sections across cells, variances_closed = sum across cells, etc.).

### Step 5: Final Commit

**Legacy mode:**
```bash
git add .theme-forge/reports/pages/{page-path}.json
git commit -m "refine: {page-path} page refinement — {closed} variances closed across {count} sections"
git push -u origin $(git branch --show-current)
```

**Case mode:** include the matrix report + updated cases file (if paths
changed during the run):
```bash
git add .theme-forge/reports/pages/{page-path}.json \
        .theme-forge/reports/pages/{page-path}-matrix.json
git commit -m "refine: {page-path} matrix — {closed}/{total} closed across {cell_count} cells ({case_count} cases × {section_count} sections × {bp_count} bps)"
git push -u origin $(git branch --show-current)
```
