# theme-pull

AI-assisted Shopify theme migration. Point it at a live site and a target theme, and it systematically matches every section — like `git pull` for theme visuals.

## What It Does

theme-pull automates the tedious work of migrating a Shopify store from one theme to another. It:

1. **Scans** both themes to inventory every page, section, and setting
2. **Maps** each source section to the best target-theme equivalent
3. **Pulls** sections one by one — comparing screenshots, computed styles, and code to match the live site pixel-by-pixel
4. **Reviews** completed work to catch remaining variances

All state is stored in `.theme-pull/` as JSON, so work is resumable across sessions. The pipeline tracks every section through a state machine, handles errors with structured classification, and resumes from where it left off after interruption.

## Install

**Global** (solo developer):
```bash
git clone https://github.com/cfagerlin/theme-pull.git ~/.claude/skills/theme-pull
cd ~/.claude/skills/theme-pull && ./setup
```

**Project-level** (team):
```bash
git clone https://github.com/cfagerlin/theme-pull.git .claude/skills/theme-pull
cd .claude/skills/theme-pull && ./setup --project
```

Works with Claude Code, Cowork, and OpenClaw. The setup script auto-detects your platform.

## Commands

| Command | What it does |
|---------|-------------|
| `/theme-pull onboard` | Configure live URL, theme paths, detect capabilities |
| `/theme-pull scan` | Inventory both themes, generate migration plan |
| `/theme-pull map-section <name>` | Assess one section's compatibility |
| `/theme-pull map-page [page]` | Map all sections on a page |
| `/theme-pull reconcile [--page <tpl>]` | Detect work already done, import into reports |
| `/theme-pull pull-section <name> [--page <tpl>]` | Full compare→fix→verify loop on one section |
| `/theme-pull pull-page [page]` | Pull all sections on a page |
| `/theme-pull pull-header` | Pull the site header |
| `/theme-pull pull-footer` | Pull the site footer |
| `/theme-pull review [page]` | Post-work variance review |
| `/theme-pull status` | Human-readable progress report |
| `/theme-pull upgrade` | Check for and apply updates |
| `/theme-pull --full` | Run all sections across all mapped pages |
| `/theme-pull --full --reset-failed` | Retry all previously failed sections |

## Quick Start

```
/theme-pull onboard
/theme-pull scan
/theme-pull reconcile          # if picking up existing work
/theme-pull pull-header
/theme-pull pull-footer
/theme-pull pull-page
/theme-pull review
/theme-pull status
```

## How Pull Works

The core methodology (in `pull-section`) follows an 11-step loop:

1. Load section mapping **+ learnings** from prior sections
2. Read both theme's section code — use **resolved CSS** from scan (Liquid variables pre-substituted)
3. Align JSON settings (colors, content, padding, images)
4. Screenshot both sites **+ run computed style diff** (structured extraction of all CSS properties)
5. Combine visual + computed diffs into one work list; **check learnings** before planning fixes
6. Apply CSS overrides — learnings tell you where `!important` is needed upfront
7. Fix structural HTML/Liquid issues (extension layer only)
8. Verify with new screenshot — **capture learnings on retry** (what failed → what worked)
9. Move to next variance
10. Final comparison at all breakpoints (desktop, tablet, mobile)
11. Write JSON report with learnings applied/created

### Self-Learning

theme-pull gets smarter with each section. When a fix requires retry or the user corrects an approach, the pattern is captured in `.theme-pull/learnings.json` and applied proactively on future sections. Over time, the ratio of "learnings applied" to "learnings created" should increase — meaning fewer surprises per section and more one-shot completions.

Learnings have scopes (universal, project, theme-specific) and confidence levels. Universal learnings are portable across projects via `--import-learnings`.

## Architecture

```
theme-pull/
├── theme-pull/     # Orchestrator — routes /theme-pull <cmd> to sub-skills
├── onboard/        # Project setup & capability detection
├── scan/           # Full theme inventory & migration planning
├── map-section/    # Per-section compatibility assessment
├── map-page/       # Page-level mapping (composes map-section)
├── reconcile/      # Detect existing work on in-progress migrations
├── pull-section/   # The workhorse — visual section matching
├── pull-page/      # Page-level pulling (composes pull-section)
├── pull-header/    # Convenience wrapper for header
├── pull-footer/    # Convenience wrapper for footer
├── review/         # Post-work variance review
├── status/         # Human-readable progress report
├── upgrade/        # Auto-update from GitHub
├── scripts/        # Platform detection, update checking
├── config/         # Default configuration template
├── setup           # Install script
├── VERSION         # Semver
└── LICENSE         # MIT
```

## Project State

All state lives in `.theme-pull/` in your target theme:

```
.theme-pull/
├── config.json              # Project config (from onboard)
├── state.json               # Pipeline state machine (tracks section progress)
├── site-inventory.json      # Theme inventory (from scan)
├── learnings.json           # Accumulated learnings from retries
├── plan.json                # Migration plan (from scan)
├── mappings/
│   ├── sections/            # Per-section compatibility reports
│   └── pages/               # Per-page mapping summaries
└── reports/
    ├── sections/            # Per-section pull reports
    ├── pages/               # Per-page pull reports
    └── review-*.json        # Review reports
```

## Principles

- **Theme-agnostic** — Works for any Shopify theme→theme migration
- **Visual-first** — Screenshots and computed styles, not just code diffing
- **Non-destructive** — Never modifies the source/base theme
- **Extension layer** — All target customizations in namespaced files (configurable prefix)
- **Resumable** — State machine tracks every section; kill a run and restart it, picks up where it left off. Stale sections auto-recover after 10 minutes
- **Composable** — Each command works independently

## Requirements

**Required:**
- Claude Code, Cowork, or OpenClaw

**Optional (enhances capabilities):**
- Chrome MCP extension (for live-site screenshots and computed style inspection)
- Shopify CLI (for local dev preview)
- Git (for auto-updates)

## License

MIT
