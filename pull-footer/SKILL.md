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
2. **Start Dev Server** — find and run the dev-server script:
   ```bash
   # Find the script (project-local or global install)
   DS="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/dev-server.sh"
   [ -x "$DS" ] || DS="$HOME/.claude/skills/theme-forge/scripts/dev-server.sh"
   eval "$("$DS" start --path .)"
   ```
   **If the script fails, STOP. Do not continue without a running dev server.**
   Present the `DEV_PREVIEW_URL` and `DEV_EDITOR_URL` to the user.
   - **Without a dev server, pull-section falls back to code-only mode (no visual verification).** This defeats the purpose of theme-forge. Do NOT proceed without a running dev server unless the user explicitly chooses code-only mode.
3. Identify the footer section:
   - Check `.theme-forge/base-cache/sections/footer-group.json` (or `{base_theme}/sections/footer-group.json`) for the footer section reference
   - Or look for `sections/footer.liquid`
   - Common names: `footer`, `footer-group`, `site-footer`
   - Note: footer groups often contain multiple sections (e.g., trust bar, newsletter signup, footer links, sub-footer)
4. For footer **groups** with multiple sections, run `pull-section` on each section in the group, in order. Pass `--css-file assets/custom-migration-global.css`.
5. **After completion, commit and push:**
   ```bash
   git add .theme-forge/reports/sections/footer.json \
           .theme-forge/learnings/ \
           sections/ assets/ snippets/ config/
   git commit -m "pull: footer — completed"
   git push -u origin $(git branch --show-current)
   ```
6. **⛔ MERGE POINT after both header + footer are done.** These shared sections appear on every page. Create a PR:
   ```bash
   gh pr create --title "pull: header + footer" \
     --body "Header and footer sections pulled. Must be on main before page pulls begin — these appear on every page."
   ```
   Tell the user:
   > **PR created. Please review and merge to main** before starting page pulls. Every page branch needs header/footer as its baseline. After merge, each page can run in its own branch off main.
7. **Additional footer-specific checks:**
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
- **Third-party email signup forms (Klaviyo, Mailchimp, etc.)**: The footer is the most common place for these. Three things must all be right:
  1. **Form HTML**: Correct `action` URL, hidden fields (list ID, source), and input names in a `custom-liquid` block. Never use the target theme's native `email-signup` block.
  2. **Form JavaScript**: The form likely uses AJAX submission (e.g., `data-ajax-submit` on Klaviyo forms). Without JS, the form does a page redirect instead of showing an inline success message. Port the base theme's form JS, or add an inline `<script>` fallback in the custom-liquid block. See pull-section gotcha "Third-Party Form Integrations" for the fallback pattern.
  3. **App embed**: If the base theme has a Shopify app embed (e.g., `klaviyo-onsite-embed` in `settings_data.json` global blocks), preserve it. But note: app embeds only load if the app is **installed on the dev store**. The form HTML/JS should work independently of the app embed. The app embed handles popups, tracking, and onsite features, not the footer form itself.
- **Test the form**: After pulling the footer, actually test the email form on the dev site. Enter a test email, click submit. Verify the success message appears (not a page redirect or blank response). If the form doesn't work, check: is the JS loaded? Is the AJAX URL correct? Is CORS blocking the request?
