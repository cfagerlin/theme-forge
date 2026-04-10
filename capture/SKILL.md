---
name: capture
description: >
  Deterministic section-scoped screenshot capture at all breakpoints (desktop, tablet, mobile).
  Produces reference screenshots for comparison. No agent discretion on technique.
  - MANDATORY TRIGGERS: theme-forge capture, capture section, screenshot section
---

# capture — Section Screenshot Capture

Take section-scoped screenshots at three breakpoints (desktop, tablet, mobile) with optional computed style extraction. This skill is deterministic — follow the exact commands below. No alternatives, no fallbacks to full-page screenshots.

## Hard Rules

1. **NEVER take a full-page screenshot.** Every screenshot targets a single section. If the section can't be found, FAIL. Do not fall back to full-page.
2. **ALWAYS capture all three breakpoints.** Desktop (1280), tablet (768), mobile (375). No "desktop only" option.
3. **ALWAYS use `wait --networkidle`** for page load. Never use `sleep` as a substitute.
4. **ALWAYS verify the desktop screenshot** by reading it with the Read tool after capture. If it's blank or broken, retry once. If still broken, FAIL.
5. **Follow the exact commands below.** Do not improvise browse tool usage. Do not add extra steps. Do not skip steps.

## Arguments

```
/theme-forge capture <url> --section <selector> [--output <dir>] [--extract-styles] [--reference <name>]
```

- `<url>` — Full page URL (live site or dev server)
- `--section <selector>` — **Required.** One of:
  - CSS selector: `#shopify-section-hero`, `section-hero`, `.shopify-section:nth-child(3)`
  - Numeric index: `0`, `1`, `2` (0-indexed position among `.shopify-section` elements)
- `--output <dir>` — Output directory (default: `/tmp/capture/`)
- `--extract-styles` — Run computed style extraction at each breakpoint
- `--reference <name>` — Store results in `.theme-forge/references/<name>/` (committed to git)

## Output

```
<output>/
├── desktop.png          # 1280px viewport
├── tablet.png           # 768px viewport
├── mobile.png           # 375px viewport
├── desktop.styles.json  # (if --extract-styles)
├── tablet.styles.json   # (if --extract-styles)
├── mobile.styles.json   # (if --extract-styles)
└── meta.json            # (if --reference) capture metadata
```

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)
- Browse tool must be available (detected during `onboard`)

## Workflow

### Step 1: Discover Browse Tool

```bash
B=$HOME/.claude/skills/gstack/browse/dist/browse
[ -x "$B" ] && echo "BROWSE: $B" || { B="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/skills/gstack/browse/dist/browse"; [ -x "$B" ] && echo "BROWSE: $B" || echo "BROWSE: NOT FOUND"; }
```

If `NOT FOUND`: STOP. Tell the user: "No browse tool available. Run `/theme-forge onboard` to detect capabilities or install Playwright MCP."

Create the output directory:
```bash
mkdir -p <output>
```

### Step 2: Navigate + Wait

```bash
B=<path> && $B goto "<url>" && $B wait --networkidle
```

This handles lazy-loaded images, deferred scripts, and Shadow DOM hydration. `wait --networkidle` waits until network activity ceases (15 second timeout).

### Step 3: Dismiss Overlays

**Only for live site URLs** (skip if URL contains `127.0.0.1` or `localhost`):

```bash
$B js "document.querySelectorAll('[class*=popup],[class*=modal],[class*=overlay],.klaviyo-form,.privy-popup,[class*=cookie],[data-testid*=popup]').forEach(el=>el.remove());document.body.style.overflow='auto'"
```

### Step 4: Scroll to Section

**If `--section` is a numeric index:**
```bash
$B js "document.querySelectorAll('.shopify-section')[<N>].scrollIntoView({block:'start'})" && $B wait --networkidle
```

**If `--section` is a CSS selector:**
```bash
$B js "document.querySelector('<selector>').scrollIntoView({block:'start'})" && $B wait --networkidle
```

