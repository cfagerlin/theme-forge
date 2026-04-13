---
name: refine-section
description: >
  Autoresearch-style experiment loop for closing CSS/settings variances on a pulled section.
  Invoked separately after pull-section to close remaining gaps. Accepts user-provided priority variances.
  - MANDATORY TRIGGERS: theme-forge refine-section, refine section, fix variances, close FAILs
---

# refine-section — The Experiment Loop

Close every extraction FAIL on a section through a tight hypothesis-verify loop.
Modeled on [Karpathy's autoresearch](https://github.com/karpathy/autoresearch):
one atomic change per iteration, verified before the next, with git as state machine.

## When this runs

1. **Invoked by the user** after pull-section reports `needs_refinement` status with open variances.
   The variance array (with structured test conditions) is already in the report from find-variances.
2. **Invoked by refine-page** which runs refine-section on all sections of a page that have open variances.
3. **Invoked directly** at any time: `/theme-forge refine-section <section-key> --page <page>`
   Reads the variance array from the section report. If no variance array exists, runs find-variances first.

## Arguments

```
/theme-forge refine-section <section-key> [--page <page>] [--variances "<element>:<property>, ..."]
```

- `section-key` — e.g., `product-information`, `header`, `hero-1`
- `--page` — the template page (e.g., `product`, `index`). Defaults to the page in the section report.
- `--variances` — optional comma-separated list of user-specified priority variances. Format: `"element:property"` pairs (e.g., `"h1:fontWeight, .price:fontSize"`). These become the highest-priority items in the queue. find-variances still runs to discover all variances, but user-provided ones sort to the top.

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

### Never use overflow:hidden to constrain height
- **Do NOT add `overflow: hidden` to constrain a section's height.** It clips positioned content (text overlays, buttons) that extends beyond the boundary. Use `aspect-ratio`, `max-height` (without overflow:hidden), or fix the source of the height mismatch. If you need overflow control, use `overflow: clip` with explicit `clip-path` only after verifying no content is clipped.

### Match the responsive mechanism, not just the pixel value
- **Read `height_mechanism` before fixing height variances.** A live site using `padding-top: 38%` (width-relative) must NOT be mapped to `section_height_custom` (which produces `svh` units). Match the authored CSS unit type. See the mapping table in Step 2.1.

### No hardcoded pixel values for layout spacing
- **CSS overrides for `padding`, `margin`, `gap`, `column-gap`, `row-gap`, and `padding-inline`/`padding-block` MUST use responsive units, not fixed pixels.** Values measured at 1440px do not scale. At narrower viewports, fixed spacing consumes a disproportionate share of available width, crushing content columns.
- Use `clamp(min, preferred, max)` where `preferred` is a `vw` value that reproduces the live measurement at 1440px. Formula: `preferred = (live_px / 1440) * 100`vw. Example: live padding is 96px at 1440px → `clamp(24px, 6.67vw, 96px)`.
- The `min` value in the clamp should be a reasonable mobile floor (16-24px for padding, 12-20px for gaps).
- **This rule applies to any CSS override that controls whitespace in a multi-column layout.** Single-column sections (mobile stacks) are less affected, but still prefer responsive units for consistency.
- If the live site uses fixed pixels at all breakpoints (verified by extracting at 1440, 1024, and 768), then fixed pixels are acceptable. But this is rare. Most Shopify themes use responsive spacing.

## Step 1: Load Variance Queue from Section Report

Read the variance array from `.theme-forge/reports/sections/{section-key}.json`.

**If the report has a `variances` array:** Filter for entries with `status: "open"`. These are the work queue. Each entry includes a structured test condition — do NOT improvise verification.

**If no variance array exists:** Run find-variances first:
```
/theme-forge find-variances <section-key> --page <page>
```
Then re-read the report.

### 1.1 Merge User-Provided Variances

If `--variances` was passed, parse the comma-separated `"element:property"` pairs and merge them into the queue:

1. **For each user-provided variance**, check if find-variances already discovered it (match by element + property).
   - **If found:** Mark the existing entry with `priority: "user"`. This sorts it above all other priorities.
   - **If NOT found:** Create a new variance entry with `priority: "user"`, `source: "user"`, and `status: "open"`. The test condition will be generated when this variance is first processed in Step 2.1 (inspect the DOM to build the selector and expected value).

2. **Dedup rule:** A user-provided variance that matches an existing find-variances entry does NOT create a duplicate. It upgrades the existing entry's priority.

### 1.2 Sort the Queue

**Sort the queue by priority (responsive-first ordering).** This ordering is critical. Fix the responsive skeleton before tuning CSS details. find-variances already assigns these types:

   ```
   PRIORITY ORDER:
   0. user        — ★ user-specified variances (highest priority)
   1. visibility  — hard gate, text invisible on dev
   2. structural  — element missing or wrong position
   3. layout      — height, width, responsive behavior (fix these BEFORE typography)
   4. setting     — JSON setting change
   5. css         — CSS override (typography, colors, spacing)
   6. content     — text/image differences (flag only)
   ```

### 1.3 Display the Queue

Display the queue (from the variance array, sorted by priority):

```
VARIANCE QUEUE: {section-key}
════════════════════════════════════════════════════════════
#  Element              Property         Live           Dev            Type        Test
★1 h1                   fontWeight       200            700            setting     --heading-font-weight
★2 .price-money         fontWeight       300            500            css         shadow:product-info
3  section              height           547px          603px          layout      probe:width-relative
4  h1                   visibility       visible        clipped        visibility  js-assertion
5  .add-to-cart         fontSize         13px           16px           css         direct selector
════════════════════════════════════════════════════════════
METRIC: 5 open → target: 0 (★ = user priority)
```

User-priority variances are marked with ★ in the display. Within the user-priority group, maintain the order the user specified (their first item is most important to them).

   **Why layout first (after user priorities):** If the section height is wrong, text positioning is wrong, and overflow
   clips content. Fixing font-weight on an invisible element is wasted work. Lock in the
   responsive skeleton, then tune the details.

The "Test" column shows the verification method from each variance's test condition:
- `--custom-prop-name` — CSS custom property override (through Shadow DOM)
- `shadow:host-tag` — element inside Shadow DOM, needs special selector
- `direct selector` — standard CSS selector works
- `(pending)` — user-provided variance, test condition will be generated in Step 2.1

### 1.4 Load Learnings

Read ALL files in `.theme-forge/learnings/` before starting the loop. If a learning says "Horizon price component uses `--price-font-weight` custom property," apply that knowledge in Step 2.1.

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

   **Height/sizing variances — check `height_mechanism` first:**
   If the variance has a `height_mechanism` field (set by find-variances), read the `responsive_type`
   before choosing an approach. Do NOT guess a value for `section_height_custom` based on pixel values.

   | `responsive_type` | Correct approach | WRONG approach |
   |-------------------|-----------------|----------------|
   | `width-relative` | CSS override: `aspect-ratio` or `padding-top: X%` matching authored rule | `section_height_custom` (produces svh units) |
   | `viewport-width` | CSS override: `height: Xvw` or `max-height: Xvw` | `section_height_custom` (produces svh units) |
   | `viewport-height` | JSON setting: `section_height_custom: N` | CSS override with fixed px |
   | `aspect-ratio` | CSS override: `aspect-ratio: W/H` | Any fixed-unit approach |
   | `fixed` | CSS override: `max-height: Xpx` | `section_height_custom` (unless value maps to svh) |

   **The rule:** match the responsive behavior, not just the pixel value at one viewport size.

   **Layout spacing variances (padding, gap, margin on grid containers):**
   When overriding spacing on a multi-column layout, convert the live pixel measurement to
   a responsive `clamp()` value. Do NOT write `padding-inline: 96px` because you measured
   96px at 1440px wide.

   | Live measurement at 1440px | Correct CSS override | WRONG override |
   |---------------------------|---------------------|----------------|
   | `padding-inline: 96px` | `padding-inline: clamp(24px, 6.67vw, 96px)` | `padding-inline: 96px` |
   | `column-gap: 123px` | `column-gap: clamp(20px, 8.54vw, 123px)` | `column-gap: 123px` |
   | `margin-inline: 40px` | `margin-inline: clamp(16px, 2.78vw, 40px)` | `margin-inline: 40px` |

   Formula: `preferred_vw = (live_px / 1440) * 100`. Use a sensible floor (16-24px for padding,
   12-20px for gaps) so mobile doesn't collapse to zero. The `max` is the live value you measured.

   **Exception:** If you extract the live site at 1440, 1024, AND 768 and confirm the spacing
   is identical fixed pixels at all three widths, then fixed pixels are correct. This is rare.

3. **Record the hypothesis** before applying:
   ```
   EXPERIMENT #{N}: {property}
   Hypothesis: {approach} — {specific change}
   Selector/setting: {what you'll modify}
   Expected: {FAIL value} → {target value}
   ```

### 2.1.5 CASCADE CHECK

Before applying the change, scan the existing CSS override file for conflicting rules.
**Skip this step if** the override file does not exist yet (first section being pulled).

1. **Read the CSS override file** (e.g., `assets/gldn-global-overrides.css`).

2. **Find all rules that match the target element or its ancestors/descendants:**
   - Search for selectors containing the same component class (`.hero`, `.hero__container`, `.hero-wrapper`)
   - Search for selectors containing the section ID (`[id*="hero_about"]`)
   - Search for global rules that match the same element (`.hero-wrapper .text-block p`)

3. **Check for conflicts with the proposed change:**

   | Conflict type | Example | Resolution |
   |--------------|---------|------------|
   | `min > max` | Global `min-height: 67vh` on child, you're adding `max-height: 38vw` on parent | Override the `min-height` too, or adjust approach |
   | `!important` clash | Global `letter-spacing: 0.01em !important`, you're adding `letter-spacing: 0.1em` (no !important) | Add `!important` or use more specific selector |
   | Same property on same element | Global `.hero p { font-weight: 400 }`, you're adding `[id*="section"] .hero p { font-weight: 300 }` | Verify specificity wins, or use `!important` |
   | `overflow: hidden` on ancestor | You're adding `overflow: hidden` to constrain height, but text content extends beyond | Do NOT use `overflow: hidden`. Use `aspect-ratio` or `max-height` with visible overflow instead. |

4. **If a conflict is found:**
   - Log the conflict in the experiment record
   - Adjust the hypothesis to resolve the conflict (e.g., override both properties, use a different approach)
   - If the conflict requires editing the global rule, record it as a second step (do NOT edit two rules in one iteration)

5. **If no conflicts found:** proceed to 2.2 APPLY.

```
CASCADE CHECK: {property}
Searching override file for rules matching: .hero, .hero__container, [id*="hero_about"]
Found: .hero-wrapper .hero__container { min-height: 67vh } (line 362)
CONFLICT: proposed max-height: 38vw on .hero would be overridden by child's min-height: 67vh
→ Adjusting hypothesis: override min-height on .hero__container first
```

#### Worked Example: Hero Banner Height Conflict

refine-section wants to constrain the hero section height to ~547px. It hypothesizes:
`[id*="hero_about"] .hero { max-height: 38vw; overflow: hidden; }`

**CASCADE CHECK finds:**
1. Line 362: `.hero-wrapper .hero__container { min-height: 67vh; }` — a GLOBAL rule
   setting min-height on the container INSIDE `.hero`
2. At 1440x900: `67vh = 603px`, `38vw = 547px`. The child's min-height (603px) exceeds
   the parent's max-height (547px). CSS resolves this by ignoring the max-height.
3. To make max-height work, `overflow: hidden` was added. But this clips text content
   that extends beyond the 547px boundary.

**Resolution:** The cascade check flags both issues:
- CONFLICT: `min-height: 67vh` on child > `max-height: 38vw` on parent
- RISK: `overflow: hidden` will clip positioned content (text overlay)

The algorithm adjusts: instead of `max-height + overflow:hidden`, use the height mechanism
data (`responsive_type: "width-relative"`, `padding-top: 38%`) and apply
`[id*="hero_about"] .hero__container { min-height: unset; aspect-ratio: 100/38; }`.
This overrides the conflicting global min-height AND sets the correct responsive behavior.

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

4. **VISIBILITY GATE (after property PASS only):** If the property test passes, run the
   visibility check on ALL text elements in the section to confirm nothing was made invisible
   by the change. This catches `overflow: hidden` clipping, z-index regressions, and
   elements pushed offscreen.

   ```javascript
   // Run on the dev site after each PASS
   (() => {
     const section = document.querySelector('SECTION_SELECTOR');
     if (!section) return 'section-not-found';
     const texts = section.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button');
     const invisible = [];
     for (const el of texts) {
       if (!el.textContent?.trim()) continue;
       const r = el.getBoundingClientRect();
       const cs = getComputedStyle(el);
       if (r.width === 0 || r.height === 0 || cs.opacity === '0' ||
           cs.visibility === 'hidden' || cs.display === 'none') {
         invisible.push(el.tagName + ': ' + el.textContent.trim().substring(0, 30));
         continue;
       }
       // Check overflow clipping by ancestors (including Shadow DOM)
       let a = el.parentElement;
       while (a) {
         const acs = getComputedStyle(a);
         if (acs.overflow === 'hidden' || acs.overflow === 'clip') {
           const ar = a.getBoundingClientRect();
           if (r.top >= ar.bottom || r.bottom <= ar.top ||
               r.left >= ar.right || r.right <= ar.left) {
             invisible.push(el.tagName + ': ' + el.textContent.trim().substring(0, 30) + ' [clipped]');
             break;
           }
         }
         if (!a.parentElement) {
           const root = a.getRootNode();
           if (root instanceof ShadowRoot) { a = root.host; continue; }
         }
         a = a.parentElement;
       }
     }
     return JSON.stringify({ invisible, total: texts.length });
   })()
   ```

   **If `invisible` is non-empty:** The change caused a visibility regression.
   - Mark as `REGRESSION ✗` (text element invisible)
   - Revert the change (`git checkout -- <file>`)
   - Log: which element became invisible, and why (clipped, hidden, zero-size)
   - Do NOT mark the property variance as PASS. A "correct" font-weight on an invisible
     element is not a fix.

   ```
   RESULT: PASS ✓  (font-weight: 500 → 300, matches live)
   VISIBILITY GATE: FAIL ✗  (h1 "About GLDN Jewelry" clipped by .hero overflow:hidden)
   → Treating as REGRESSION. Reverting.
   ```

5. **CROSS-BREAKPOINT CHECK (layout CSS overrides only):** If the change was a CSS override
   affecting layout properties (padding, margin, gap, grid-template-columns, width, height,
   max-width, max-height, aspect-ratio), verify it doesn't break at other breakpoints.

   **Skip this step if** the change was a JSON setting, a typography-only CSS property
   (font-size, font-weight, color, letter-spacing, line-height), or a non-layout override.

   Run the same extraction at two additional viewport widths: **1024px** and **768px**.
   You don't need pixel-perfect matches at these sizes, but check for:

   - **Content overflow:** Is text being pushed outside its container or off-screen?
   - **Column collapse:** In a multi-column grid, does the content column still have
     reasonable width? (Minimum ~250px for a text column with body copy.)
   - **Spacing ratio:** Does the spacing between columns look proportional, or is it
     consuming >40% of the available width?

   ```javascript
   // Quick layout health check at a given viewport width
   ((sectionSelector, viewportWidth) => {
     const section = document.querySelector(sectionSelector);
     if (!section) return JSON.stringify({ error: 'section not found' });
     const columns = section.querySelectorAll('[class*="grid"] > *, [class*="columns"] > *');
     const results = [];
     for (const col of columns) {
       const r = col.getBoundingClientRect();
       results.push({
         class: col.className.split(' ').slice(0, 2).join(' '),
         width: Math.round(r.width),
         height: Math.round(r.height),
         overflow: r.right > viewportWidth || r.left < 0
       });
     }
     const sectionRect = section.getBoundingClientRect();
     const gap = columns.length >= 2
       ? Math.round(columns[1].getBoundingClientRect().left - columns[0].getBoundingClientRect().right)
       : 0;
     return JSON.stringify({
       viewport: viewportWidth,
       section_width: Math.round(sectionRect.width),
       columns: results,
       gap: gap,
       spacing_ratio: Math.round((gap / sectionRect.width) * 100) + '%'
     });
   })('SECTION_SELECTOR', VIEWPORT_WIDTH)
   ```

   ```
   CROSS-BREAKPOINT CHECK: founder_section grid layout
     1440px: ✓ text=432px, image=661px, gap=123px (9% of width)
     1024px: ✗ text=178px, image=308px, gap=123px (17% of width) — text column too narrow
     768px:  ✗ text=34px, image=91px, gap=123px (22% of width) — layout broken
   → FAIL: fixed-pixel gap/padding doesn't scale. Switching to clamp() values.
   ```

   **If the cross-breakpoint check fails:**
   - Mark as `REGRESSION ✗` (layout breaks at narrower viewport)
   - Revert the change (`git checkout -- <file>`)
   - Go back to 2.1 with a responsive-unit approach (see "No hardcoded pixel values" hard rule)
   - Log the viewport widths where it broke and why

   **If it passes at all three widths:** proceed to 2.4.

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
   find-variances also runs the **Visual Visibility Check** (new in v0.14.0), which will catch
   any text elements that became invisible during the refine session.
2. If new `open` variances appeared in the report (including visibility variances): add them to the queue and go back to Step 2.
3. Take a final verification screenshot at all 3 breakpoints (desktop, tablet, mobile) using the capture skill.
4. Compare against the live reference screenshots in `.theme-forge/references/{section}-{page}/`.

### Screenshot Diff Gate (Final)

After all property variances are closed and screenshots are captured, perform a **structural
screenshot comparison** as the last gate before marking the section complete.

This catches the class of bugs where every individual property test passes but the overall
visual result is wrong (e.g., text exists with correct styles but is invisible due to clipping).

1. **For each breakpoint** (desktop, tablet, mobile), compare the dev screenshot against the live reference:

   - **Text presence check:** If the live screenshot shows visible text (heading, eyebrow, body)
     overlaid on an image or background, verify that the same text is visible in the dev screenshot.
     Use the extraction data to confirm: the text element exists, has non-zero bounding box dimensions,
     and passes the visibility check.

   - **Layout sanity check:** If the live section has a text overlay centered on an image, the dev
     section should have the same general layout. A dev screenshot showing only an image with no
     visible text is a FAIL regardless of what computed styles say.

2. **If the screenshot diff reveals a structural mismatch:**
   - Do NOT mark the section as complete
   - Create a new variance with `source: "visual"` and `type: "layout"`
   - Add it to the queue and go back to Step 2

3. **If the screenshots match structurally:** proceed to Step 4.

```
SCREENSHOT DIFF GATE:
  Desktop: ✓ Text overlay visible, layout matches
  Tablet:  ✓ Text overlay visible, stacking matches
  Mobile:  ✗ Text not visible — heading clipped by section overflow
  → Adding variance: h1:visibility:mobile — visible vs clipped
  → Returning to Step 2 for mobile-specific fix
```

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

If all variances are closed (0 remaining), update the section report status from `needs_refinement` to `completed`.
