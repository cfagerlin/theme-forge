---
name: capture
description: >
  Deterministic section-scoped screenshot capture at all breakpoints (desktop, tablet, mobile).
  Produces reference screenshots for comparison. No agent discretion on technique.
  - MANDATORY TRIGGERS: theme-forge capture, capture section, screenshot section
---

# capture — Section Screenshot Capture

Take section-scoped screenshots at three breakpoints (desktop, tablet, mobile) using the deterministic `screenshot.sh` script. One command, all three breakpoints, no agent discretion.

> **Computed style extraction has moved to `find-variances`.** capture is screenshots only.
> Use `/theme-forge find-variances` for extraction + comparison.

## Hard Rules

1. **ALWAYS use `scripts/screenshot.sh`.** Never call `playwright-cli` directly. Never use `mcp__playwright__*` tools. The script handles viewport sizing, popup dismissal, section scrolling, and validation.
2. **NEVER take a full-page screenshot.** Every capture targets a single section via `--selector`.
3. **If the script fails (`CAPTURE_STATUS=error`): STOP.** Do not continue the workflow without screenshots.
4. **ALWAYS verify the desktop screenshot** by reading it with the Read tool after capture. If it's blank or shows the wrong section, re-run the script once. If still wrong, FAIL.

## Arguments

```
/theme-forge capture <url> --section <selector> [--output <dir>] [--reference <name>]
```

- `<url>` — Full page URL (live site or dev server)
- `--section <selector>` — **Required.** One of:
  - CSS selector: `#shopify-section-hero`, `.shopify-section:nth-child(3)`
  - Numeric index: `0`, `1`, `2` (0-indexed position among `.shopify-section` elements)
- `--output <dir>` — Output directory (default: `.theme-forge/tmp/capture/`)
- `--reference <name>` — Also store results in `.theme-forge/references/<name>/` (committed to git)

## Output

```
<output>/
├── desktop.png          # 2560px viewport (high resolution)
├── tablet.png           # 768px viewport
├── mobile.png           # 375px viewport
└── meta.json            # (if --reference) capture metadata
```

## Viewport Sizes (hardcoded in script)

| Breakpoint | Width | Height | Notes |
|---|---|---|---|
| Desktop | 2560 | 1440 | High-res for variance detection |
| Tablet | 768 | 1024 | Standard tablet |
| Mobile | 375 | 812 | Standard mobile |

These are not configurable by the agent. The script enforces them.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)
- `@playwright/cli` must be available (`npx @playwright/cli` or global install)

## Workflow

### Step 1: Find the Script

```bash
# Find the script (project-local or global install)
DS="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/screenshot.sh"
[ -x "$DS" ] || DS="$HOME/.claude/skills/theme-forge/scripts/screenshot.sh"
```

### Step 2: Run Capture

```bash
eval "$("$DS" capture --url "<url>" --selector "<selector>" --out "<output_dir>")"
```

**If `CAPTURE_STATUS=error`: STOP.** Read the stderr output for the error message. Do not continue without screenshots.

For reference captures (stored in git for sharing across sessions):
```bash
eval "$("$DS" capture --url "<url>" --selector "<selector>" --out "<output_dir>" --reference "<name>")"
```

### Step 3: Verify

Read `$CAPTURE_DESKTOP` with the Read tool. Check:
- Image shows the target section content
- Not blank/white/grey
- Correct responsive layout for the section

If the screenshot is wrong, re-run Step 2 once. If still wrong: **FAIL**.

### Step 4: Use Results

After `eval`, these variables are available:
- `$CAPTURE_STATUS` — `ok` or `error`
- `$CAPTURE_DESKTOP` — path to desktop screenshot
- `$CAPTURE_TABLET` — path to tablet screenshot
- `$CAPTURE_MOBILE` — path to mobile screenshot

## How pull-section Invokes This Skill

pull-section reads this SKILL.md and follows the workflow above inline.

**Step 4 of pull-section (capture live + dev):**

```
4.1 Live reference:
  Check .theme-forge/references/{section}-{page}/meta.json
  IF exists → use stored reference screenshots (all three breakpoints)
  IF not exists → run capture with --reference

4.2 Dev site:
  Run capture on dev URL
  Output to .theme-forge/tmp/capture-dev/

4.3 Extraction:
  Run find-variances for computed style extraction + comparison
  Writes variance array to section report
```

**Step 8 of pull-section (verify fix):**

```
8.1 Run capture on dev URL (all three breakpoints)
8.2 Compare each breakpoint against stored live reference
    (Live reference is NOT re-captured)
8.3 Run find-variances for full re-extraction + comparison
```

## Recapturing References

If the live site changes:

```bash
eval "$("$DS" capture --url "https://example.com" --selector "#shopify-section-hero" --out .theme-forge/tmp/capture --reference hero-index)"
```

This overwrites the stored reference.

## Using the Browser for JS Evaluation (find-variances)

The script also supports running JS at specific breakpoints, used by find-variances:

```bash
RESULT=$("$DS" eval --url "<url>" --js "<expression>" --breakpoint desktop)
```

Valid breakpoints: `desktop`, `tablet`, `mobile`. The viewport is set automatically.

## Closing the Browser

When done with all captures (e.g., at section approval or cleanup):

```bash
"$DS" close
```

## Fallback: No Playwright CLI

If `@playwright/cli` is not available, the script will fail. Install it:

```bash
npm install -g @playwright/cli@latest
```

Or use npx (auto-installed on first run).
