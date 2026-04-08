# Computed Style Diff — Reference

Structured method for extracting and diffing computed styles between live and dev sites in a single pass. Replaces ad-hoc `javascript_tool` calls with a standardized extraction that catches all variances upfront.

## When to Use

Run this at **Step 4 (Render & Inspect)** of pull-section, AFTER taking screenshots and listing visual differences. The visual list tells you WHERE to look; this extraction tells you exactly WHAT differs.

## The Extraction Script

Use Chrome MCP's `javascript_tool` to run this on both the live and dev sites. Replace the selector with the section's container.

```javascript
// Extract computed styles for a section and its key children
(function() {
  const SECTION_SELECTOR = '[data-section-id="YOUR_SECTION_ID"]'; // or a class selector
  const section = document.querySelector(SECTION_SELECTOR);
  if (!section) return { error: 'Section not found: ' + SECTION_SELECTOR };

  // Properties that matter for visual matching
  const VISUAL_PROPS = [
    // Box model
    'width', 'height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-radius',
    // Layout
    'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
    'grid-template-columns', 'grid-template-rows', 'grid-gap',
    'position', 'top', 'right', 'bottom', 'left', 'z-index',
    // Typography
    'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'letter-spacing', 'text-transform', 'text-align', 'text-decoration',
    'color',
    // Background
    'background-color', 'background-image', 'background-size', 'background-position',
    // Visual
    'opacity', 'box-shadow', 'overflow', 'visibility',
    // Sizing
    'max-width', 'min-width', 'max-height', 'min-height',
    'object-fit', 'aspect-ratio'
  ];

  function extractStyles(el, label) {
    const computed = window.getComputedStyle(el);
    const styles = {};
    for (const prop of VISUAL_PROPS) {
      const val = computed.getPropertyValue(prop);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)') {
        styles[prop] = val;
      }
    }
    return { selector: label, tag: el.tagName.toLowerCase(), styles };
  }

  // Extract section container
  const result = { section: extractStyles(section, SECTION_SELECTOR), children: [] };

  // Extract key children: headings, paragraphs, buttons, images, links, list items
  const KEY_SELECTORS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'a', 'button', 'img', 'li',
    '[class*="heading"]', '[class*="title"]', '[class*="subtitle"]',
    '[class*="description"]', '[class*="body"]', '[class*="text"]',
    '[class*="button"]', '[class*="btn"]',
    '[class*="icon"]', '[class*="image"]',
    '[class*="container"]', '[class*="wrapper"]', '[class*="grid"]',
    '[class*="item"]', '[class*="card"]'
  ];

  const seen = new Set();
  for (const sel of KEY_SELECTORS) {
    for (const child of section.querySelectorAll(sel)) {
      const id = child.className || child.tagName;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = child.className
        ? '.' + child.className.split(' ').filter(c => c && !c.startsWith('shopify')).join('.')
        : child.tagName.toLowerCase();
      result.children.push(extractStyles(child, label));
      if (result.children.length >= 30) break; // cap to avoid overwhelming output
    }
  }

  return JSON.stringify(result, null, 2);
})();
```

## How to Diff

After running the extraction on both sites:

1. Parse both JSON results
2. For each element present on both sites, compare property values
3. Flag differences, ignoring:
   - **Pixel rounding** — 1px difference is not a variance (e.g., `112px` vs `113px`)
   - **Font stack ordering** — Same primary font with different fallbacks is not a variance
   - **RGB vs named colors** — Normalize to RGB before comparing
   - **Width differences** due to different viewport/container contexts — compare ratios, not absolutes
4. Categorize each diff by severity:
   - **High**: font-family, font-size, font-weight, color, background-color, display, flex-direction, gap, padding (>4px off)
   - **Medium**: letter-spacing, line-height, text-transform, margin (>4px off), border
   - **Low**: opacity, box-shadow, border-radius, minor padding/margin (<4px off)

## Output Format

Present diffs as a structured table:

```
ELEMENT                 PROPERTY         LIVE              DEV              SEVERITY
.trust-bar__heading     font-size        11px              13px             HIGH
.trust-bar__heading     letter-spacing   0.1em             0.05em           MEDIUM
.trust-bar__description font-weight      300               400              HIGH
.trust-bar__icon        width            24px              32px             MEDIUM
section container       padding-top      36px              28px             HIGH
section container       background-color rgb(247,247,247)  rgba(0,0,0,0)   HIGH
```

This table becomes the work list for Step 6 (Apply CSS Overrides). Work top to bottom, high severity first.

## Tips

- Run on the LIVE site first (source of truth), then on the dev site
- If a section uses Shadow DOM (common in Horizon), the script needs to pierce shadow roots — add `section.shadowRoot.querySelectorAll(...)` as a fallback
- For sections with multiple instances (e.g., product cards in a grid), extract one representative instance
- The `30 element cap` prevents overwhelming output but may miss deeply nested elements. Increase if needed for complex sections.
