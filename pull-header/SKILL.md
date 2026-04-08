---
name: pull-header
description: >
  Pull the site header section. Convenience wrapper around pull-section for the most common shared section.
  - MANDATORY TRIGGERS: theme-pull pull-header, pull header, match header, fix header
---

# pull-header — Pull Site Header

Convenience command that runs `pull-section` on the site header. The header is a shared section (appears on every page via the header section group), so it's typically one of the first sections to pull.

## Workflow

1. Read `.theme-pull/config.json`
2. Identify the header section:
   - Check `{base_theme}/sections/header-group.json` for the header section reference
   - Or look for `sections/header.liquid` (most common name)
   - Common names: `header`, `header-group`, `site-header`, `main-header`
3. Run `pull-section` on the identified header section
4. **Additional header-specific checks:**
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
