---
name: onboard
description: >
  Configure a Shopify theme migration project. Collects live site URL, base theme path, target theme path, detects capabilities, and writes .theme-pull/config.json.
  - MANDATORY TRIGGERS: theme-pull onboard, onboard theme, configure migration, setup theme-pull
---

# onboard — Configure Migration Project

Set up a Shopify theme migration project by collecting configuration and detecting capabilities.

## Workflow

### Step 1: Collect Project Info

Ask the user for (or detect from context):

1. **Live site URL** — The production storefront to match (e.g., `https://gldn.com`)
2. **Base theme path** — Path to the exported live theme files (read-only reference)
3. **Target theme path** — Path to the theme being built (this is where changes go)
4. **Dev store** — Shopify dev store domain (e.g., `store.myshopify.com`) — optional
5. **Extension prefix** — Namespace for custom files (default: `custom-`)

If a CLAUDE.md or project instructions file exists in the target theme, try to infer these values before asking.

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
  browse_method — Which browse tool to use (gstack_browse, playwright_mcp, mcp_chrome)
  computer_use  — Can we use computer-use tools for screenshots and interaction?
  shopify_cli   — Is `shopify` CLI available for `theme dev`?
```

**Detection method (check in this order, use the first one found):**

1. **GStack browse binary**: Check if the executable exists at either:
   - `~/.claude/skills/gstack/browse/dist/browse`
   - `{project_root}/.claude/skills/gstack/browse/dist/browse`

   Test with: `~/.claude/skills/gstack/browse/dist/browse url 2>/dev/null`

   If found → set `browse: true`, `browse_method: "gstack_browse"`

2. **Playwright MCP**: Check if `mcp__playwright__*` tools are available in the tool list.

   If found → set `browse: true`, `browse_method: "playwright_mcp"`

3. **Other MCP browse tools**: Check for `mcp__browser__*`, `mcp__browse__*`, or `mcp__Claude_in_Chrome__*` tool prefixes.

   If found → set `browse: true`, `browse_method: "mcp_chrome"`

4. **Computer use**: Check if `mcp__computer-use__*` tools are available
5. **Shopify CLI**: Run `which shopify` or `shopify version` in bash

**If no browse tools are detected**, prompt the user to install one:

> Visual comparison is the core of theme-pull. Without a browser tool, pull-section
> falls back to code-only analysis (no screenshots, no computed style diffs). This
> works but misses visual issues that only show up in the rendered page.
>
> To enable visual comparison, install one of these:
>
> 1. **Playwright MCP** (recommended, works everywhere):
>    ```
>    claude mcp add playwright -- npx @playwright/mcp --headless
>    ```
>    Then restart Claude Code and re-run `/theme-pull onboard`
>
> 2. **GStack browse tool** (if you have gstack installed):
>    - The browse binary is included with gstack
>    - theme-pull will detect it automatically at `~/.claude/skills/gstack/browse/dist/browse`
>
> Do you want to:
> A) Install Playwright MCP now (I'll run the command for you)
> B) Continue without visual comparison (code-only analysis)

If the user chooses A, run `claude mcp add playwright -- npx @playwright/mcp --headless` and tell them to restart Claude Code and re-run onboard. If they choose B, set `browse: false` and continue. Note in the summary output that visual comparison is disabled and can be enabled later by installing a browse tool and re-running onboard.

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

### Step 4: Detect Dev URL

If Shopify CLI is available and a dev store is configured:

1. Check if `shopify theme dev` is already running (look for a process or recent port)
2. If running, capture the dev URL (typically `http://127.0.0.1:9292`)
3. If not running, note it as unavailable — the user can start it later

### Step 5: Write Config

Create `.theme-pull/config.json` in the target theme root:

```json
{
  "version": "0.4.2",
  "live_url": "https://example.com",
  "base_theme": "../path-to-exported-theme",
  "target_theme": ".",
  "target_type": "horizon",
  "target_theme_id": 147980124204,
  "dev_store": "store.myshopify.com",
  "dev_url": "http://127.0.0.1:9292",
  "extension_prefix": "custom-",
  "capabilities": {
    "browse": true,
    "browse_method": "gstack_browse",
    "computer_use": true,
    "shopify_cli": true
  },
  "auto_upgrade": false
}
```

### Step 6: Verify Setup

1. Confirm the base theme path exists and contains Shopify theme files (`config/`, `sections/`, `templates/`)
2. Confirm the target theme path exists and contains Shopify theme files
3. If a browse tool is available, verify the live URL is reachable
4. Create `.theme-pull/mappings/sections/`, `.theme-pull/mappings/pages/`, `.theme-pull/reports/sections/`, `.theme-pull/reports/pages/` directories
5. **Check `.gitignore`**: If `.theme-pull/` is not in the target theme's `.gitignore`, add it. The state directory contains session-specific data that should not be committed.
6. Print a summary of the configuration

### Step 7: Suggest Next Step

Tell the user:
- Run `/theme-pull scan` to inventory the site and create a migration plan
- Or run `/theme-pull map-section <name>` to assess a specific section
- Or run `/theme-pull pull-section <name>` to start pulling immediately (will auto-map first)

## Output

- `.theme-pull/config.json` — Project configuration file
- `.theme-pull/` directory structure created
- Summary printed to conversation
