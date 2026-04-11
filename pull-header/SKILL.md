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
5. **After visual matching, build out navigation structure** (see "Mega Menu Build-Out" below)
6. **After navigation, configure search** (see "Search Provider Migration" below)
7. **After completion, commit and push:**
   ```bash
   git add .theme-forge/reports/sections/header.json \
           .theme-forge/learnings/ \
           sections/ assets/ snippets/ config/
   git commit -m "pull: header — completed"
   git push
   ```
8. **Additional header-specific checks:**
   - Sticky/fixed behavior (scroll states)
   - Mobile menu / hamburger behavior
   - Cart icon with count badge
   - Logo sizing and positioning
   - Announcement bar (if part of header group)
   - Transparency/overlay mode on specific pages

## Mega Menu Build-Out

If the live site uses mega menus (multi-column dropdowns with featured products, collections, or images), replicate the structure in the target theme. **Do not simplify the navigation.** The mega menu is a key part of the site's UX and often the merchant's primary navigation design.

### Detection

1. **Check the base theme's header section**: Read `.theme-forge/base-cache/sections/header.liquid` and `header-group.json`. Look for:
   - Mega menu snippets (`{% render 'mega-menu' %}`, `{% render 'mega-menu-list' %}`)
   - CSS classes like `.mega-menu`, `.megamenu`, `.nav-mega`
   - Block types with menu configuration (`menu_style`, `featured_products`, `featured_collections`)
   - Settings like `navigation_style: "mega"` vs `"dropdown"`

2. **Check the live site visually**: Navigate to the live site and hover/click on top-level nav items. Note:
   - Which nav items have mega menus vs simple dropdowns
   - Column layout (2-col, 3-col, full-width)
   - Content types (text links, product cards, collection images, promotional banners)
   - Whether there are featured items (products or collections with images)

### Implementation

3. **Check target theme capabilities**: Read the target theme's header section schema for mega menu support. Look for:
   - Block types: `mega_menu`, `menu_item`, `featured_collection`, `featured_products`
   - Settings: `menu_style`, `show_featured_products`, column configuration
   - Snippets: `mega-menu-list.liquid` or similar

4. **Configure navigation in `header-group.json`** (or equivalent):
   - Set the primary menu handle to match the live site's menu (`main-menu`, `mega-menu`, etc.)
   - For each top-level nav item that has a mega menu, configure the corresponding block settings:
     - `menu_style`: `"featured_products"`, `"featured_collections"`, `"text"`, etc.
     - Featured products/collections: set the collection handle to match the live site
     - Aspect ratios, image border radius, column spans
   - For mobile: configure drawer menu settings (accordion vs list, expand-first, dividers)

5. **Match menu content**: The live site's menu structure comes from Shopify's navigation admin (Menus). The menu items (links, nested items) are the same across themes — they're stored in Shopify's database, not the theme. What differs is HOW the menu is rendered:
   - **Menu handle**: Must match (`main-menu` is most common). Check `header-group.json` → `menu` setting.
   - **Depth**: If the live theme renders 3+ levels and target only does 2, document as a gap.
   - **Featured content**: Images, product cards, or collection cards IN the menu are theme-specific. Configure via block settings.

6. **CSS overrides**: If the target theme's mega menu doesn't match the live site's layout:
   - Column count/width adjustments
   - Featured image sizing
   - Typography within the menu (font-size, weight, letter-spacing for menu items)
   - Hover/focus states and transitions
   - Max-width of the mega menu panel

### Verification

7. **Navigate every top-level menu item** on both live and dev sites. Compare:
   - Do all mega menus appear? Are any missing?
   - Column layout matches?
   - Featured products/collections show correctly?
   - Mobile drawer menu has all items with correct nesting?

## Search Provider Migration

The live site may use a third-party search provider (Searchspring, Algolia, Klevu, Boost Commerce, etc.) that replaces Shopify's native search. This must be detected and handled.

### Detection

1. **Check base theme source**: Search `.theme-forge/base-cache/` for search integration:
   - Snippets: `searchspring*.liquid`, `algolia*.liquid`, `klevu*.liquid`, `boost-search*.liquid`
   - Sections: `search-results*.liquid` with third-party API calls
   - Assets: `searchspring*.js`, `algolia*.js`, `instantsearch*.js`
   - Layout: `{% render 'searchspring-*' %}` or similar in `theme.liquid`
   - Settings: `searchspring_site_id`, `algolia_app_id`, or similar in `settings_schema.json`

2. **Check app embeds**: In `.theme-forge/app-embeds.json` (from scan Step 5.7), look for search-related embeds.

3. **Check the live site**: Navigate and use the search bar. Note:
   - Does the search results page use a third-party layout? (URL may still be `/search?q=...` but results rendered by JS)
   - Does the search input show instant/predictive results from a third-party? (Network requests to external APIs)
   - Is there a search icon in the header that opens a third-party overlay?

### Implementation

4. **If third-party search is detected**:

   a. **App embed route** (most common): Most modern search apps (Searchspring, Algolia, Klevu) work via Shopify app embeds that inject their JS. If the app embed was migrated in scan Step 5.7, the search widget activates automatically when the app is installed. Verify the embed exists in the target theme's `settings_data.json`.

   b. **Theme integration route**: Some search apps require theme-level changes:
      - Custom search section (e.g., `sections/searchspring-results.liquid`): Copy to target theme
      - Custom snippets (e.g., `snippets/searchspring-widget.liquid`): Copy to target theme
      - Layout render calls (e.g., `{% render 'searchspring-init' %}`): Add to target layout
      - JS/CSS assets: Copy from base theme assets to target
      - Config values: Copy search settings from base `settings_data.json` to target

   c. **Document what the app needs**: In the section report, note which search provider is used and what theme integrations are required. Add to `.theme-forge/cutover.json` if any steps need the app installed on the production store.

5. **If NO third-party search**: The target theme's native search should work as-is. Configure:
   - Search visibility (`show_search: true` in header settings)
   - Search position and style (modal, inline, drawer) to match live site
   - Predictive search settings (if the target theme supports it)

6. **Verify search**: Test the search bar on dev. Enter a query and verify results appear. If the live site uses a third-party provider, search may not work on dev (app not installed) — document this in the report and add to cutover checklist.

## Header Gotchas

- **Scroll states**: Many headers change appearance on scroll (background opacity, shadow, height reduction). These are often JS-driven and need custom implementation.
- **Mobile breakpoint**: The mobile menu trigger breakpoint may differ between themes.
- **Logo dimensions**: Live site logo may have specific pixel dimensions that don't match the target theme's logo container.
- **Navigation depth**: If the live site has a mega-menu but the target theme only supports 2-level dropdowns, this is a gap that needs custom work or a mega menu app.
- **Search provider**: Third-party search providers (Searchspring, Algolia, Klevu) override native search. The integration may be via app embed (automatic), theme snippets (copy), or both. Search won't work on dev without the app installed — add to cutover checklist.
- **App-injected header elements**: Some apps inject wishlist icons, currency selectors, or loyalty widgets into the header via app embeds or app blocks. These appear on the live site but not on dev (app not installed). Document in the report — they'll activate when the theme goes live.
