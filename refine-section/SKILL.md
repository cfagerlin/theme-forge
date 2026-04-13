---
name: refine-section
description: >
  Autoresearch-style experiment loop for closing CSS/settings variances on a pulled section.
  Auto-invoked by pull-section when FAIL rows remain. Can also be invoked directly.
  - MANDATORY TRIGGERS: theme-forge refine-section, refine section, fix variances, close FAILs
---

# refine-section — The Experiment Loop

Close every extraction FAIL on a section through a tight hypothesis-verify loop.
Modeled on [Karpathy's autoresearch](https://github.com/karpathy/autoresearch):
one atomic change per iteration, verified before the next, with git as state machine.

## When this runs

1. **Auto-invoked by pull-section** after Step 9 when `open` variances remain in the section report.
   The variance array (with structured test conditions) is already in the report from find-variances.
2. **Manually invoked** by the user: `/theme-forge refine-section <section-key> --page <page>`
   Reads the variance array from the section report. If no variance array exists, runs find-variances first.

## Arguments

```
/theme-forge refine-section <section-key> [--page <page>]
```

- `section-key` — e.g., `product-information`, `header`, `hero-1`
- `--page` — the template page (e.g., `product`, `index`). Defaults to the page in the section report.

## Prerequisites

- The section has been pulled (a report exists at `.theme-forge/reports/sections/{section-key}.json`)
- Dev server is running (hot-reload is required for the verify step)
- Playwright CLI is available (extraction requires browser access via `scripts/screenshot.sh`)
- `.theme-forge/config.json` exists with `live_url` and `dev_url`

## Hard Rules

These override everything else in this document.

### One change per iteration
- **Make exactly ONE edit to ONE file per loop iteration.** This is not a guideline. The loop structure enforces it: you verify after each change. If you find yourself editing two properties before verifying, you are doing it wrong.

### Git is the state machine
- **Commit every verified fix immediately.** The branch tip is the current best state. Each PASS → `git add` + `git commit` with a descriptive message. Each REGRESSION → `git checkout -- <file>` to revert.
- **Never batch multiple fixes into one commit.** Each commit = one hypothesis that was verified.

### Verify before next
- **You MUST re-extract the specific property after each change** to confirm PASS before moving to the next variance. Do not "eyeball" the dev site. Do not assume the fix worked because the code looks right. Run the extraction.

### Log every experiment
- **Write a learning entry after every experiment**, success or failure. Learnings from failed attempts are more valuable than successes — they prevent the same mistake on the next section.

### Escalate, don't thrash
- **3 failed attempts on the same variance = escalate via `AskUserQuestion`.** Do not try a 4th approach. Present what you tried and let the user decide.
- **Revert = normal.** A reverted change is a rejected hypothesis, not a failure. Log why it was rejected and try a different approach.

### Same product, same URL
- **Extract live and dev from the SAME product/page URL path.** Record the URL in the experiment log. Mismatched products produce contradictory extraction data.

### No positional selectors
- **Never use `:first-child`, `:nth-child(N)` for variant options.** Use option-name-based selectors or data attributes. Positional selectors break across products with different variant counts.

## Step 1: Load Variance Queue from Section Report

Read the variance array from `.theme-forge/reports/sections/{section-key}.json`.

**If the report has a `variances` array:** Filter for entries with `status: "open"`. These are the work queue. Each entry includes a structured test condition — do NOT improvise verification.

**If no variance array exists:** Run find-variances first:
```
/theme-forge find-variances <section-key> --page <page>
```
Then re-read the report.

1. Display the queue (from the variance array):

```
VARIANCE QUEUE: {section-key}
════════════════════════════════════════════════════════════
#  Element              Property         Live           Dev            Type     Test
1  h1                   fontWeight       200            700            setting  --heading-font-weight
2  .price-money         fontWeight       300            500            css      shadow:product-info
3  .add-to-cart         fontSize         13px           16px           css      direct selector
4  .add-to-cart         textTransform    uppercase      none           css      direct selector
5  .variant-label       letterSpacing    0.1em          normal         css      direct selector
════════════════════════════════════════════════════════════
METRIC: 5 open → target: 0
```

The "Test" column shows the verification method from each variance's test condition:
- `--custom-prop-name` — CSS custom property override (through Shadow DOM)
- `shadow:host-tag` — element inside Shadow DOM, needs special selector
- `direct selector` — standard CSS selector works

2. Read ALL files in `.theme-forge/learnings/` before starting the loop. If a learning says "Horizon price component uses `--price-font-weight` custom property," apply that knowledge in Step 2.1.

## Step 2: The Experiment Loop

For each variance in the queue:

### 2.1 HYPOTHESIZE

1. **Inspect the rendered DOM** for the target element. Use JavaScript on the dev site to find the actual element, its tag, classes, parent chain, and whether it's inside a Shadow DOM boundary.

2. **Choose the simplest approach** that could work:

   ```
   PREFERENCE ORDER (try in this order):
   1. JSON setting change          ← survives theme updates, no CSS needed
   2. CSS custom property override ← cascades through Shadow DOM, one line
   3. CSS class-based override     ← scoped, explicit, needs correct selector
   4. Structural Liquid change     ← custom block or snippet modification
   5. Custom section fork          ← last resort, breaks upgradability
   ```

   Start with #1. Only escalate to #2 if #1 doesn't apply (no setting exists for this property). Only escalate to #3 if #2 doesn't apply (no custom property exposed). And so on.

3. **Record the hypothesis** before applying:
   ```
   EXPERIMENT #{N}: {property}
   Hypothesis: {approach} — {specific change}
   Selector/setting: {what you'll modify}
   Expected: {FAIL value} → {target value}
   ```

### 2.2 APPLY ONE CHANGE

1. Make exactly **ONE edit** to **ONE file**.
   - Setting change → edit `templates/{page}.json` or `config/settings_data.json`
   - CSS custom property → edit the CSS override file
   - CSS class override → edit the CSS override file
   - Structural change → edit the `.liquid` file

2. Save the file. Wait 2-3 seconds for hot-reload.

3. **Verify the file was saved** — if the dev server doesn't pick up the change (stale content), the verification in 2.3 will show FAIL (same value) and you'll misdiagnose it as a selector issue. Quick check: confirm the file's modification time changed.

### 2.3 VERIFY

1. **Execute the test condition from the variance entry.** Do NOT improvise — use exactly what the variance's `test` field specifies.

   **Structured test** (most variances):
   ```javascript
   // Read test.selector, test.property, test.expected, test.shadow_host from the variance
   let root = document;
   if (test.shadow_host) {
     const host = document.querySelector(test.shadow_host);
     root = host?.shadowRoot || host || document;
   }
   const el = root.querySelector(test.selector);
   const value = getComputedStyle(el)[test.property];
   // Compare value against test.expected
   ```

   **Custom JS test** (layout/bounding box variances):
   ```javascript
   const value = eval(test.js);
   // Compare value against test.expected_js
   ```

2. Compare against the expected value (from `test.expected` or `test.expected_js`).

3. Record the result:
   ```
   RESULT: PASS ✓  (font-weight: 500 → 300, matches live)
   — or —
   RESULT: FAIL ✗  (font-weight: still 500, selector not matching)
   — or —
   RESULT: FAIL ~  (font-weight: 400, closer but not 300)
   — or —
   RESULT: REGRESSION ✗  (font-weight fixed but title font-size changed)
   ```

### 2.4 ACCEPT or REVERT

**PASS** — the variance is now fixed:
```bash
git add <modified-file> .theme-forge/reports/sections/{section-key}.json
git commit -m "refine: {section} — {property} {old_value} → {new_value}"
```
Update the variance entry in the report: set `status: "fixed"`, record the attempt in `attempts`. Move to next.

**FAIL (same value)** — the change had no effect:
- Your selector is wrong, or the property is controlled by something else.
- **Do NOT retry the same selector.** Go back to 2.1 and try the next approach in the preference order.
- If you already tried approach #1 (setting), try #2 (CSS custom property). If #2 failed, try #3. And so on.

**FAIL (value changed but wrong)** — progress, but not there yet:
- Your selector works but the value needs adjustment.
- Adjust the value and go to 2.2. This counts as the same attempt (not a new experiment).

**REGRESSION** — other elements broke:
```bash
git checkout -- <modified-file>
```
Log what regressed and why. Go back to 2.1 with a more scoped approach (tighter selector, `!important`, or different property).

### 2.5 LOG EXPERIMENT

After every experiment (PASS, FAIL, or REGRESSION), write to `.theme-forge/learnings/{section-key}.json`:

```json
{
  "property": "price font-weight",
  "target_value": "300",
  "approach": "CSS class override",
  "selector": ".price-money",
  "result": "FAIL — selector doesn't match, element is inside shadow root",
  "working_approach": null,
  "timestamp": "2026-04-12T04:00:00Z"
}
```

On PASS, set `"working_approach"` to the approach that worked. This is the most valuable learning — next time this pattern appears, skip the failed approaches and go straight to what works.

**Escalation check:** If this is the 3rd failed attempt on the same variance, escalate:

```
Section: {section} — variance not resolved after 3 attempts

Property: {property}
Live: {live value}
Dev: {dev value}
Attempted:
  1. {approach 1} — {why it failed}
  2. {approach 2} — {why it failed}
  3. {approach 3} — {why it failed}

A) Try a different approach (describe what you'd try)
B) Accept this variance (user approves)
C) I'll fix it manually — move on
```

Only option B sets `user_approved: true` in the variance entry. Move to next variance regardless of choice.

### Test Condition Correction

If a variance shows PASS but the user reports it's still wrong (e.g., during Step 10.5 of pull-section):

1. The test condition was checking the wrong element or property.
2. Ask the user what they see. Inspect the DOM to find the correct element.
3. Update the `test` field in the variance entry with the corrected selector/property.
4. Write a learning to `.theme-forge/learnings/{section-key}.json`:
   ```json
   {
     "type": "test_correction",
     "original_test": {"selector": "h1", "property": "fontWeight"},
     "corrected_test": {"selector": "h1", "property": "fontWeight", "shadow_host": "product-title"},
     "reason": "Element inside product-title shadow root, direct selector misses it",
     "timestamp": "2026-04-12T..."
   }
   ```
5. find-variances uses these learnings to generate better test conditions for similar elements in future runs.

**← Loop back to 2.1 for the next variance in the queue.**

## Step 3: Final Verification

After the queue is empty (or all remaining items are escalated):

1. **Run find-variances for full re-extraction** to catch regressions that slipped through per-element verification:
   ```
   /theme-forge find-variances <section-key> --page <page>
   ```
   find-variances re-extracts dev styles, compares against cached live values, and updates the variance array with merge-not-replace semantics (preserving attempts and approvals).
2. If new `open` variances appeared in the report: add them to the queue and go back to Step 2.
3. Take a final verification screenshot at all 3 breakpoints (desktop, tablet, mobile) using the capture skill.
4. Compare against the live reference screenshots in `.theme-forge/references/{section}-{page}/`.

## Step 4: Report

Update the section report at `.theme-forge/reports/sections/{section-key}.json`:

```json
{
  "refine_session": {
    "experiments_total": 12,
    "experiments_passed": 8,
    "experiments_failed": 3,
    "experiments_escalated": 1,
    "variances_closed": 8,
    "variances_remaining": 1,
    "variances_user_accepted": 1
  }
}
```

Present the summary:

```
REFINE COMPLETE: {section-key}
════════════════════════════════════════════════════════════
Experiments:  12 total (8 passed, 3 failed, 1 escalated)
Variances:    8/9 closed, 1 user-accepted
FAIL rows:    0 remaining
════════════════════════════════════════════════════════════
```

If invoked from pull-section, return control to pull-section Step 10 (Final Validation Gate).