The second `wait --networkidle` catches lazy images that load when the section enters the viewport.

### Step 5: Capture All Three Breakpoints

**IMPORTANT:** Steps 2-5 must run in a SINGLE Bash tool call. The browse tool loses page state between separate Bash invocations. Chain all commands with `&&`.

**Full command for each breakpoint** (run one complete Bash call per breakpoint):

#### Desktop (1280px):
```bash
B=<path> && $B goto "<url>" && $B wait --networkidle && \
$B js "document.querySelectorAll('[class*=popup],[class*=modal],[class*=overlay],.klaviyo-form,.privy-popup,[class*=cookie],[data-testid*=popup]').forEach(el=>el.remove());document.body.style.overflow='auto'" && \
$B js "<scroll_command>" && $B wait --networkidle && \
$B screenshot "<selector_or_--viewport>" <output>/desktop.png
```

**Verify immediately:** Read `<output>/desktop.png` with the Read tool. Check:
- Image is visible and shows the section content
- Not blank/white/grey
- File size is reasonable (>10KB for a real screenshot)

If blank or broken, retry the entire command once. If still blank: **FAIL** with "Screenshot blank — section `<selector>` not found or page didn't fully load at `<url>`."

#### Tablet (768px):
```bash
B=<path> && $B goto "<url>?viewport=768" && $B js "Object.defineProperty(window,'innerWidth',{value:768,writable:true});Object.defineProperty(window,'innerHeight',{value:1024,writable:true});window.dispatchEvent(new Event('resize'))" && $B wait --networkidle && \
$B js "<dismiss_overlays_if_live>" && \
$B js "<scroll_command>" && $B wait --networkidle && \
$B screenshot "<selector_or_--viewport>" <output>/tablet.png
```

#### Mobile (375px):
```bash
B=<path> && $B goto "<url>?viewport=375" && $B js "Object.defineProperty(window,'innerWidth',{value:375,writable:true});Object.defineProperty(window,'innerHeight',{value:812,writable:true});window.dispatchEvent(new Event('resize'))" && $B wait --networkidle && \
$B js "<dismiss_overlays_if_live>" && \
$B js "<scroll_command>" && $B wait --networkidle && \
$B screenshot "<selector_or_--viewport>" <output>/mobile.png
```

**Screenshot targeting per selector type:**
- If `--section` is a CSS selector: `$B screenshot "<selector>" <output>/<breakpoint>.png`
- If `--section` is a numeric index: after scrolling to section, use `$B screenshot --viewport <output>/<breakpoint>.png`

### Step 6: Extract Computed Styles (if `--extract-styles`)

For each breakpoint, after the screenshot, run the extraction script in the same Bash call (page is still loaded):

