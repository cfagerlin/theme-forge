---
name: theme-forge
description: >
  **Shopify Theme Migration Toolkit**: AI-assisted visual migration from any Shopify theme to any target theme. Orchestrates section-by-section comparison, mapping, and pixel-perfect pulling. Commands: onboard, scan, map-section, map-page, pull-section, pull-page, pull-header, pull-footer, review, cutover, status, upgrade.
  - MANDATORY TRIGGERS: theme-forge, theme pull, migrate theme, pull section, pull page, pull header, pull footer, scan theme, map section, map page, theme migration, theme status, theme review
---

# theme-forge — Shopify Theme Migration Toolkit

AI-assisted visual migration from any Shopify theme to any target theme. Think of it as `git pull` for theme visuals — you point it at a live site and a target theme, and it systematically matches every section.

## Quick Start

```
/theme-forge onboard    — Configure a project for migration
/theme-forge scan       — Inventory all pages, sections, and settings
/theme-forge map-section <name>  — Assess compatibility of a single section
/theme-forge map-page [path]    — Map all sections on a page
/theme-forge reconcile [--page <template>]  — Detect work already done, create report stubs
/theme-forge pull-section <name> [--page <template>] — Execute compare→fix→verify on a section
/theme-forge pull-page [path]   — Pull all sections on a page
/theme-forge pull-header        — Pull the site header
/theme-forge pull-footer        — Pull the site footer
/theme-forge review [path]      — Post-work variance review
/theme-forge status             — Human-readable migration progress report
/theme-forge cutover            — Show cutover checklist for production go-live
/theme-forge upgrade            — Check for and apply updates
/theme-forge --debug on         — Enable debug mode globally (persists in config.json)
/theme-forge --debug off        — Disable debug mode globally
```

## How It Works

theme-forge is a multi-skill repo. Each command above maps to a subdirectory with its own SKILL.md. This orchestrator routes commands to the right sub-skill.

### Command Routing

When invoked as `/theme-forge <command> [args]`:

1. Parse the command name from the first argument
2. Load the sub-skill SKILL.md from the corresponding directory
3. Pass remaining arguments to the sub-skill
4. If no command is given, show the quick start reference above

### Pipeline Flags

These flags modify pipeline behavior for batch operations (`pull-page`, `pull-header`, `pull-footer`, or `--full`):

```
--full                 Run pull on ALL sections across all mapped pages
--force                Break a stale lock and resume (requires lock age > 30 min)
--reset                Reset all sections to pending (asks for confirmation first)
--reset-failed         Reset only failed sections to pending for retry
--debug                Save full transcript, screenshots, and diffs to .theme-forge/debug/
--no-debug             Disable debug for this run (overrides global setting)
```

### `--debug` Mode

Debug mode can be activated three ways (highest priority first):

1. **`--no-debug` flag** — disables debug for this run, overrides everything
2. **`--debug` flag** — enables debug for this run
3. **Global setting** in `.theme-forge/config.json` → `"debug": true` — applies to all runs

**To toggle the global setting:**
```
/theme-forge --debug on     — sets "debug": true in config.json
/theme-forge --debug off    — sets "debug": false in config.json
```

When handling `/theme-forge --debug on` or `/theme-forge --debug off`:
1. Read `.theme-forge/config.json`
2. Set or update the `"debug"` key (`true` or `false`)
3. Write back the file
4. Confirm: "Debug mode is now **on** globally. All runs will save transcripts and artifacts to `.theme-forge/debug/`. Use `--no-debug` on any command to skip it for one run."

When debug is active (by any method), **thread it through to every sub-skill invocation.** Each pull-section call creates its own debug directory at `.theme-forge/debug/{timestamp}-{section-key}/` with a transcript, screenshots, computed style diffs, and a summary.

After all sections complete, the debug directory contains a full audit trail. A human or another agent can review `.theme-forge/debug/` to diagnose issues without having watched the session live.

