# Changelog

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
