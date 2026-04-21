// Regression harness for the intake-anchors scorer.
//
// Run: bun tests/intake-anchors.test.ts
//
// Each scenario loads a fixture HTML file under tests/fixtures/, injects the
// scorer function with a role entry + candidate list, and asserts on the winning
// selector and score floor. Exit code 0 iff every scenario passes.

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "fixtures");

type RoleEntry = {
  role_name: string;
  element_type: string;
  required: boolean;
  expected_attributes: Record<string, unknown>;
};

type Candidate = { selector: string; weight: number; source: string };

type ScorerResult = {
  role_name: string;
  winner: null | {
    selector: string;
    winning_selector: string;
    score: number;
    sample_text: string;
    source: string;
  };
  runners_up: unknown[];
};

// Scorer payload kept in sync with intake-anchors/SKILL.md Step 2.3.
// If that block changes, update this string.
const SCORER_FN = `
(roleEntry, candidates, viewport) => {
  const { role_name, element_type } = roleEntry;
  function buildStableSelector(el) {
    if (el.id) return '#' + el.id;
    const dataAttr = [...el.attributes].find(a => a.name.startsWith('data-') && a.value);
    if (dataAttr) return el.tagName.toLowerCase() + '[' + dataAttr.name + '="' + dataAttr.value + '"]';
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
      if (cls) return el.tagName.toLowerCase() + '.' + cls;
    }
    return el.tagName.toLowerCase();
  }
  const scored = [];
  for (const c of candidates) {
    const els = [...document.querySelectorAll(c.selector)];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const sizeScore = Math.min(1, (r.width * r.height) / (viewport.width * 40));
      const positionScore = r.top < 1200 ? 1 : Math.max(0, 1 - (r.top - 1200) / 2000);
      const textLen = (el.textContent || '').trim().length;
      const textScore = element_type === 'heading' || element_type === 'price' || element_type === 'button'
        ? (textLen > 0 && textLen < 80 ? 1 : 0.3)
        : 0.5;
      const attrScore = (role_name === 'primary_atc' && el.matches("button[name='add'], button[type='submit']")) ? 1 : 0.5;
      const weightScore = c.weight;
      const total = 0.25 * sizeScore + 0.25 * positionScore + 0.2 * textScore + 0.15 * attrScore + 0.15 * weightScore;
      scored.push({
        selector: c.selector,
        winning_selector: buildStableSelector(el),
        score: total,
        sample_text: (el.textContent || '').trim().slice(0, 80),
        source: c.source,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return { role_name, winner: scored[0] || null, runners_up: scored.slice(1, 4) };
}
`.trim();

type Scenario = {
  name: string;
  fixture: string;
  role: RoleEntry;
  candidates: Candidate[];
  expectedSelectorSubstring: string;
  minScore: number;
};

const SCENARIOS: Scenario[] = [
  {
    name: "smoke: product_title picks h1.main-title, not sticky h1",
    fixture: "pdp-smoke.html",
    role: { role_name: "product_title", element_type: "heading", required: true, expected_attributes: {} },
    candidates: [{ selector: "h1", weight: 0.9, source: "section:product-information" }],
    expectedSelectorSubstring: "main-title",
    minScore: 0.5,
  },
  {
    name: "smoke: primary_atc picks button[name=add]",
    fixture: "pdp-smoke.html",
    role: { role_name: "primary_atc", element_type: "button", required: true, expected_attributes: {} },
    candidates: [{ selector: "button[name='add'], button[type='submit']", weight: 0.95, source: "section:product-information" }],
    expectedSelectorSubstring: "button",
    minScore: 0.6,
  },
  {
    // Regression guard for the scorer bug fixed in v0.22: scorer now keys textScore
    // on element_type ("heading"), not role_name ("product_title"). Before the fix,
    // textScore always fell through to 0.5 regardless of text content.
    // After the fix, a valid heading gets textScore=1.0, producing a higher total.
    name: "regression: scorer uses element_type, not role_name",
    fixture: "pdp-smoke.html",
    role: { role_name: "product_title", element_type: "heading", required: true, expected_attributes: {} },
    candidates: [{ selector: "h1.main-title", weight: 0.95, source: "section:product-information" }],
    expectedSelectorSubstring: "main-title",
    minScore: 0.7,
  },
];

async function run() {
  // Use the full chromium channel rather than the headless shell — the shell
  // variant isn't always bundled with every playwright install and the full
  // chromium in headless mode is just as fast for these assertions.
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let pass = 0;
  let fail = 0;

  for (const s of SCENARIOS) {
    const html = readFileSync(resolve(FIXTURES, s.fixture), "utf8");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const result = (await page.evaluate(
      ({ fn, role, candidates }) => {
        // eslint-disable-next-line no-new-func
        const scorer = new Function("return " + fn)();
        return scorer(role, candidates, { width: innerWidth, height: innerHeight });
      },
      { fn: SCORER_FN, role: s.role, candidates: s.candidates },
    )) as ScorerResult;

    const winner = result.winner;
    if (!winner) {
      console.log(`FAIL: ${s.name} — winner is null`);
      fail++;
      continue;
    }

    if (!winner.winning_selector.includes(s.expectedSelectorSubstring)) {
      console.log(
        `FAIL: ${s.name} — expected selector containing '${s.expectedSelectorSubstring}', got '${winner.winning_selector}' (score ${winner.score.toFixed(3)})`,
      );
      fail++;
      continue;
    }

    if (winner.score < s.minScore) {
      console.log(`FAIL: ${s.name} — score ${winner.score.toFixed(3)} below floor ${s.minScore}`);
      fail++;
      continue;
    }

    console.log(`PASS: ${s.name} — winner '${winner.winning_selector}' score ${winner.score.toFixed(3)}`);
    pass++;
  }

  await browser.close();
  console.log(`\nResults: ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
