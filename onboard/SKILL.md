---
name: onboard
description: >
  Configure a Shopify theme migration project. Collects live site URL, base theme path, target theme path, detects capabilities, and writes .theme-forge/config.json.
  - MANDATORY TRIGGERS: theme-forge onboard, onboard theme, configure migration, setup theme-forge
---

# onboard — Configure Migration Project

Set up a Shopify theme migration project by collecting configuration and detecting capabilities.

## Workflow

### Step 1: Collect Project Info

**Ask one question at a time.** Do not dump all questions at once. Wait for each answer before asking the next. Try to infer values from CLAUDE.md or project files before asking.

Note: A full base theme export is NOT needed. Sessions pull templates, config, sections, snippets, blocks, layout, and code assets from the live theme on demand (~10-15 seconds). See Targeted Base Pull in the orchestrator SKILL.md.

**Step 1a: Dev store domain**

This is the only required input. Everything else can be derived from it.

First, check for any existing project config (CLAUDE.md, package.json, etc.) that might contain a `.myshopify.com` domain. If found, confirm it:

> I found `my-store.myshopify.com` in your project config. Is this the dev store for this migration?
> A) Yes, use that
> B) No, I'll provide a different domain

If not found, ask:

> What's your Shopify dev store domain? (e.g., `my-store.myshopify.com`)

**Step 1b: Resolve the live site URL**

The live (production) storefront URL can be resolved from the dev store domain. Use Shopify CLI:

```bash
shopify theme list --store <dev_store>
```

This authenticates and connects to the store. Once connected, resolve the primary domain:

```bash
# The store's primary domain is the live URL
# Check if the store has a custom domain by visiting the myshopify.com URL
# and following the redirect
curl -sI "https://<store>.myshopify.com" | grep -i "^location:"
```

If a custom domain redirect is found (e.g., `https://example.com`), use that as `live_url`. If no redirect (stays on `.myshopify.com`), use `https://<store>.myshopify.com`.

Confirm with the user:

> Your live storefront appears to be `https://example.com`. Is that correct?
> A) Yes
> B) No, the live URL is different (tell me)

**Step 1c: Extension prefix**

> What namespace prefix should I use for custom files? This keeps your migration files separate from the theme's core files.
> A) `custom-` (recommended)
> B) Something else (tell me what prefix)

### Step 1.5: Set Up Git Repository

The target theme must be in a git repo with a remote on GitHub (or similar). This is how parallel sessions coordinate and how work is persisted. Walk the user through this:

**Check current state:**
```bash
git remote -v
```

**If no remote exists**, or the remote is the upstream theme vendor (e.g., `Shopify/horizon`):

Ask the user:

> "theme-forge uses git as its coordination layer. Your work needs to live in a GitHub repo you control. This keeps your migration state safe and enables parallel sessions.
>
> Your target theme is currently [describe: no remote / pointing at upstream vendor repo].
>
> A) **Create a new private repo** — I'll create `{user}/{suggested-name}` on GitHub and set it as origin. The upstream theme stays as a separate remote for pulling updates. Your customizations and client data stay private.
>
> B) **Use an existing repo** — Tell me the repo URL and I'll set it up.
>
> C) **Skip for now** — Work locally without pushing. You can set up the remote later, but parallel sessions won't work until you do."

**If the user chooses A:**
```bash
# Create private repo
gh repo create {repo-name} --private --source=. --push

# If the current origin is the theme vendor, keep it as upstream
git remote rename origin upstream  # only if origin was vendor
git remote add origin https://github.com/{user}/{repo-name}.git
```

**If the theme was cloned from a vendor (e.g., Shopify/horizon):**
Explain the upgradability model:

> "I've set up two remotes:
> - `origin` → your private repo (where you push your work)
> - `upstream` → the theme vendor (where you pull theme updates)
>
> Your custom sections (`custom-*.liquid`) and migration CSS never touch the vendor's core files. When the vendor releases an update, you run `git fetch upstream && git merge upstream/main`. Conflicts are rare because your changes are in separate files (the extension layer)."

**Why private:** Migration state in `.theme-forge/` contains the client's store URL, theme IDs, and potentially proprietary section configurations. This should not be public.