```
.theme-forge/debug/
├── 20260409-142000-featured-collection-1:index/
│   ├── transcript.md
│   ├── summary.json
│   ├── base-settings.json
│   ├── target-settings-before.json
│   ├── target-settings-after.json
│   ├── computed-values.json
│   ├── variances.json
│   ├── screenshots/
│   │   ├── step4-live.png
│   │   ├── step4-dev.png
│   │   └── step8-verify.png
│   └── diffs/
│       ├── computed-live.json
│       ├── computed-dev.json
│       ├── computed-dev-after.json
│       └── delta-table.md
├── 20260409-143500-slideshow-1:index/
│   └── ...
└── ...
```

### `--full` Workflow

When `--full` is passed, run the complete pipeline in order. **Do not skip steps. Do not improvise.**

1. **Check prerequisites**: `.theme-forge/config.json` must exist (run `onboard` first)
2. **Run `scan`** if `.theme-forge/site-inventory.json` does not exist. This inventories both themes and creates the migration plan.
3. **Run `map-page`** for each page template in the site inventory. This creates section mappings in `.theme-forge/mappings/`. Without mappings, pull-section has no source→target section pairs to work from.
4. **Initialize `state.json`** if it does not exist. Every section from every mapped page gets an entry with status `pending`.
5. **Run `pull-header`** (header appears on every page, do it first)
6. **Run `pull-footer`** (footer appears on every page, do it second)
7. **Run `pull-page`** for each page template in order: index, product, collection, then remaining pages
8. **Run `review`** on each completed page

**Every section must go through `pull-section`** with its full compare→fix→verify loop. Do not skip the visual comparison. Do not mark sections complete without verification. Do not write section reports without actually running the pull-section workflow on that section.

The state machine in `state.json` tracks progress. If the session is interrupted, re-running `--full` picks up where it left off (completed sections are skipped).

### Configuration

All project state lives in `.theme-forge/` in the target theme's root:

```
.theme-forge/
├── config.json              # Project configuration (created by onboard)
├── state.json               # Pipeline state machine (created on first pull)
├── site-inventory.json      # Full site inventory (created by scan)
├── learnings.json           # Accumulated learnings from retries
├── mappings/
│   ├── sections/            # Per-section compatibility reports
│   │   ├── header.json
│   │   ├── footer.json
│   │   └── ...
│   └── pages/               # Per-page mapping summaries
│       ├── index.json
│       ├── product.json
│       └── ...
├── reports/
│   ├── sections/            # Per-section pull reports
│   │   ├── header.json
│   │   └── ...
│   └── pages/               # Per-page pull reports
│       └── ...
├── cutover.json              # Items requiring manual action during production go-live
└── plan.json                # Migration plan (created by scan)
```

### State Machine (`state.json`)

The pipeline state machine tracks progress across sections and sessions. It enables resume after interruption, progress reporting, and batch operations.

```json
{
  "pipeline": {
    "stage": "pull",
    "started_at": "2026-04-08T12:00:00Z",
    "locked_by": null
  },
  "sections": {
    "featured-collection-1:index": {
      "section": "featured-collection",
      "page": "index",
      "status": "completed",
      "attempts": 1,
      "last_updated": "2026-04-08T12:10:00Z",
      "visual_verification": "passed",
      "error_history": []
    },
    "hero-slideshow-1:index": {
      "section": "hero-slideshow",
      "page": "index",
      "status": "in_progress",
      "attempts": 2,
      "last_updated": "2026-04-08T12:15:00Z",
      "visual_verification": null,
      "error_history": []
    }
  }
}
```

**State transitions:**

| From | To | Trigger |
|------|----|---------|
| (new) | `pending` | Section discovered during scan/map |
| `pending` | `in_progress` | pull-section starts working on it |
| `in_progress` | `completed` | Visual verification passed |
| `in_progress` | `completed_code_only` | Code analysis done, no browse tool |
| `in_progress` | `failed` | Retry budget exhausted or unrecoverable error |
| `in_progress` | `pending` | Staleness timeout (10 min with no update) |
| `failed` | `pending` | `--reset-failed` flag |
| any | `pending` | `--reset` flag (with confirmation) |
| any | `skipped` | User explicitly skips section |

