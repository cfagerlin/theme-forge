---
name: pull-header
description: >
  Pull the site header section. Convenience wrapper around pull-section for the most common shared section.
  - MANDATORY TRIGGERS: theme-forge pull-header, pull header, match header, fix header
---

# pull-header — Pull Site Header

Convenience command that runs `pull-section` on the site header. The header is a shared section (appears on every page via the header section group), so it's typically one of the first sections to pull.

## Workflow

1. Read `.theme-forge/config.json`
2. **Start Dev Server** (if not already running):
   ```bash
   # Check if a dev server is already running for this theme
   curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9292 2>/dev/null
   ```
   - If no dev server responds, start one:
     ```bash
     cd <target_theme_path>
     shopify theme dev --store <dev_store> --theme <target_theme_id> --port 9292 --path . &
     ```
   - Wait for the dev server to print its preview URL before proceeding.
   - **Without a dev server, pull-section falls back to code-only mode (no visual verification).** This defeats the purpose of theme-forge. Do NOT proceed without a running dev server unless the user explicitly chooses code-only mode.
3. Identify the header section:
   - Check `.theme-forge/base-cache/sections/header-group.json` (or `{base_theme}/sections/header-group.json`) for the header section reference
   - Or look for `sections/header.liquid` (most common name)
   - Common names: `header`, `header-group`, `site-header`, `main-header`
4. Run `pull-section` on the identified header section with `--css-file assets/custom-migration-global.css`
5. **After completion, commit and push:**
   ```bash
   git add .theme-forge/reports/sections/header.json \
           .theme-forge/learnings.json \
           sections/ assets/ snippets/ config/
   git commit -m "pull: header — completed"
   git push
   ```
6. **Additional header-specific checks:**
   - Sticky/fixed behavior (scroll states)
   - Mobile menu / hamburger behavior
   - Search overlay
   - Cart icon with count badge
   - Logo sizing and positioning
   - Navigation dropdown/mega-menu structure
   - Announcement bar (if part of header group)
   - Transparency/overlay mode on specific pages

## Header Gotchas

- **Scroll states**: Many headers change appearance on scroll (background opacity, shadow, height reduction). These are often JS-driven and need custom implementation.
- **Mobile breakpoint**: The mobile menu trigger breakpoint may differ between themes.
- **Logo dimensions**: Live site logo may have specific pixel dimensions that don't match the target theme's logo container.
- **Navigation depth**: If the live site has a mega-menu but the target theme only supports 2-level dropdowns, this is an `incompatible` feature that needs custom work.