### Step 2: Detect Target Theme Type

Examine the target theme to determine its type:

1. Read `config/settings_schema.json` — look for theme name/version
2. Check for known theme signatures:
   - **Horizon**: `assets/component.js` with `Component` base class, Declarative Shadow DOM
   - **Dawn**: `assets/base.css`, `assets/component-*.js` pattern
   - **Custom**: No standard theme markers
3. Store as `target_type` in config

### Step 3: Detect Capabilities

Check which tools are available in the current environment:

```
capabilities:
  browse        — Can we take screenshots and inspect computed styles on live/dev sites?
  browse_method — Which browse tool to use (playwright_cli, gstack_browse)
  shopify_cli   — Is `shopify` CLI available for `theme dev`?
```

**Detection method (check in this order, use the first one found):**

1. **Playwright CLI** (preferred): Check if the `screenshot.sh` script is available and `@playwright/cli` is installed:

   ```bash
   # Check for screenshot.sh script
   SS="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/screenshot.sh"
   [ -x "$SS" ] || SS="$HOME/.claude/skills/theme-forge/scripts/screenshot.sh"
   # Check for playwright-cli
   npx --no-install playwright-cli --version 2>/dev/null || npx @playwright/cli --version 2>/dev/null
   ```

   If both found → set `browse: true`, `browse_method: "playwright_cli"`

2. **GStack browse binary**: Check if the executable exists at either:
   - `~/.claude/skills/gstack/browse/dist/browse`
   - `{project_root}/.claude/skills/gstack/browse/dist/browse`

   Test with: `~/.claude/skills/gstack/browse/dist/browse url 2>/dev/null`

   If found → set `browse: true`, `browse_method: "gstack_browse"`

3. **Shopify CLI**: Run `which shopify` or `shopify version` in bash

**If no browse tools are detected**, prompt the user to install Playwright CLI:

> Visual comparison is the core of theme-forge. Without a browser tool, pull-section
> falls back to code-only analysis (no screenshots, no computed style diffs). This
> works but misses visual issues that only show up in the rendered page.
>
> To enable visual comparison, install Playwright CLI:
>
> ```
> npm install -g @playwright/cli@latest
> ```
>
> Then re-run `/theme-forge onboard`
>
> Do you want to:
> A) Install Playwright CLI now (I'll run the command for you)
> B) Continue without visual comparison (code-only analysis)

If the user chooses A, run `npm install -g @playwright/cli@latest` and re-run the detection step. If they choose B, set `browse: false` and continue. Note in the summary output that visual comparison is disabled and can be enabled later by installing Playwright CLI and re-running onboard.

### Step 3.5: Detect Store Themes (if Shopify CLI available)

If Shopify CLI is available and a dev store is configured, list the store's themes to identify the target theme ID and validate the setup:

```bash
shopify theme list --store <dev_store>
```

This authenticates via browser OAuth (Shopify CLI 3.x has no separate `auth login` command). The output shows theme name, role (live/unpublished), and ID.

Use this to:
1. Confirm the target theme exists on the store
2. Capture the theme ID for `theme pull` and `theme dev` commands
3. Identify the live theme (this is the base theme to export if not already downloaded)

Store the target theme ID in config as `target_theme_id`.

### Step 3.6: Record Live Theme ID

If Shopify CLI is available, record the live theme's ID from `shopify theme list` output (the theme with `role: "live"`). Store as `live_theme_id` in config. This is used by the targeted base pull to fetch fresh code, settings, and templates on demand.

Note: A full base theme export is no longer needed. Sessions pull templates, config, sections, snippets, blocks, layout, and code assets (~10-15 seconds) into the gitignored `.theme-forge/base-cache/` directory.

### Step 4: Start Dev Server

If Shopify CLI is available (`shopify_cli: true` in capabilities):

```bash
# Find the script (project-local or global install)
DS="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/dev-server.sh"
[ -x "$DS" ] || DS="$HOME/.claude/skills/theme-forge/scripts/dev-server.sh"
eval "$("$DS" start --path .)"
```