**Atomic writes:** Always write state.json using write-then-rename: write to `state.json.tmp`, then rename to `state.json`. This prevents corruption if the process is killed mid-write.

**Staleness recovery:** If a section has `status: "in_progress"` and `last_updated` is older than 10 minutes, treat it as stale and reset to `pending`. This handles sessions that were killed without cleanup.

### Lock Mechanism

When running batch operations (`--full`, `pull-page`), the pipeline acquires a lock:

1. **Acquire**: Set `pipeline.locked_by` to a session identifier (e.g., `session-{timestamp}`) and `pipeline.locked_at` timestamp
2. **Check**: Before acquiring, check if a lock exists. If it does:
   - If lock age < 30 minutes: refuse to start, tell the user another session may be running
   - If lock age >= 30 minutes and `--force` is passed: break the lock and acquire
   - If lock age >= 30 minutes without `--force`: warn and suggest `--force`
3. **Release**: Clear `locked_by` and `locked_at` when the batch operation completes (success or failure)

### Resume Protocol

When `--full` or `pull-page` starts, it reads `state.json` and:

1. Skips sections with status `completed` or `completed_code_only`
2. Skips sections with status `skipped`
3. Skips sections with status `failed` (use `--reset-failed` to retry them)
4. Resets stale `in_progress` sections (>10 min old) to `pending`
5. Processes all `pending` sections in order

This means you can kill a run and restart it. It picks up where it left off. Failed sections are NOT automatically retried, they require explicit `--reset-failed` to re-queue.

### Platform Detection

theme-forge works across Claude Code, Cowork, and OpenClaw. It detects available capabilities on first run:

| Capability | Claude Code | Cowork | OpenClaw |
|-----------|-------------|--------|----------|
| File read/write | ✓ | ✓ | ✓ |
| Bash/shell | ✓ | ✓ (sandboxed) | ✓ |
| Browse tool | Maybe | Maybe | Maybe |
| Computer use | ✗ | ✓ | ✗ |
| Subagents | ✓ | ✓ | ? |

When no browse tool is available, visual comparison falls back to code-only analysis. When Shopify CLI is unavailable, dev preview is skipped with instructions for manual verification.

### Architecture Principles

1. **Theme-agnostic**: Works for any base→target Shopify theme migration, not just legacy→Horizon. Extension layer prefix is configurable.
2. **Visual-first, code-capable**: Browse tools (gstack browse, Playwright MCP) enable pixel-level comparison; without them, falls back to schema/CSS/settings analysis.
3. **Non-destructive**: `map-*` and `scan` never modify files. `pull-*` modifies only the target theme, never the base theme.
4. **Resumable**: All state in `.theme-forge/`. Sessions can be interrupted and resumed.
5. **Composable**: Each command works independently. `scan` composes them into a pipeline, but you can `map-section` one section without a full migration.

### Extension Layer Convention

All customizations in the target theme go in namespaced files. The default prefix is `custom-` (configurable in `config.json`):

- `sections/{prefix}*.liquid`
- `snippets/{prefix}*.liquid`
- `assets/{prefix}*.css`, `assets/{prefix}*.js`
- `blocks/{prefix}*.liquid`

NEVER modify the target theme's core files. This preserves upstream upgradability.

### Safety Rules

- **NEVER run `shopify theme push` or `shopify theme publish` without explicit user approval.** All theme work happens locally. The `shopify theme dev` server hot-reloads local files, so pushing is unnecessary during development. When the user is ready to push, they will tell you. This is a bright red line — no exceptions, no "just pushing config", no "only pushing one file".
- **NEVER access the production store's Shopify admin.** The live site is read-only (public storefront only).
- **NEVER modify the base theme files.** The base theme export is a read-only reference.
- **NEVER change content copy** (headings, body text, button labels) without explicit instruction. The live site is the source of truth for content.
