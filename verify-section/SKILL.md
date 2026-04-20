---
name: verify-section
description: >
  Read-only regression runner for a single Shopify section. Executes saved assertions
  against the dev site and reports PASS / FAIL / STALE / ERROR per check. Never mutates
  code. Never invokes refine. FAIL output embeds the exact refine-section command as
  a bridge.
  - MANDATORY TRIGGERS: theme-forge verify-section, verify section, regression test section, check assertions, run section checks
---

# verify-section — Regression Assertion Runner

Run saved regression assertions against a dev-site section. Each assertion is a frozen
contract: selector + property + expected value at a known state and breakpoint. The
runner evaluates every assertion and prints a structured report. It does not fix
anything. It does not ask follow-up questions about the code. It reports; the user
decides.

## When this runs

1. **After `refine-section` closes variances** and promotes them to assertions — the
   next step printed at the close of refine is `verify-section <name> --page <page>`.
2. **Manually**, any time, against a previously refined section to catch regressions
   from unrelated CSS or JS changes.
3. **From `verify-page`**, which loops this skill across every section with assertions
   on a template.
4. **NOT called by `refine-section` or `pull-section`.** The read-only contract
   (see below) forbids any verify → refine loop inside the same run.

## Arguments

```
/theme-forge verify-section <section-key> --page <template> [options]
```

**Required:**
- `<section-key>` — e.g., `header`, `product-information`, `hero-1`
- `--page <template>` — e.g., `index`, `product`, `collection`

**Options:**
- `--print-example` — print a minimum valid assertion JSON to stdout and exit
  (non-mutating, no dev server needed)
- `--rebaseline` — interactive batch update for STALE assertions (prompts per
  stale entry: keep / update selector / delete)
- `--breakpoint <name>` — restrict the run to a single breakpoint. `<name>` must
  be one of `desktop`, `tablet`, `mobile`. Filters the assertion array to entries
  whose `breakpoint` field (after defaults) matches. Only the matching breakpoint's
  browser session runs — the others are skipped entirely. Use this for
  mobile-only audits, regression sweeps after a responsive change, etc. Any
  unknown value (including misspellings like `mobiel`) hard-errors with the
  allowed list.
- `--only <assertion-id>` — run a single assertion by id (v1.1 — deferred)

## Read-only contract (HARD RULE)

**verify-section never modifies files outside `.theme-forge/verify/<section>/`**, and
inside that directory only these are permitted:
- `run-logs/<timestamp>.json` — append a run record (always)
- `assertions.json` — edited ONLY when `--rebaseline` is passed AND the user
  explicitly approves each change via AskUserQuestion

**verify-section never invokes `refine-section` or `pull-section`.** When a FAIL
occurs, the command prints the exact refine command string. The user copies it and
runs it. There is no automatic bridge. This breaks the feedback-loop deadlock and
makes failures a report, not a prompt.

If a FAIL surfaces during a run and the user says "fix this," verify-section prints
the refine command and exits. It does not call refine on the user's behalf.

## Directory layout

All verify artifacts for a section live under a single folder:

```
.theme-forge/verify/<section-key>/
├── assertions.json          — the frozen contract (JSON is source of truth)
├── generated.md             — auto-regenerated markdown companion (clobbered each run)
├── notes.md                 — user-authored manual QA notes (never clobbered)
└── run-logs/
    ├── 20260419-164201.json — most recent run
    └── ...
```

**One place to look.** The JSON is truth. The generated markdown is a human-readable
audit view, regenerated on every run. The notes file is for the user to scribble
hand-tested edge cases that aren't machine-verifiable.

## Assertion JSON schema (v1)

### Minimum valid assertion (3 required fields)

```json
{
  "selector": ".logo img",
  "property": "width",
  "expected": "120px"
}
```

When fields are omitted, these defaults apply:

| Field | Default |
|---|---|
| `state` | `"default"` |
| `breakpoint` | `"desktop"` |
| `source` | `"manual"` |
| `confidence` | `"high"` |
| `comparator` | `"strict"` |
| `tolerance` | `"none"` |

