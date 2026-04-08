---
name: theme-pull
description: >
  **Shopify Theme Migration Toolkit**: AI-assisted visual migration from any Shopify theme to any target theme. Orchestrates section-by-section comparison, mapping, and pixel-perfect pulling. Commands: onboard, scan, map-section, map-page, pull-section, pull-page, pull-header, pull-footer, review, status, upgrade.
  - MANDATORY TRIGGERS: theme-pull, theme pull, migrate theme, pull section, pull page, pull header, pull footer, scan theme, map section, map page, theme migration, theme status, theme review
---

# theme-pull — Shopify Theme Migration Toolkit

AI-assisted visual migration from any Shopify theme to any target theme. Think of it as `git pull` for theme visuals — you point it at a live site and a target theme, and it systematically matches every section.

## Quick Start

```
/theme-pull onboard    — Configure a project for migration
/theme-pull scan       — Inventory all pages, sections, and settings
/theme-pull map-section <name>  — Assess compatibility of a single section
/theme-pull map-page [path]    — Map all sections on a page
/theme-pull reconcile [--page <template>]  — Detect work already done, create report stubs
/theme-pull pull-section <name> [--page <template>] — Execute compare→fix→verify on a section
/theme-pull pull-page [path]   — Pull all sections on a page
/theme-pull pull-header        — Pull the site header
/theme-pull pull-footer        — Pull the site footer
/theme-pull review [path]      — Post-work variance review
/theme-pull status             — Human-readable migration progress report
/theme-pull upgrade            — Check for and apply updates
```

## How It Works

theme-pull is a multi-skill repo. Each command above maps to a subdirectory with its own SKILL.md. This orchestrator routes commands to the right sub-skill.

### Command Routing

When invoked as `/theme-pull <command> [args]`:

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
```

### Configuration

All project state lives in `.theme-pull/` in the target theme's root:

```
.theme-pull/
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

theme-pull works across Claude Code, Cowork, and OpenClaw. It detects available capabilities on first run:

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
4. **Resumable**: All state in `.theme-pull/`. Sessions can be interrupted and resumed.
5. **Composable**: Each command works independently. `scan` composes them into a pipeline, but you can `map-section` one section without a full migration.

### Extension Layer Convention

All customizations in the target theme go in namespaced files. The default prefix is `custom-` (configurable in `config.json`):

- `sections/{prefix}*.liquid`
- `snippets/{prefix}*.liquid`
- `assets/{prefix}*.css`, `assets/{prefix}*.js`
- `blocks/{prefix}*.liquid`

NEVER modify the target theme's core files. This preserves upstream upgradability.

### Safety Rules

- **NEVER access the production store's Shopify admin.** The live site is read-only (public storefront only).
- **NEVER modify the base theme files.** The base theme export is a read-only reference.
- **NEVER change content copy** (headings, body text, button labels) without explicit instruction. The live site is the source of truth for content.