```bash
$B js "JSON.stringify((function(){const s=document.querySelector('<selector>')||document.querySelectorAll('.shopify-section')[<N>];if(!s)return{error:'Section not found'};const cs=getComputedStyle(s);const h=s.querySelector('h1,h2,h3');const p=s.querySelector('p');const btn=s.querySelector('.button,a[class*=button]');return{bg:cs.backgroundColor,fg:cs.color,padding:{top:cs.paddingTop,bottom:cs.paddingBottom},height:s.getBoundingClientRect().height,heading:h?{fontFamily:getComputedStyle(h).fontFamily,fontWeight:getComputedStyle(h).fontWeight,fontSize:getComputedStyle(h).fontSize,letterSpacing:getComputedStyle(h).letterSpacing,textAlign:getComputedStyle(h).textAlign}:null,body:p?{fontFamily:getComputedStyle(p).fontFamily,fontSize:getComputedStyle(p).fontSize,letterSpacing:getComputedStyle(p).letterSpacing,lineHeight:getComputedStyle(p).lineHeight}:null,button:btn?{classes:btn.className,bg:getComputedStyle(btn).backgroundColor,color:getComputedStyle(btn).color,borderRadius:getComputedStyle(btn).borderRadius,padding:getComputedStyle(btn).padding}:null,images:(function(){const imgs=s.querySelectorAll('img');return[...imgs].slice(0,10).map(img=>{const ics=getComputedStyle(img);const ir=img.getBoundingClientRect();const parent=img.parentElement;const pr=parent.getBoundingClientRect();const pcs=getComputedStyle(parent);return{src:img.src.split('/').pop().split('?')[0],alt:(img.alt||'').substring(0,40),imgWidth:Math.round(ir.width),imgHeight:Math.round(ir.height),containerWidth:Math.round(pr.width),containerHeight:Math.round(pr.height),objectFit:ics.objectFit,objectPosition:ics.objectPosition,aspectRatio:pcs.aspectRatio,overflow:pcs.overflow}})})(),liquidErrors:s.innerHTML.includes('Liquid error'),emptyRgb:(s.outerHTML.match(/rgb\\(\\)/g)||[]).length,boundingBoxes:(function(){const sectionRect=s.getBoundingClientRect();const els=s.querySelectorAll('h1,h2,h3,h4,p,img,.button,a[class*=button],.rte,[class*=content]');return[...els].slice(0,20).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,classes:el.className.toString().substring(0,60),text:el.textContent?el.textContent.trim().substring(0,30):null,x:Math.round(r.x),relativeY:Math.round(r.y-sectionRect.y),width:Math.round(r.width),height:Math.round(r.height)}})})()}})())"
```

Save the output as `<output>/<breakpoint>.styles.json`.

**Shadow DOM variant:** If the target theme uses Shadow DOM (Horizon), the extraction script needs `deepQuery` to find elements inside shadow roots. Replace `s.querySelector(...)` calls with:

```javascript
function dq(root,sel){let r=root.querySelector(sel);if(r)return r;for(const el of root.querySelectorAll('*')){if(el.shadowRoot){r=dq(el.shadowRoot,sel);if(r)return r;}}return null;}
```

Use `dq(s, 'h1,h2,h3')` instead of `s.querySelector('h1,h2,h3')`.

### Step 7: Store Reference (if `--reference`)

```bash
mkdir -p .theme-forge/references/<name>/
cp <output>/desktop.png .theme-forge/references/<name>/
cp <output>/tablet.png .theme-forge/references/<name>/
cp <output>/mobile.png .theme-forge/references/<name>/
```

If `--extract-styles` was also passed:
```bash
cp <output>/desktop.styles.json .theme-forge/references/<name>/
cp <output>/tablet.styles.json .theme-forge/references/<name>/
cp <output>/mobile.styles.json .theme-forge/references/<name>/
```

Write `meta.json`:
```json
{
  "captured_at": "<current ISO timestamp>",
  "url": "<url>",
  "selector": "<selector>"
}
```

References are committed to git. Parallel sessions share them.

## How pull-section Invokes This Skill

pull-section does NOT call `/theme-forge capture` as a command. Instead, it reads this SKILL.md and follows the workflow above inline, the same way pull-page invokes pull-section.

**Step 4 of pull-section (capture live + dev):**

```
4.1 Live reference:
  Check .theme-forge/references/{section}-{page}/meta.json
  IF exists → use stored reference screenshots (all three breakpoints)
  IF not exists → run capture workflow with --reference --extract-styles

4.2 Dev site:
  Run capture workflow on dev URL with --extract-styles
  Output to /tmp/capture-dev/
```

**Step 8 of pull-section (verify fix):**

```
8.1 Run capture workflow on dev URL (all three breakpoints)
8.2 Compare each breakpoint against stored live reference
    (Live reference is NOT re-captured)
```

## Recapturing References

If the live site changes, the user recaptures manually:

```
/theme-forge capture https://example.com --section "#shopify-section-hero" --reference hero-index --extract-styles
```

This overwrites the stored reference. No automatic staleness detection.

## Fallback: No Browse Tool

If no browse tool is available, capture cannot run. pull-section falls back to code-only analysis with `status: "completed_code_only"` in the report. This is explicitly a degraded mode — the user should install a browse tool for real visual comparison.
