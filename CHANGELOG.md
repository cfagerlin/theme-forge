# Changelog

## 0.5.0 — 2026-04-08

**theme-forge.** Renamed from theme-pull. Same tool, better name.

- **Renamed to theme-forge**: All commands, config paths, and state directories updated. `.theme-pull/` → `.theme-forge/`, `/theme-pull` → `/theme-forge`.
- Existing installs: re-run `setup` to update. State files in `.theme-pull/` will need to be moved to `.theme-forge/` (or start fresh with `onboard`).

## 0.4.6 — 2026-04-08

Enforcement release. Closes loopholes that let the agent skip fixes.

- **Closed zero-tolerance loophole**: Explicit list of properties that are NEVER platform limitations (font-weight, font-size, letter-spacing, container width, image sizing, padding, alignment). "Global theme setting" is not an excuse to skip a fix. Override with CSS `!important`.
- **Mandatory extraction script**: The JS extraction script MUST be run on both live and dev sites during verification. Cannot be skipped because "screenshots look close enough."
- **Final Validation Gate**: Replaced soft "Final Visual Comparison" step with a hard gate. Must build a delta table comparing every extracted property. If ANY row has a non-zero delta, the section cannot be declared done. The delta table must be shown to the user.
- **Agent cannot accept variances**: Only the user can accept a variance. The agent may never mark a difference as "accepted" or "known limitation" on its own.
- **Two new operational rules**: (8) always run the extraction script, (9) never accept a variance without user approval.

Prompted by a services page pull where the agent accepted font-weight 700 vs 400 as a "global Horizon setting" and declared the section done with visible variances in hero height, image aspect ratios, container widths, and text positioning.

## 0.4.5 — 2026-04-08

Image fidelity release. Fixes the "same image looks different" problem.

