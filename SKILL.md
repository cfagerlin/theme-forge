---
name: theme-forge
description: >
  **Shopify Theme Migration Toolkit**: AI-assisted visual migration from any Shopify theme to any target theme. Orchestrates section-by-section comparison, mapping, and pixel-perfect pulling. Commands: onboard, scan, map-section, map-page, pull-section, pull-page, pull-header, pull-footer, refine-section, find-variances, review, cutover, status, upgrade.
  - MANDATORY TRIGGERS: theme-forge, theme pull, migrate theme, pull section, pull page, pull header, pull footer, refine section, find variances, extract variances, compare styles, fix variances, close FAILs, scan theme, map section, map page, theme migration, theme status, theme review
---

# theme-forge — Shopify Theme Migration Toolkit

> **Not installed?** Clone into your Claude Code skills directory:
> ```
> git clone https://github.com/cfagerlin/theme-forge.git ~/.claude/skills/theme-forge
> ```
> Then restart Claude Code. No setup script needed — cloning is the install.

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
/theme-forge status --page <t>  — List all sections on a page with pull commands
/theme-forge status --next      — Show the next section to pull
/theme-forge refine-section <name> [--page <template>] — Autoresearch experiment loop to close extraction FAILs
/theme-forge find-variances <name> [--page <template>] [--force] [--add "desc"] — Extract + compare computed styles, write variance array
/theme-forge capture <url> --section <sel> — Section-scoped screenshot at all breakpoints
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
5. **Natural language shortcuts** — route these to `status`:
   - "what's next?" / "next section" / "what should I pull?" → `status --next`
   - "list sections on [page]" / "show me the [page] sections" / "what's on the homepage?" → `status --page <template>`
   - "what's left?" / "what sections are remaining?" → `status --detail`

### Pipeline Flags

These flags modify pipeline behavior for batch operations (`pull-page`, `pull-header`, `pull-footer`, or `--full`):