### Full schema

```json
{
  "schema_version": 1,
  "section_key": "header",
  "page": "index",
  "assertions": [
    {
      "id": "logo:width:desktop:default",
      "selector": ".logo img",
      "property": "width",
      "expected": "120px",
      "state": "default",
      "breakpoint": "desktop",
      "source": "regression",
      "confidence": "high",
      "comparator": "strict",
      "tolerance": "none",
      "note": "logo width on homepage header"
    }
  ]
}
```

**Field reference:**
- `id` — stable identifier: `{element}:{property}:{breakpoint}:{state}`. Auto-generated
  when authoring by promotion. Required only when the minimum shape would collide.
- `selector` — CSS selector (DOM query) — **REQUIRED**
- `property` — CSS property name in camelCase (matches `getComputedStyle`) — **REQUIRED**
- `expected` — expected computed value as string — **REQUIRED**
- `state` — `default` (v1). Reserved: `hover` (v1), `js-disabled` / `theme-editor` /
  `slow-network` (v2)
- `breakpoint` — `desktop` (2560×1440), `tablet` (768×1024), `mobile` (375×812).
  Uses constants from `scripts/screenshot.sh`
- `source` — `regression` (promoted from refine), `manual` (user-authored),
  `edge_case` (user-authored, flagged important)
- `confidence` — `high` / `medium` / `low`. Cosmetic — shown in reports but doesn't
  affect PASS/FAIL
- `comparator` — `strict` (exact match, v1). Reserved: `normalized` (whitespace strip)
- `tolerance` — `"none"` (v1). Reserved: `"±1px"` (v2)
- `note` — optional human-readable context, shown in reports

### 50 assertions/section cap

v1 warns and refuses to run if `assertions.length > 50` on a single section. Keep
assertions focused on load-bearing properties.

## Empty-state handling

If `.theme-forge/verify/<section-key>/assertions.json` does not exist, verify-section
prints:

```
No assertions yet for <section-key>.

Options:
  • /theme-forge verify-section <section-key> --print-example
    Show the minimum JSON to author a first assertion by hand.

  • /theme-forge refine-section <section-key> --page <template>
    Close variances with refine, then promote them to regression assertions.
```

Exit code 0 (informational, not an error). Never create the file silently.

## `--print-example` output

```json
{
  "schema_version": 1,
  "section_key": "header",
  "page": "index",
  "assertions": [
    {
      "selector": ".logo img",
      "property": "width",
      "expected": "120px"
    },
    {
      "selector": ".site-nav a",
      "property": "fontSize",
      "expected": "16px",
      "breakpoint": "tablet"
    },
    {
      "id": "cta:bg:mobile:default",
      "selector": ".cta-button",
      "property": "backgroundColor",
      "expected": "rgb(20, 110, 200)",
      "breakpoint": "mobile",
      "note": "brand accent — verified against live 2026-04"
    }
  ]
}
```

Three rows, progressive: minimum shape, add one field, full shape. Exit 0.

## Preflight validation

Before running, verify-section parses `assertions.json`:

- Missing file → empty-state message (above)
- Invalid JSON → copyable error with line number + offending text
- Missing required field (`selector` | `property` | `expected`) → error with
  assertion index, field name, and the full assertion row
- Unknown `state`, `breakpoint`, `source`, `comparator` → error listing allowed values
- Over 50 assertions → warning + refuse

Example error:

```
ERROR: assertion[2] missing required field "expected"

  {
    "selector": ".site-nav a",
    "property": "fontSize"       // <-- "expected" not set
  }

Fix: add "expected": "<value>" and re-run.
File: .theme-forge/verify/header/assertions.json
```

## Execution flow

### Step 1 — Load + preflight

Read `assertions.json`, validate (see above). Abort on any error.

### Step 1.5 — Apply `--breakpoint` filter (if set)

If the user passed `--breakpoint <name>`:

1. Validate `<name>` is one of `desktop`, `tablet`, `mobile`. Otherwise hard-error:
   ```
   ERROR: --breakpoint <name> must be one of: desktop, tablet, mobile
   Got: <name>
   ```
2. After applying defaults (Step 2), filter the assertion array to entries where
   `breakpoint === <name>`. Drop the rest from this run — they are NOT executed.
3. If zero assertions remain after filtering, print the empty-state message and
   exit 0:
   ```
   verify-section <section> --page <template> --breakpoint <name>
   No assertions for breakpoint "<name>". Exiting.
     Hint: assertions.json has N entries total, all at other breakpoints.
   ```
4. Tag the run log with the filter so future readers know this run was scoped:
   `{"breakpoint_filter": "<name>"}` at the top of the run-log JSON.

The filter is purely a scope reduction — it never mutates `assertions.json`. Other
breakpoints' assertions are untouched and re-eligible the next time you run without
the flag.

### Step 2 — Apply defaults, group by breakpoint

For each assertion missing optional fields, apply defaults. Group assertions by
`breakpoint` so the runner makes one browser session per breakpoint (desktop /
tablet / mobile) instead of one per assertion. With `--breakpoint` set, only the
target breakpoint's group is non-empty.

### Step 3 — Run batched per breakpoint

For each breakpoint that has at least one assertion:

1. `browser_navigate` to `${dev_url}/<page-path>`
2. `browser_resize` to the breakpoint dimensions (desktop 2560×1440, tablet 768×1024,
   mobile 375×812 — same constants as `scripts/screenshot.sh`)
3. `browser_evaluate` with a single JS block that:
   - Iterates every assertion for this breakpoint
   - For each: queries the selector, reads `getComputedStyle`, compares to `expected`
   - Returns an array of `{id, status, actual, expected, selector, reason}`

**Canonical executor JS (use this template — do not improvise):**

```js
(assertions) => {
  return assertions.map((a) => {
    const result = {
      id: a.id,
      selector: a.selector,
      property: a.property,
      expected: a.expected,
      status: null,
      actual: null,
      reason: null
    };
    let el;
    try {
      el = document.querySelector(a.selector);
    } catch (e) {
      result.status = "ERROR";
      result.reason = "invalid selector: " + e.message;
      return result;
    }
    if (!el) {
      result.status = "STALE";
      result.reason = "selector not found";
      return result;
    }
    let value;
    try {
      value = getComputedStyle(el)[a.property];
    } catch (e) {
      result.status = "ERROR";
      result.reason = "getComputedStyle failed: " + e.message;
      return result;
    }
    if (value === undefined || value === "") {
      result.status = "ERROR";
      result.reason = "property '" + a.property + "' returned empty — check camelCase";
      result.actual = value;
      return result;
    }
    result.actual = value;
    result.status = value === a.expected ? "PASS" : "FAIL";
    return result;
  });
}
```

Pass the filtered-by-breakpoint assertion array as the first argument to
`browser_evaluate`. One call per breakpoint. This template is intentionally
synchronous, dependency-free, and does not touch the DOM — pure read-only.

**Result classification:**
| Status | Meaning |
|---|---|
| `PASS` | `getComputedStyle(el)[property] === expected` |
| `FAIL` | selector found; value does not match expected |
| `STALE` | `document.querySelector(selector)` returned null — DOM changed |
| `ERROR` | Invalid selector, getComputedStyle threw, or property returned empty (usually a camelCase mistake like `font-size` instead of `fontSize`) |

### Step 4 — Emit report (terminal first)

Terminal output is the primary interface. Markdown is audit-only.

Example terminal output:

```
verify-section header --page index

PASS  logo:width:desktop:default
PASS  nav:fontSize:desktop:default
FAIL  cta:backgroundColor:mobile:default
  selector: .cta-button
  expected: rgb(20, 110, 200)
  actual:   rgb(50, 50, 50)
  page:     index
  source:   regression
  next:     /theme-forge refine-section header --page index --variances ".cta-button:backgroundColor"

STALE nav:color:tablet:default
  selector: .old-site-nav a  (not found)
  reason:   selector not found; DOM may have changed intentionally.
            Update the assertion or re-refine the section.
  next:     /theme-forge verify-section header --page index --rebaseline

──────────────────────────────────────────────
Summary: 2 PASS · 1 FAIL · 1 STALE · 0 ERROR
Run log: .theme-forge/verify/header/run-logs/20260419-164201.json
```

