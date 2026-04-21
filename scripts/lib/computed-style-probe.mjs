// computed-style-probe.mjs — Read computed CSS properties off a live page
// and return them as text. The text-first verification path for hairline
// properties (border-*, outline-*, line-height, font-weight, opacity,
// box-shadow, letter-spacing, color) where visual screenshots fail.
//
// Why text, not pixels: a 1px #e8e8e8 border on #fcfcfc averages out when
// the model's image input downscales the screenshot. The browser's
// computed style is the source of truth for what was applied.
//
// Usage:
//   bun run scripts/lib/computed-style-probe.mjs \
//     --url https://example.com/products/foo \
//     --selector ".product-title" \
//     --properties "border-bottom,line-height,font-weight" \
//     [--breakpoint desktop|tablet|mobile] \
//     [--out-json path/to/probe.json] \
//     [--all-matching]    # probe every match, not just the first
//
// Output JSON shape:
//   {
//     status: "ok" | "no_match" | "error",
//     url, selector, breakpoint, properties,
//     matches: [
//       {
//         tag, id, classes, text,
//         rect: { x, y, w, h },
//         visible: true|false,
//         computed: { "border-bottom": "1px solid rgb(232,232,232)", ... },
//         pseudo: { "::before": {...}, "::after": {...} }
//       }
//     ]
//   }

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BREAKPOINTS = {
  desktop: { width: 2560, height: 1440 },
  tablet:  { width: 768,  height: 1024 },
  mobile:  { width: 375,  height: 812  },
};

function parseArgs(argv) {
  const args = { breakpoint: "desktop", allMatching: false, includePseudo: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--url") args.url = argv[++i];
    else if (k === "--selector") args.selector = argv[++i];
    else if (k === "--properties") args.properties = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--breakpoint") args.breakpoint = argv[++i];
    else if (k === "--out-json") args.outJson = argv[++i];
    else if (k === "--all-matching") args.allMatching = true;
    else if (k === "--no-pseudo") args.includePseudo = false;
  }
  if (!args.url) throw new Error("--url is required");
  if (!args.selector) throw new Error("--selector is required");
  if (!args.properties || args.properties.length === 0) throw new Error("--properties is required (comma-separated)");
  if (!BREAKPOINTS[args.breakpoint]) throw new Error(`unknown --breakpoint: ${args.breakpoint}`);
  return args;
}

export async function probeComputedStyles({ url, selector, properties, breakpoint = "desktop", allMatching = false, includePseudo = true }) {
  const viewport = BREAKPOINTS[breakpoint];
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const matches = await page.evaluate(
      ({ selector, properties, allMatching, includePseudo }) => {
        const els = Array.from(document.querySelectorAll(selector));
        const targets = allMatching ? els : els.slice(0, 1);
        return targets.map((el) => {
          const rect = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const computed = {};
          for (const p of properties) computed[p] = cs.getPropertyValue(p) || cs[p] || "";
          const result = {
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: el.className && typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean) : [],
            text: (el.textContent || "").trim().slice(0, 120),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            visible: rect.width > 0 && rect.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0,
            computed,
          };
          if (includePseudo) {
            const pseudo = {};
            for (const which of ["::before", "::after"]) {
              const ps = getComputedStyle(el, which);
              const content = ps.getPropertyValue("content");
              if (content && content !== "none" && content !== "normal") {
                const obj = { content };
                for (const p of properties) obj[p] = ps.getPropertyValue(p) || "";
                pseudo[which] = obj;
              }
            }
            if (Object.keys(pseudo).length) result.pseudo = pseudo;
          }
          return result;
        });
      },
      { selector, properties, allMatching, includePseudo }
    );
    return { status: matches.length ? "ok" : "no_match", url, selector, breakpoint, properties, matches };
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await probeComputedStyles(args);
    if (args.outJson) writeFileSync(args.outJson, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    process.exit(result.status === "ok" ? 0 : 3);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