```
--full                 Run pull on ALL sections across all mapped pages
--globals-only         Run scan→map→globals→header→footer, commit, then stop
--retry-failed         Retry sections with failed reports
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

When `--full` is passed, run the **complete migration pipeline from zero to finished site**. This is a one-shot command — it handles its own prerequisites. The user should be able to install theme-forge, open a target theme, and run `/theme-forge --full` with no prior setup.

**Do not skip steps. Do not improvise. Each step checks whether it's already been done and skips if so.**

#### Phase 1: Project Setup (auto-onboard)

1. **Check for config**: Read `.theme-forge/config.json`.
   - **If it exists**: Project is already onboarded. Load config and continue.
   - **If it doesn't exist**: Run the `onboard` sub-skill workflow automatically. This collects the dev store domain, resolves the live URL, detects capabilities, writes config, and sets up `.gitignore`. The onboard skill asks interactive questions (dev store domain, extension prefix) — let it run its full interactive flow.

2. **Commit onboard artifacts** (if onboard just ran):
   ```bash
   git add .theme-forge/config.json .theme-forge/mapping-rules.json \
           .theme-forge/conventions.json .theme-forge/learnings/ .gitignore
   git commit -m "theme-forge: onboard project"
   git push
   ```

#### Phase 2: Base Pull + Global Settings

3. **Targeted base pull**: Pull templates, config, sections, snippets, blocks, layout, and code assets from the live theme. See "Targeted Base Pull" below for the full command. Always run this — it's fast (~10-15 sec) and ensures fresh data.

4. **Check for global maps**: Look for `.theme-forge/settings-map.json` and `.theme-forge/class-map.json`.
   - **If both exist**: Global maps are ready. Continue.
   - **If either is missing**: Run `scan --apply-globals` automatically. This inventories the site, generates the settings cross-reference map (`settings-map.json`), CSS class map (`class-map.json`), inventories app embeds (`app-embeds.json`), audits layouts for third-party scripts, and applies global settings (logo, favicon, fonts, colors, body text size) to the target theme's `settings_data.json`. Commit the results:
     ```bash
     git add .theme-forge/settings-map.json .theme-forge/class-map.json \
             .theme-forge/app-embeds.json .theme-forge/template-map.json \
             .theme-forge/site-inventory.json .theme-forge/plan.json \
             .theme-forge/mappings/ \
             config/settings_data.json layout/ snippets/
     git commit -m "scan: global settings, app embeds, template map, layout audit"
     git push
     ```

#### Phase 3: Dev Server

5. **Start the dev server** using the deterministic script:
   ```bash
   eval "$(scripts/dev-server.sh start)"
   ```
   This outputs `DEV_PORT`, `DEV_THEME_ID`, `DEV_URL`, `DEV_PREVIEW_URL`, `DEV_EDITOR_URL`, `DEV_MODE`, and `DEV_STATUS` as environment variables. The script handles everything:
   - Pre-flight safety check (blocks live themes)
   - Reconnects to existing session if still running
   - Detects parallel sessions and auto-creates unpublished theme
   - Finds open port, starts server, captures URLs
   - Writes all `dev_*` fields to config

   **Present the preview and editor URLs to the user** after the script runs. The user needs these to interact with the dev theme.

   Other script commands:
   ```bash
   scripts/dev-server.sh status    # Check if running
   scripts/dev-server.sh restart   # Cache invalidation (same port + theme)
   scripts/dev-server.sh stop      # Stop server, clear config
   scripts/dev-server.sh cleanup   # Stop + delete unpublished theme + orphan scan
   ```

   **On section/page approval (Step 12):** Run `scripts/dev-server.sh cleanup` to delete the unpublished theme if this session created one. Shopify has a 99-theme limit.

---

#### Phase 4: Globals (Header + Footer)

6. **Pull header**: Check `.theme-forge/reports/sections/header.json`.
   - If it exists with `status: "completed"`: Skip.
   - Otherwise: Run `pull-header`. Commit changes:
     ```bash
     git add sections/ snippets/ assets/ config/ templates/ \
             .theme-forge/reports/sections/header.json \
             .theme-forge/learnings/ .theme-forge/mapping-rules.json
     git commit -m "pull: header — completed"
     git push
     ```

7. **Pull footer**: Check `.theme-forge/reports/sections/footer.json`.
   - If it exists with `status: "completed"`: Skip.
   - Otherwise: Run `pull-footer`. Commit changes:
     ```bash
     git add sections/ snippets/ assets/ config/ templates/ \
             .theme-forge/reports/sections/footer.json \
             .theme-forge/learnings/ .theme-forge/mapping-rules.json
     git commit -m "pull: footer — completed"
     git push
     ```

#### Phase 5: Template Migration

**Enumerate from the base theme, not the target.** The base theme (live site) has all the templates that need migrating. The target theme starts mostly empty. Use `.theme-forge/template-map.json` (from scan Step 4.5) as the source of truth.

8. **Migrate functional/redirect templates first**: These are simple copies that don't need section-by-section pulling.

   For each template classified as `functional`, `redirect`, or `app-artifact` in the template map:
   - Copy the `.liquid` template file from `.theme-forge/base-cache/templates/` to the target theme's `templates/`
   - Copy any referenced snippets from base-cache to target `snippets/`
   - Copy any referenced assets from base-cache to target `assets/`
   - Commit:
     ```bash
     git add templates/ snippets/ assets/
     git commit -m "migrate: functional templates and dependencies"
     git push -u origin $(git branch --show-current)
     ```

9. **Pull page templates in order**: For each template classified as `page` in the template map, ordered:
   1. `index` (homepage — highest traffic, best first test)
   2. `product` (product pages — revenue-critical)
   3. `collection` (collection pages — discovery path)
   4. `page` (generic pages)
   5. `cart`, `search`, `blog`, `article` 
   6. `404`, `password`, `gift_card`
   7. `customers/*` (account pages)

   For each, run `pull-page <template>`. The pull-page sub-skill handles:
   - Creating the `.json` template in the target theme if it doesn't exist
   - Scoped scan + map (if mappings don't exist for this page)
   - Section-by-section pull with compare→fix→verify loops
   - Per-section commits and pushes
   - Full-page comparison at the end
   - Page report written to `.theme-forge/reports/pages/`

   **Between pages, `git pull`** to pick up any changes from parallel sessions.

10. **Pull template alternates**: For each template classified as `alternate` in the template map (e.g., `page.about.json`, `product.featured.json`). These share most sections with their base template, so they're fast — mostly content/settings differences and a few unique sections.

#### Phase 6: Review + Report

11. **Run `review`** on each completed page to catch cross-section issues (inter-section spacing, color continuity, header/footer interaction).

12. **Final summary**: Print a migration status report:
    ```
    MIGRATION COMPLETE
    ==================
    Pages pulled:     8/8
    Sections pulled:  42/42
    Sections skipped: 0
    Sections failed:  0
    Cutover items:    3

    Run /theme-forge cutover for the full go-live checklist.
    ```

**Every section must go through `pull-section`** with its full compare→fix→verify loop. Do not skip the visual comparison. Do not mark sections complete without verification. Do not write section reports without actually running the pull-section workflow on that section.

**Resume after interruption:** Re-running `--full` checks existing artifacts at every step. Onboard is skipped if config exists. Scan is skipped if maps exist. Header/footer are skipped if their reports exist. Each page's sections are skipped if their reports exist. This means `--full` is idempotent — you can safely re-run it after a crash, context limit, or network interruption and it picks up where it left off.

### `--globals-only` Workflow

When `--globals-only` is passed, run Phases 1-4 of the `--full` workflow (project setup, base pull, global settings, dev server, header, footer), commit all results, then stop:

> "Globals, header, and footer are complete. You can now run `pull-page` for individual pages in parallel sessions:"
> ```
> /theme-forge pull-page index
> /theme-forge pull-page product
> /theme-forge pull-page collection
> ```

This is useful for CI pipelines or explicit first-step workflows. In most cases, `pull-page` handles globals automatically (see Git Coordination below).

### Configuration

All project state lives in `.theme-forge/` in the target theme's root. Most files are **committed to the repo** so parallel sessions share the same foundation.

```
.theme-forge/
├── config.json              # Project configuration (created by onboard) — COMMITTED
├── mapping-rules.json       # Global mapping registry (base X → target Y) — COMMITTED
├── conventions.json         # Global standards (CSS-first, prefix, thresholds) — COMMITTED
├── learnings/               # Per-section learning files (one per section, merge-friendly) — COMMITTED
├── site-inventory.json      # Full site inventory (created by scan) — COMMITTED (optional)
├── settings-map.json        # Global settings cross-reference base→target (created by scan) — COMMITTED
├── class-map.json           # CSS class/property/component cross-reference (created by scan) — COMMITTED
├── app-embeds.json          # App embeds inventory and migration status (created by scan) — COMMITTED
├── template-map.json        # Every base template classified with dependency cascade (created by scan) — COMMITTED
├── plan.json                # Migration plan (created by scan) — COMMITTED (optional)
├── base-cache/              # Targeted base theme pull (templates, config, sections, snippets, blocks, layout, CSS/JS) — GITIGNORED
├── mappings/
│   ├── sections/            # Per-section compatibility reports — COMMITTED
│   │   ├── header.json
│   │   ├── footer.json
│   │   └── ...
│   └── pages/               # Per-page mapping summaries — COMMITTED
│       ├── index.json
│       ├── product.json
│       └── ...
├── reports/
│   ├── sections/            # Per-section pull reports — COMMITTED on completion
│   │   ├── header.json
│   │   └── ...
│   └── pages/               # Per-page pull reports — COMMITTED on completion
│       └── ...
├── references/              # Live site reference screenshots (all breakpoints) — COMMITTED
│   ├── hero-index/
│   │   ├── desktop.png
│   │   ├── tablet.png
│   │   ├── mobile.png
│   │   └── meta.json
│   └── ...
├── cutover.json             # Items requiring manual action during production go-live
└── debug/                   # Debug artifacts — GITIGNORED
```

**`.gitignore` for theme-forge projects:**
```
.theme-forge/base-cache/
.theme-forge/debug/
.theme-forge/tmp/
.theme-forge/references/
.playwright-mcp/
.gstack/
/*.png
```

Everything else in `.theme-forge/` is committed. This is how parallel sessions share mappings, learnings, and see each other's completed work. The `/*.png` catch-all prevents screenshot artifacts from being committed (the agent sometimes saves them to the repo root instead of `.theme-forge/` subdirectories).

### Git Coordination (Parallel Sessions)

Multiple sessions can work on different pages simultaneously. **Git is the coordination layer.** No locks. No state files. No coordination protocol.

**How it works:**

1. **Committed config = onboarding done.** A session reads `.theme-forge/config.json` from the repo. If it exists, the project is onboarded. No setup commands needed.

2. **Committed reports = section done.** A section is complete when its report exists at `.theme-forge/reports/sections/{name}.json` with `status: "completed"`. Before pulling a section, check if its report is already committed. If so, skip it.

3. **Committed mappings = scan done for that page.** Before pulling a page, check `.theme-forge/mappings/pages/{page}.json`. If it exists, the page has been scanned and mapped. If not, run a scoped scan for just that page.

4. **Committed header/footer reports = globals done.** Before pulling page sections, check if `.theme-forge/reports/sections/header.json` and `footer.json` exist with completed status. If not, ask: "Globals not done yet. Run them now?"

**Session lifecycle:**

```
1. git pull                          # Get latest state from repo
2. Read config.json                  # Onboarded? ✓
3. Targeted base pull                # Fresh templates + settings (~5 sec)
4. Read mapping-rules.json           # Apply global mapping conventions
5. Read learnings/*.json              # Apply accumulated patterns
6. Check reports/sections/header.json # Globals done? If not, ask.
7. Scoped scan + map for this page   # Only if mappings don't exist
8. Pull sections one by one          # Skip if report exists
9. After each section:
   - Commit code changes + report + any new learnings/mapping rules
   - git push
10. Final page comparison + page report
11. Commit + push
```

**Resume after crash:** If a session crashes, it never committed the in-progress section's report. Re-running `pull-page` sees no report for that section and re-attempts it. No staleness detection needed. No locks to go stale.

**Duplicate work prevention:** Two sessions assigned to the same page will both start pulling. Before each section, they `git pull` and check for a committed report. The second session to finish a section sees the first session already committed a report and skips. At most one section gets duplicated.

### Targeted Base Pull

Sessions do NOT need a full base theme export. The agent needs templates, config, sections, snippets, blocks, and layout from the live theme for mapping, code analysis, and comparison.

**The base-cache directory must be a git repo** (Shopify CLI requires it):

```bash
mkdir -p .theme-forge/base-cache && git -C .theme-forge/base-cache init 2>/dev/null
shopify theme pull --theme <live_theme_id> \
  --only 'templates/*' --only 'config/*' \
  --only 'sections/*' --only 'snippets/*' \
  --only 'blocks/*' --only 'layout/*' \
  --only 'assets/*.css' --only 'assets/*.js' \
  --path .theme-forge/base-cache/
```

**Why all these directories:**
- `templates/*` + `config/*` — section composition and configured values
- `sections/*` — base section Liquid code, schemas, CSS, HTML structure. **Without these, the agent cannot see how the base theme implements forms, JS handlers, conditional logic, or custom blocks.**
- `snippets/*` — shared components the sections reference (form handlers, tracking scripts, utility includes)
- `blocks/*` — block type definitions and schemas
- `layout/*` — theme layout structure, global includes, script/style references
- `assets/*.css` + `assets/*.js` — stylesheets and JavaScript (needed to understand form handlers, AJAX patterns, tracking code). Excludes images and fonts to keep the pull fast.

**Note on `--only` patterns:** Use quoted globs (`'templates/*'`), not directory paths (`templates/`). The Shopify CLI `--only` flag uses glob matching, not directory filtering.

**Legacy themes (liquid-only templates):** If the base theme uses `.liquid` templates instead of `.json` templates, the pull will still work — but section composition lives in `config/settings_data.json` under the `current` key, not in template JSON files. See "Legacy Theme Support" in the scan skill.

This takes ~10-15 seconds and is always fresh. Each session runs it independently. The results are gitignored (session-local).

### Scoped Scan

Instead of scanning the entire site before any work, sessions scan only the page they need:

1. Read `templates/{page}.json` from the target theme
2. Read `templates/{page}.json` from `.theme-forge/base-cache/`
3. Cross-reference sections, apply `mapping-rules.json`
4. Write `mappings/pages/{page}.json` and `mappings/sections/*.json`
5. Commit the mappings

The full `scan` command still exists for when you want a complete inventory, but it's not a prerequisite.

### Mapping Rules (`mapping-rules.json`)

Global registry of base→target section mappings. Ensures all sessions use the same mappings for the same section types.

```json
{
  "rules": [
    {
      "base_type": "slideshow",
      "target_type": "hero-banner",
      "notes": "Use hero-banner for all carousel/slideshow sections"
    },
    {
      "base_type": "testimonials",
      "target_type": "custom-testimonial-carousel",
      "notes": "Custom section, no direct equivalent in target theme"
    }
  ],
  "updated_at": "2026-04-10T12:00:00Z"
}
```

**Workflow:**
- During scoped scan, the agent checks mapping-rules.json first. Known mappings are applied instantly.
- When a new section type is encountered with no rule, the agent creates a mapping and adds a rule.
- New rules are committed so other sessions benefit.

### Conventions (`conventions.json`)

Global standards that all sessions follow:

```json
{
  "css_first": true,
  "extension_prefix": "custom-",
  "never_modify_core_files": true,
  "max_retry_attempts": 3,
  "accepted_variance_threshold_px": 1,
  "commit_after_each_section": true
}
```

Created during onboard. Committed to repo.

### Resume Protocol

Resume is report-based. No state machine.

When `pull-page` starts:

1. `git pull` to get latest committed state
2. Read `.theme-forge/reports/sections/*.json` for this page's sections
3. Skip sections with a report where `status` is `completed` or `completed_code_only`
4. Skip sections with `status: "skipped"`
5. Skip sections with `status: "failed"` (use `--retry-failed` to delete failed reports first)
6. Pull all remaining sections (no report = not started)

Kill a run and restart it. It picks up where it left off.

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
4. **Git-native coordination**: The repo is the single source of truth. Committed reports = done. Committed mappings = scanned. No locks, no state machine. Parallel sessions coordinate through git commits.
5. **Zero-ceremony sessions**: A new session reads config.json, pulls fresh base data (~5 sec), and starts working. No setup commands, no prerequisites beyond onboard.
6. **Composable**: Each command works independently. `scan` composes them into a pipeline, but you can `map-section` one section without a full migration.

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