### Multi-FAIL batch command

If 2+ FAILs, a single consolidated next: line at the bottom:

```
Next: /theme-forge refine-section header --page index --variances ".cta-button:backgroundColor, .hero h1:fontWeight"
```

This line uses `refine-section`'s existing `--variances "el:prop, el:prop, ..."` API
(see `refine-section/SKILL.md`). The user copies one line, refines the whole batch.

### Propagating `--breakpoint` to next: lines

When the run was scoped with `--breakpoint <name>`, every `next:` line MUST include
the same flag so the followup workflow stays scoped to the same breakpoint:

```
FAIL  cta:backgroundColor:mobile:default
  next:     /theme-forge refine-section header --page index --variances ".cta-button:backgroundColor" --breakpoint mobile

STALE nav:color:mobile:default
  next:     /theme-forge verify-section header --page index --rebaseline --breakpoint mobile
```

Multi-FAIL consolidated line:

```
Next: /theme-forge refine-section header --page index --variances ".cta-button:backgroundColor, .hero h1:fontWeight" --breakpoint mobile
```

Without this propagation a user doing a mobile-only audit would silently get
desktop variances back the next time they run refine. Forwarding the flag keeps
the iteration loop tight and predictable.

### Step 5 — Write run log

Append to `.theme-forge/verify/<section-key>/run-logs/<timestamp>.json`:

```json
{
  "timestamp": "2026-04-19T16:42:01Z",
  "section_key": "header",
  "page": "index",
  "schema_version": 1,
  "totals": { "pass": 2, "fail": 1, "stale": 1, "error": 0 },
  "results": [
    {"id": "logo:width:desktop:default", "status": "PASS", "actual": "120px", "expected": "120px"},
    {"id": "cta:backgroundColor:mobile:default", "status": "FAIL", "actual": "rgb(50, 50, 50)", "expected": "rgb(20, 110, 200)", "selector": ".cta-button"},
    {"id": "nav:color:tablet:default", "status": "STALE", "selector": ".old-site-nav a"}
  ]
}
```

Run logs accumulate. They do not mutate `assertions.json`. They are never deleted by
verify — user prunes via editor.

### Step 6 — Regenerate markdown companion

Rewrite `.theme-forge/verify/<section-key>/generated.md` from scratch (clobbered each
run). This is a human-readable mirror of the run log — not where users go to fix
issues. Terminal is primary.

```markdown
# header — verify report · 2026-04-19 16:42:01

**2 PASS · 1 FAIL · 1 STALE · 0 ERROR**

## FAIL

### cta:backgroundColor:mobile:default
- selector: `.cta-button`
- expected: `rgb(20, 110, 200)`
- actual:   `rgb(50, 50, 50)`

## STALE

### nav:color:tablet:default
- selector: `.old-site-nav a`
- reason: selector not found

## PASS

- logo:width:desktop:default
- nav:fontSize:desktop:default

---
Run: .theme-forge/verify/header/run-logs/20260419-164201.json
```

**`notes.md` is never touched.** The user owns it.

## `--rebaseline` flag

The only path where verify-section mutates `assertions.json`. Triggered by
`/theme-forge verify-section header --page index --rebaseline`.

For every STALE assertion, present an AskUserQuestion (at most 4 options):

```
STALE: nav:color:tablet:default
  Old selector: .old-site-nav a

Options:
  A) Keep as-is (remains STALE; re-check after next refine)
  B) Update selector — I'll type the new one
  C) Delete this assertion
  D) Skip for now (abort rebaseline; no change)
```

Process STALE entries in order. A/B/C mutate `assertions.json`. D aborts the entire
rebaseline loop (partial changes already applied are kept; user decides).