**If the script fails (non-zero exit or `DEV_STATUS=error`): STOP.** Do not continue onboarding without a running dev server.

The script handles everything: safety checks (blocks live themes), parallel session detection, port discovery, unpublished theme creation if needed, and URL capture. Present `DEV_PREVIEW_URL` and `DEV_EDITOR_URL` to the user.

If Shopify CLI is not available (`shopify_cli: false`), set `dev_url: null` and tell the user:

> No Shopify CLI available. Start a dev server manually in a separate terminal:
> ```
> cd <absolute_path_to_target_theme>
> shopify theme dev --store <dev_store> --theme <target_theme_id> --port <port>
> ```
> Then re-run onboard to detect it.

### Step 5: Write Config

Create `.theme-forge/config.json` in the target theme root:

```json
{
  "version": "0.19.0",
  "live_url": "https://example.com",
  "target_theme": ".",
  "target_type": "horizon",
  "target_theme_id": 147980124204,
  "dev_store": "store.myshopify.com",
  "extension_prefix": "custom-",
  "live_theme_id": 131911450755,
  "same_shopify_store": true,
  "cases_commit_default": true,
  "capabilities": {
    "browse": true,
    "browse_method": "playwright_cli",
    "shopify_cli": true
  },
  "auto_upgrade": false,
  "dev_port": 9293,
  "dev_theme_id": 147980124204,
  "dev_theme_created": false,
  "dev_url": "http://127.0.0.1:9293",
  "dev_preview_url": "http://127.0.0.1:9293",
  "dev_editor_url": "https://store.myshopify.com/admin/themes/147980124204/editor"
}
```

The `dev_*` fields are set by `scripts/dev-server.sh` (Step 4):
- `dev_port` — the port this session's server runs on
- `dev_theme_id` — the Shopify theme ID this session syncs to (may differ from `target_theme_id` for parallel sessions)
- `dev_theme_created` — `true` if this session created an unpublished theme (must be deleted on completion)
- `dev_url`, `dev_preview_url`, `dev_editor_url` — URLs for the user to interact with the dev theme

Each worktree has its own config, so parallel sessions don't conflict.

`same_shopify_store` defaults to `true` and should stay true for almost every project. It tells image-handling code that the live site and dev theme live on the same Shopify store, so any image URL visible on the live page (Shopify CDN URL, `shopify://shop_images/...` reference, hardcoded Liquid path) can be reused as-is in the target theme — no re-upload, no manual admin step. Set to `false` only when migrating to a different Shopify store entirely (rare). Existing projects without the flag default to `true` retroactively on next session.

`cases_commit_default` defaults to `true`. When true, `intake-cases` commits the `.theme-forge/cases/<page>.json` it writes (so parallel sessions share the same case definitions). Set to `false` for projects where case files contain client-confidential URLs that shouldn't ship to the repo — intake-cases will write the file locally and print a reminder to commit manually. Existing projects without the flag default to `true` retroactively.

Note: `base_theme` path is no longer stored. Sessions use targeted base pull (`.theme-forge/base-cache/`) which pulls sections, snippets, blocks, layout, and code assets alongside templates and config.

### Step 5.5: Write Global Standards

Create `.theme-forge/mapping-rules.json`:

```json
{
  "rules": [],
  "updated_at": "<current ISO timestamp>"
}
```

Create `.theme-forge/conventions.json`:

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

Create `.theme-forge/learnings/` directory and seed it with universal learnings:

```bash
mkdir -p .theme-forge/learnings
```

Create `.theme-forge/learnings/_seeds.json` with the universal seed learnings (see `pull-section/references/learnings.md` § Seeding Learnings for the full content).

### Step 6: Verify Setup

1. Confirm the target theme path exists and contains Shopify theme files (`config/`, `sections/`, `templates/`)
2. If a browse tool is available, verify the live URL is reachable
3. Create `.theme-forge/mappings/sections/`, `.theme-forge/mappings/pages/`, `.theme-forge/reports/sections/`, `.theme-forge/reports/pages/`, `.theme-forge/references/`, `.theme-forge/tmp/`, `.theme-forge/cases/` directories

   `.theme-forge/cases/` is the multi-case workflow home (one JSON per template, plus `_shared.json` for header/footer/cart-drawer cases). Empty at onboard. Populated by `/theme-forge intake-cases <template> --from <artifact>` when a template has multiple archetypes (e.g., `product` renders 10+ different layouts depending on tags or product type). Committed by default (see `cases_commit_default` in config).
