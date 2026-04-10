---
name: pull-footer
description: >
  Pull the site footer section. Convenience wrapper around pull-section for the footer shared section.
  - MANDATORY TRIGGERS: theme-forge pull-footer, pull footer, match footer, fix footer
---

# pull-footer — Pull Site Footer

Convenience command that runs `pull-section` on the site footer. The footer is a shared section (appears on every page via the footer section group).

## Workflow

1. Read `.theme-forge/config.json`
2. Identify the footer section:
   - Check `.theme-forge/base-cache/sections/footer-group.json` (or `{base_theme}/sections/footer-group.json`) for the footer section reference
   - Or look for `sections/footer.liquid`
   - Common names: `footer`, `footer-group`, `site-footer`
   - Note: footer groups often contain multiple sections (e.g., trust bar, newsletter signup, footer links, sub-footer)
3. For footer **groups** with multiple sections, run `pull-section` on each section in the group, in order. Pass `--css-file assets/custom-migration-global.css`.
4. **After completion, commit and push:**
   ```bash
   git add .theme-forge/reports/sections/footer.json \
           .theme-forge/learnings.json \
           sections/ assets/ snippets/ config/
   git commit -m "pull: footer — completed"
   git push
   ```
5. **Additional footer-specific checks:**
   - Multi-column link layout
   - Newsletter signup form
   - Social media icons
   - Payment icons
   - Copyright text and legal links
   - Two-tone / split background colors
   - Trust bar or pre-footer sections
   - Mobile stacking behavior

## Footer Gotchas

- **Footer groups vs single footer**: Some themes use a single footer section; others use a footer group with 3-5 sub-sections. Map the structure, not just the name.
- **Two-tone backgrounds**: If the live footer uses two different background colors (e.g., dark top, darker bottom), this may need custom CSS since most target themes have a single footer background.
- **Payment icons**: These are often controlled by Shopify's payment settings, not theme code. Verify they appear automatically.
