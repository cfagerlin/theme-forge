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
/theme-forge refine-page [page-path] [--variances "<element>:<property>, ..."]
```

- `page-path` — defaults to `index` (homepage) if omitted.
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
     - Liquid templates: `{section-name}_{page-path}` (e.g., `gldn-bridal-hero_page.bridal`)
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

### Step 2: Display Refinement Queue

Show what needs work:

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

### Step 3: Refine Each Section

For each section in the queue:

1. **`git pull`** to get the latest state (another session may have completed sections since we started).

2. **Run refine-section:**
   ```
   /theme-forge refine-section <section-key> --page <page> [--variances "<user-variances>"]
   ```
   Pass through the `--variances` flag if the user provided one.

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

### Step 4: Summary Report

After all sections are processed:

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

Update the page report at `.theme-forge/reports/pages/{page-path}.json` with refinement results:

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

### Step 5: Final Commit

```bash
git add .theme-forge/reports/pages/{page-path}.json
git commit -m "refine: {page-path} page refinement — {closed} variances closed across {count} sections"
git push -u origin $(git branch --show-current)
```
