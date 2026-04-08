# Changelog

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

Pipeline hardening release. Makes theme-pull reliable enough for unsupervised full-store migration runs.

- **State machine**: `.theme-pull/state.json` tracks every section through 6 states (pending, in_progress, completed, completed_code_only, failed, skipped) with atomic write-then-rename persistence
- **Resume protocol**: Kill a run, restart it, picks up where it left off. Stale `in_progress` sections auto-reset after 10 minutes.
- **Lock mechanism**: Session-level lock prevents concurrent runs. Stale locks (>30 min) breakable with `--force`.
- **Error classification**: 7 error classes (css_override_failed, structural_mismatch, missing_asset, schema_incompatible, chrome_mcp_error, liquid_render_error, unknown) with structured error reports and suggested remediation
- **Pipeline flags**: `--full` (all sections), `--force` (break stale lock), `--reset` (reset all to pending), `--reset-failed` (retry failures only)
- **Chrome MCP fallback**: Graceful degradation to code-only analysis when Chrome MCP is unavailable, with `completed_code_only` status
- **Configurable retry budget**: `default_retry_limit` in config (default 3), `computed_style_match_threshold` (default 85%)
- **Status command upgrade**: Shows pipeline lock state, failed section details with error class and remediation, state.json as primary data source
- **Onboard .gitignore**: Auto-adds `.theme-pull/` to `.gitignore` during onboard
- **Config version fix**: defaults.json version corrected from 0.1.0 to 0.3.1

## 0.3.1 — 2026-04-08

- Add gstack skill routing to CLAUDE.md for automatic skill dispatch

## 0.3.0 — 2026-04-07

Efficiency release — focused on one-shotting sections.

- **Learnings system**: `.theme-pull/learnings.json` accumulates knowledge from every correction. When a fix requires retry or the user corrects an approach, the pattern is captured and applied proactively on future sections. Includes confidence levels, scoping (universal/project/theme), and cross-project portability.
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
- JSON-based reporting in `.theme-pull/` project directory
