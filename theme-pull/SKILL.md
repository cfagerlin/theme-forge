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
/theme-pull pull-section <name> — Execute compare→fix→verify on a section
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

### Configuration

All project state lives in `.theme-pull/` in the target theme's root:

```
.theme-pull/
├── config.json              # Project configuration (created by onboard)
├── site-inventory.json      # Full site inventory (created by scan)
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

### Platform Detection

theme-pull works across Claude Code, Cowork, and OpenClaw. It detects available capabilities on first run:

| Capability | Claude Code | Cowork | OpenClaw |
|-----------|-------------|--------|----------|
| File read/write | ✓ | ✓ | ✓ |
| Bash/shell | ✓ | ✓ (sandboxed) | ✓ |
| Chrome MCP | Maybe | Maybe | Maybe |
| Computer use | ✗ | ✓ | ✗ |
| Subagents | ✓ | ✓ | ? |

When Chrome MCP is unavailable, visual comparison falls back to code-only analysis. When Shopify CLI is unavailable, dev preview is skipped with instructions for manual verification.

### Architecture Principles

1. **Theme-agnostic**: Works for any base→target Shopify theme migration, not just legacy→Horizon. Extension layer prefix is configurable.
2. **Visual-first, code-capable**: Chrome MCP enables pixel-level comparison; without it, falls back to schema/CSS/settings analysis.
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