- **Image container validation**: New checks (#17, #18) in rendered output validation. Extracts `getBoundingClientRect()` on image containers, `object-fit`, `object-position`, and `aspect-ratio` from both live and dev. Catches when images show different visible areas despite using the same source file.
- **Image extraction in JS script**: The validation script now captures all `<img>` elements with their container dimensions, object-fit/position, and aspect-ratio. Enables precise comparison of which part of an image is visible.
- **Image Viewable Area Mismatch gotcha**: New common gotcha documenting the three most frequent causes of image differences (container height, object-position focal point, aspect-ratio vs explicit height).

## 0.4.4 — 2026-04-08

Precision and safety release. Catches variances that code-only analysis misses.

- **Browse tool runtime verification**: When browse tool was configured during onboard but is unavailable at runtime, STOP and ask the user whether to fall back to code-only or troubleshoot. No more silent degradation.
- **Bounding box extraction**: New validation check (#16) captures `getBoundingClientRect()` for all key elements (headings, paragraphs, images, buttons) on both live and dev sites. Compares x, y, width, height to catch layout/positioning differences invisible in computed style diffs.
- **Zero-tolerance on measured deltas**: Any measurable difference between live and dev rendering MUST be fixed. "Could add if needed" is not a valid resolution. Only user-approved accepted variances or documented platform limitations are exceptions.
- **Cutover checklist**: `.theme-forge/cutover.json` auto-accumulates items that require manual action during production go-live (template assignments, asset uploads, custom section verification). New `/theme-forge cutover` command displays and verifies the checklist.
- Total commands: 14 (was 13)

## 0.4.3 — 2026-04-08

Operational quality release. Encodes real-session learnings into the methodology.

- **7 operational rules**: Extracted from analyzing a real pull-page session (lagunapeak.com → Horizon). Rules: never do rem math manually, read target schema first, find CSS loading mechanism early, navigate before screenshot, screenshot individual sections, match visual weight via font settings, set global settings before sections.
- **Favicon detection**: pull-page Step 0 now extracts favicon from the live site's HTML via browse tool and sets it in the target theme's `settings_data.json`.

## 0.4.2 — 2026-04-08

Visual fidelity release. Makes cross-theme CSS comparison actually work.

- **Cross-theme CSS resolution**: New Step 2.5 in pull-section requires resolving both themes' CSS variables to final computed pixel/color/font values and comparing those, not variable names. Includes a cross-theme variable mapping reference (Dawn↔Horizon) for colors, fonts, spacing, and layout.
- **Rendered output validation checklist**: 15 automated checks (background color, font weight/size, letter-spacing, padding, button variant, Liquid errors, empty CSS values, placeholder images) with a JavaScript extraction script that runs on both sites via the browse tool.
- **Light/dark polarity check**: Detects when a section's background color polarity flips between live and dev (the single most visible migration error).
- **Common Gotchas expanded**: CSS variable name mismatches (#1 error source), heading weight differences, spacing formula resolution, rendered HTML validation.
- **Browse tool abstraction**: Replaced all Chrome MCP references with a browse tool layer supporting gstack browse binary, Playwright MCP (`@playwright/mcp`), and legacy Chrome MCP.
- **Onboard install prompt**: When no browse tool is detected, prompts user to install Playwright MCP or notes gstack browse if available.
- **Shopify CLI 3.x auth**: Use `shopify theme list` for authentication and theme detection (CLI 3.x removed `auth login`)

## 0.4.0 — 2026-04-08

Pipeline hardening release. Makes theme-forge reliable enough for unsupervised full-store migration runs.

- **State machine**: `.theme-forge/state.json` tracks every section through 6 states (pending, in_progress, completed, completed_code_only, failed, skipped) with atomic write-then-rename persistence
- **Resume protocol**: Kill a run, restart it, picks up where it left off. Stale `in_progress` sections auto-reset after 10 minutes.
- **Lock mechanism**: Session-level lock prevents concurrent runs. Stale locks (>30 min) breakable with `--force`.
- **Error classification**: 7 error classes (css_override_failed, structural_mismatch, missing_asset, schema_incompatible, chrome_mcp_error, liquid_render_error, unknown) with structured error reports and suggested remediation
- **Pipeline flags**: `--full` (all sections), `--force` (break stale lock), `--reset` (reset all to pending), `--reset-failed` (retry failures only)
- **Chrome MCP fallback**: Graceful degradation to code-only analysis when Chrome MCP is unavailable, with `completed_code_only` status
- **Configurable retry budget**: `default_retry_limit` in config (default 3), `computed_style_match_threshold` (default 85%)
- **Status command upgrade**: Shows pipeline lock state, failed section details with error class and remediation, state.json as primary data source
- **Onboard .gitignore**: Auto-adds `.theme-forge/` to `.gitignore` during onboard
- **Config version fix**: defaults.json version corrected from 0.1.0 to 0.3.1

## 0.3.1 — 2026-04-08

- Add gstack skill routing to CLAUDE.md for automatic skill dispatch

## 0.3.0 — 2026-04-07

Efficiency release — focused on one-shotting sections.

- **Learnings system**: `.theme-forge/learnings.json` accumulates knowledge from every correction. When a fix requires retry or the user corrects an approach, the pattern is captured and applied proactively on future sections. Includes confidence levels, scoping (universal/project/theme), and cross-project portability.
- **Computed style diff**: Structured JavaScript extraction that pulls all visual CSS properties from both live and dev sites in one pass, producing a severity-rated diff table. Replaces ad-hoc inspection.
- **Resolved CSS in scan**: `scan` now pre-resolves all Liquid template variables in section CSS against `settings_data.json`, eliminating manual cross-referencing during pull.
- **!important guardrails**: !important usage is learning-driven, not default. Each use must trace to a specific learning with a documented trigger. Code comments reference the learning ID.
- Seed learnings created on onboard (3 universal rules)

## 0.2.0 — 2026-04-07

- New command: `reconcile` — detects work already done on in-progress migrations, creates report stubs with completeness tiers (Done/Mostly done/In progress/Scaffolded/Not started)
- `pull-section` now accepts `--page <template>` and `--url <live-page-url>` arguments for page context
- `review` now supports accepted variances — "close enough" decisions persist across sessions and don't create noise on future reviews
- Total commands: 13 (was 12)

## 0.1.0 — 2026-04-07

Initial release.

- Core commands: `onboard`, `scan`, `map-section`, `pull-section`
- Compound commands: `map-page`, `pull-page`, `pull-header`, `pull-footer`
- Utility commands: `review`, `status`, `upgrade`
- Setup script with global and project-level install modes
- Platform detection: Claude Code, Cowork, OpenClaw
- Auto-update mechanism via GitHub version checking
- JSON-based reporting in `.theme-forge/` project directory
