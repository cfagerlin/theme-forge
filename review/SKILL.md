---
name: review
description: >
  Post-work variance review. Scrolls through completed pages comparing live vs dev, finding and fixing remaining visual differences.
  - MANDATORY TRIGGERS: theme-pull review, review page, variance review, final review, check variances
---

# review — Post-Work Variance Review

Perform a final visual review of completed work to find and fix remaining variances. This is a quality gate — run it after `pull-page` or after pulling individual sections.

## Prerequisites

- `.theme-pull/config.json` must exist
- At least one section should have been pulled (reports exist in `.theme-pull/reports/sections/`)
- Chrome MCP or computer-use capability is strongly recommended (code-only review is possible but limited)

## Arguments

```
/theme-pull review [page-path]
```

Defaults to `index` if omitted. Use `all` to review all pages that have been pulled.

## Workflow

### Step 1: Load Context

1. Read config for live URL, dev URL, and capabilities
2. Read existing reports to understand what has been pulled
3. Identify which sections on this page have been completed vs outstanding

### Step 2: Full-Page Screenshots

If Chrome MCP or computer-use is available:

1. Navigate to the live site page
2. Take a full-page screenshot at **desktop width** (1440px)
3. Navigate to the dev site page
4. Take a full-page screenshot at the same width
5. Repeat at **tablet width** (800px) and **mobile width** (375px)

### Step 3: Section-by-Section Comparison

For each section on the page (top to bottom):

1. Scroll the section into view on both live and dev sites
2. Take focused screenshots of just that section
3. Compare visually — list any differences:
   - Spacing (padding, margin, gaps)
   - Typography (size, weight, color, spacing)
   - Layout (alignment, width, positioning)
   - Colors (background, text, borders)
   - Images (sizing, cropping, quality)
   - Interactive states (hover not visible in screenshots — note for manual check)
4. For each variance found:
   - Inspect computed styles on both sites
   - Identify root cause (CSS rule, missing setting, structural difference)
   - Rate severity: `critical` (breaks layout), `major` (clearly visible), `minor` (subtle), `cosmetic` (negligible)
   - Suggest fix

### Step 4: Inter-Section Review

Check the spaces between sections:

1. Are the gaps between sections consistent?
2. Do adjacent background colors transition correctly?
3. Is the overall page flow/rhythm correct?
4. Are there any orphaned elements or unexpected spacing?

### Step 5: Fix Critical/Major Variances

For variances rated `critical` or `major`:

1. Apply the suggested fix
2. Verify the fix (screenshot comparison)
3. Update the section report in `.theme-pull/reports/sections/`

For `minor` and `cosmetic` variances, log them but don't block completion.

### Step 6: Write Review Report

Save to `.theme-pull/reports/review-{page-path}.json`:

```json
{
  "generated_at": "2026-04-07T20:30:00Z",
  "page": "index",
  "viewports_checked": ["1440px", "800px", "375px"],
  "variances": [
    {
      "section": "featured-collection",
      "description": "Product card gap is 24px on dev vs 16px on live",
      "severity": "minor",
      "status": "logged",
      "root_cause": "Horizon grid gap default differs from legacy",
      "suggested_fix": "Add gap: 16px override to custom.css"
    },
    {
      "section": "hero-slideshow",
      "description": "Heading font-weight renders as 400 instead of 200",
      "severity": "major",
      "status": "fixed",
      "root_cause": "Horizon CSS variable override needed !important",
      "fix_applied": "Added font-weight: 200 !important to custom-hero-slideshow.liquid"
    }
  ],
  "inter_section_issues": [],
  "summary": {
    "total_variances": 5,
    "critical": 0,
    "major": 1,
    "minor": 3,
    "cosmetic": 1,
    "fixed": 1,
    "logged": 4
  },
  "verdict": "pass_with_notes"
}
```

Verdict values:
- `pass` — No variances found
- `pass_with_notes` — Only minor/cosmetic variances remain
- `needs_work` — Major variances remain
- `blocked` — Critical variances that break layout

## Output

- `.theme-pull/reports/review-{page-path}.json` — Review report
- Fixes applied to target theme files (for critical/major issues)
- Summary printed to conversation