4. **Check `.gitignore`**: Add session-specific and tool-generated paths to `.gitignore`:
   ```
   .theme-forge/base-cache/
   .theme-forge/debug/
   .theme-forge/tmp/
   .theme-forge/references/
   .playwright-cli/
   .playwright-mcp/
   .gstack/
   /*.png
   ```
   Do NOT gitignore all of `.theme-forge/`. Config, mappings, reports, learnings, and mapping rules must be committed so parallel sessions share them.

   Why each entry:
   - `base-cache/` — pulled from live theme per session, large binary assets
   - `debug/` — transcripts and screenshots from debug runs
   - `tmp/` — temporary capture output
   - `references/` — live site reference screenshots (large, session-specific)
   - `.playwright-cli/` — Playwright CLI snapshots and console logs (auto-generated)
   - `.playwright-mcp/` — Playwright MCP session files (legacy, if still present)
   - `.gstack/` — gstack working files
   - `*.png` — screenshot artifacts from capture/comparison. All screenshots should go in `.theme-forge/` subdirectories, but the agent sometimes saves them to the repo root. This catch-all prevents accidental commits.
5. Print a summary of the configuration

### Step 7: Commit + Merge to Main

Commit the onboarding artifacts:

```bash
git add .theme-forge/config.json \
        .theme-forge/mapping-rules.json \
        .theme-forge/conventions.json \
        .theme-forge/learnings/ \
        .gitignore
git commit -m "theme-forge: onboard project"
git push
```

**⛔ MERGE POINT: Create a PR and merge to main before proceeding.** The base theme import + onboard config is the foundation every future branch starts from. Without this on main, parallel sessions have no shared baseline.

Create a PR:
```bash
gh pr create --title "theme-forge: onboard project" \
  --body "Base theme import + migration config. Must be on main before scan/pull work begins."
```

Tell the user:

> **PR created. Please review and merge to main** before continuing. The base theme + config must be on main so future work (scan, header, pages) branches from a correct starting point.

Wait for the user to confirm the merge. After merge, create a new branch for the next phase:
```bash
git checkout main && git pull && git checkout -b theme-forge/scan
```

### Step 8: Suggest Next Step

Tell the user:
- Run `/theme-forge scan` to inventory the full site and apply global settings
- Or run `/theme-forge pull-page index` to start pulling the homepage (scan + map happens automatically)
- Or run `/theme-forge pull-section <name>` to start pulling immediately (will auto-map first)

**If the theme has templates with multiple archetypes** (single template renders N different layouts depending on tags/metafields/product type — e.g., a jewelry store's `product` template renders 10+ layouts based on personalizer vs ready-to-ship vs gift-card tags):

- Run `/theme-forge intake-cases <template> --from <screenshot-or-csv>` to define the archetype matrix
- Then use `--cases` on refine-page / verify-page / find-variances to iterate the full matrix in one command instead of 27+ manual config edits

Also mention the publish-safety guardrail:
- All `shopify theme push` / `shopify theme delete` calls in theme-forge route through `scripts/shopify-safe.sh`, which queries the currently-live theme at execution time and refuses any operation that would overwrite or delete it. Refuses `shopify theme publish` outright. This is a deterministic shell-level check (cross-platform, agent-independent) — even if a future skill or agent slips, the wrapper still blocks. The user can also alias `shopify=$(pwd)/scripts/shopify-safe.sh` in their shell for raw-terminal coverage (optional, opt-in).

## Output

- `.theme-forge/config.json` — Project configuration file (committed)
- `.theme-forge/mapping-rules.json` — Global mapping registry (committed)
- `.theme-forge/conventions.json` — Global standards (committed)
- `.theme-forge/learnings.json` — Empty learnings file (committed)
- `.theme-forge/` directory structure created
- Summary printed to conversation