Never run `--rebaseline` on FAILs (FAILs are regressions, not stale contracts — they
should go through refine, not rebaseline). Never run `--rebaseline` without at least
one STALE result.

## Distinction from other skills

| Skill | What it does | Lifecycle |
|---|---|---|
| `find-variances` | Extract computed styles and compare live vs dev. Discovers gaps. | Ephemeral — variance array regenerated on every run |
| `refine-section` | Fix known variances with an experiment loop. Closes gaps. | Ephemeral — variances close and disappear |
| **`verify-section`** | **Run saved regression contracts. Catch regressions.** | **Durable — assertions frozen across refactors** |
| `review` | Human/visual audit at the end of a migration | Manual |

**Key distinction:** variances are *diagnostic* (what's different right now). Assertions
are *contracts* (what must always be true). Different objects, different lifetimes,
can share schema but do not share ownership.

## MVP Cut (what's IN v1)

- `/theme-forge verify-section <name> --page <template>` (read-only)
- Schema v1: `default` state, `desktop` / `tablet` / `mobile` breakpoints,
  computed-style only, `strict` comparator
- PASS / FAIL / STALE / ERROR result model
- Batched executor (one browser_evaluate per breakpoint)
- `--print-example` helper (non-mutating)
- `--rebaseline` flag (interactive, STALE-only)
- Preflight JSON validation with copyable errors
- Empty-state message pointing to refine or --print-example
- Terminal-primary output, generated.md companion, notes.md untouched
- Run logs in `run-logs/` (not in assertions.json)
- 50 assertions/section cap with warning
- Failure output contract: id, selector, expected, actual, page, source, next:

## NOT in scope (v2+)

- `/theme-forge verify --all` (multi-page runner)
- `state: hover` (v1 reserved schema but not wired)
- `state: js-disabled` / `theme-editor` / `slow-network`
- Screenshot / visual diff assertions
- `comparator: normalized`, custom tolerances beyond "none"
- `verify-section --add` interactive authoring
- `--only <assertion-id>` single-run iteration
- CI integration (GitHub Actions)
- Markdown → JSON promotion (user edits generated.md → regenerates JSON)
- Assertion schema migrations across versions
- Auto-bridging to `refine-section` (hard-ruled out by read-only contract)

## Verification suite (T1-T7) — blocking for merge

These tests MUST pass before this skill is considered shippable. They verify the
runner itself, not the sections it tests.

- **T1 Missing file → empty-state.** No `assertions.json` → prints empty-state
  message, exit 0, no file created.
- **T2 Invalid JSON → preflight error.** Malformed JSON → line-numbered error,
  exit non-zero, no file created.
- **T3 Min-shape assertion passes.** File with just `selector`/`property`/`expected`
  matching current dev → one PASS, no errors.
- **T4 Selector not found → STALE.** Assertion with `selector: ".does-not-exist"`
  → STALE, suggests `--rebaseline`.
- **T5 Mismatch → FAIL.** Assertion expected `120px`, dev is `100px` → FAIL with
  next: line pointing at refine-section with correct `--variances` payload.
- **T6 Multi-FAIL consolidates next: line.** 2+ FAILs → single consolidated next:
  with comma-separated `--variances` string.
- **T7 --rebaseline skip (option D) preserves state.** Run --rebaseline, choose D
  on first STALE → assertions.json unchanged, exit with partial-progress summary.

T1-T7 are integration tests, not unit tests. They run against a real dev server.
Writing them is part of v1 scope.

## Hard rules summary

1. **Read-only by default.** Mutates only `run-logs/` and `generated.md` unless
   `--rebaseline` is explicitly passed.
2. **Never invokes refine.** FAIL emits a next: string; user copies and pastes.
3. **JSON is truth.** Markdown is regenerated audit.
4. **Terminal is the product.** Don't make users open files to understand failures.
5. **50 assertions/section cap.** Over = warn and refuse.
6. **Preflight before browser.** Bad JSON never touches the dev server.
