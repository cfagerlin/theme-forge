# Changelog

## 0.7.0 — 2026-04-10

**Git-centric parallel sessions.** Complete rethink of multi-session coordination. The repo is the coordination layer. No locks. No state machine. Zero-ceremony session start.

- **Zero-ceremony sessions**: New sessions read `config.json` from the repo and start working immediately. No setup commands beyond initial `onboard`.
- **Targeted base pull**: Sessions pull only `templates/` and `config/` from the live theme (~5 sec) instead of a full theme export. Always fresh, gitignored, session-local.
- **Scoped scan + map**: `pull-page` scans only the page it needs, not the entire site. Creates mappings on demand. Full `scan` still available but not required.
- **Git coordination**: Committed reports = section done. Sessions `git pull` before each section to see what other sessions have completed. No file locks, no state.json, no coordination protocol.
- **Mapping rules registry** (`.theme-forge/mapping-rules.json`): Global "base X → target Y" rules committed to repo. Ensures all sessions use consistent mappings.
- **Conventions file** (`.theme-forge/conventions.json`): Global standards (CSS-first, prefix, thresholds) committed to repo.
- **Per-session dev server**: Each session runs `shopify theme dev --environment page-{name} --port {unique}`. Separate Shopify dev themes per environment, no conflicts.
- **Commit after each section**: Code changes + reports committed and pushed after every section, making progress visible to other sessions immediately.
- **`--globals-only` flag**: Replaces `--through-globals`. Runs scan→map→header→footer, commits, stops. Useful for CI or explicit first-step workflows.
- **`--retry-failed` flag**: Replaces `--reset-failed`. Deletes failed reports so sections are re-attempted.
- **Onboard commits config**: `.theme-forge/` is no longer fully gitignored. Only `base-cache/` and `debug/` are ignored. Config, mappings, reports, and learnings are committed.

**Removed:**
- `state.json` (entire state machine)
- File-based locks (global and page)
- `--through-globals` flag (replaced by `--globals-only`)
- `--force` flag (no locks to break)
- `--reset` / `--reset-failed` flags (replaced by `--retry-failed`)
- Staleness detection (no in_progress state to go stale)
- `base_theme` path in config (replaced by targeted base pull)

## 0.5.15 — 2026-04-09

**Hard rules at the top.** The agent was ignoring section-level screenshot, mandatory transcript, and honest status rules despite them existing in the skill. Root cause: rules were scattered across a 1032-line file and getting lost.

- **New "Hard Rules" section** at the very top of pull-section SKILL.md, before Prerequisites. Short, blunt, unmissable.
- Consolidates the most-violated rules: no full-page screenshots, mandatory transcript, honest final_status, no rationalization, section identity verification.
- No new rules added — this is a structural fix to make existing rules actually followed.

## 0.5.14 — 2026-04-09

**Quick section queries.** Users shouldn't have to memorize section type names. Two new quick-query modes for `status`:

- **`/theme-forge status --page index`**: Lists every section on the page with its status, the exact `pull-section` command, and the live site section name in parentheses when it differs.
- **`/theme-forge status --next`**: Shows just the next pending/incomplete section with a ready-to-run command.
- **Natural language routing**: "what's next?", "show me the homepage sections", "what's left?" all route to the appropriate status query.
## 0.5.13 — 2026-04-09

**Reverse-lookup for live site section names.** Users naturally refer to sections by their live site name (e.g., "pull anatomy"), but pull-section only resolved target theme names. The agent would fail to find the section and burn context trying to figure out the mapping.

- **Step 6 in section resolution**: When a section name isn't found in the target theme's template files, reverse-lookup through `.theme-forge/mappings/sections/*.json` and `site-inventory.json` for a matching `base_section` name.
- **User feedback**: "The live site's 'home_anatomy' is mapped to 'custom-brand-story' in the target theme. Pulling 'custom-brand-story'."
- Example: `home_anatomy` (live) → `custom-brand-story` (target) found via mapping file.

## 0.5.12 — 2026-04-09

**Anti-rationalization rules + live section verification.** The agent marked a section "completed" with zero files modified and 2 unresolved variances by rationalizing them as "intentional" and "better."

- **Rule 10 — Never rationalize variances**: Explicitly bans calling height differences "intentional," declaring `object-fit: cover` "better" than the live site's `fill`, and marking completed with zero work done. "The live site is the spec. Your job is to match it, not improve it."
- **Rule 11 — Verify correct live section**: Agent compared against the wrong section on the live page (how-it-works carousel instead of testimonial). Must confirm section content matches the mapping before screenshotting, and log the selector used.
- **Self-test for "acceptable" variances**: "Would the user notice the difference side by side? If yes, it's a defect."
- **Zero-work guard**: `files_modified: []` with `variances_remaining > 0` is never a valid completed state.

## 0.5.11 — 2026-04-09

**Debug quality + popup dismissal + honest status.** Four fixes from reviewing debug logs of the testimonial carousel run:

1. **Popup/modal dismissal**: Live Shopify stores show email signup overlays that block section content. Step 4 now removes popups before screenshotting. If a popup is still visible, retake — never compare against an obscured screenshot.
2. **Transcript is mandatory**: Debug mode without a transcript is useless. Added explicit "mandatory artifacts" checklist — transcript.md, step4 screenshots (before), step8 screenshot (after), summary.json, delta-table.md.
3. **Section-level screenshots in Step 8**: The agent was falling back to full-page screenshots during verification despite the v0.5.7 rule. Step 8 now has an explicit code example and a direct prohibition.
4. **Honest `final_status`**: Cannot mark "completed" when `variances_remaining > 0`. New status table: `completed`, `completed_with_accepted_variances`, `incomplete`, `failed`, `completed_code_only`. Also: `variances_found` must equal `variances_fixed + variances_remaining`.

## 0.5.10 — 2026-04-09

**Learnings on every fix, not just retries.** The agent was discovering theme defaults (like `text-wrap: balance`) and fixing them, but not capturing the pattern as a learning. The next section would hit the same default and rediscover it from scratch.

- **Step 8.6 rewritten**: Capture learnings on every successful fix, not just retries. Three triggers: retry fixes, theme default overrides (first-attempt success), and pattern recognition (2+ sections).
- **Theme default overrides are the key case**: If you overrode a target theme default to match the live site, every other section has that same default. Capture it immediately.
- **Step 1.5 strengthened**: Matching learnings must be listed in the transcript and applied proactively in the first CSS pass.

## 0.5.9 — 2026-04-09

**Global debug toggle.** Debug mode can now be turned on globally so you don't have to pass `--debug` on every command.

- **`/theme-forge --debug on`**: Sets `"debug": true` in `.theme-forge/config.json`. All subsequent runs save transcripts and artifacts automatically.
- **`/theme-forge --debug off`**: Disables global debug.
- **`--no-debug` flag**: Override the global setting for a single run. Useful when debug is on globally but you want a quick run without artifacts.
- **Precedence**: `--no-debug` > `--debug` > config.json `"debug"` field.

## 0.5.8 — 2026-04-09

**Debug mode (`--debug`).** Saves a complete transcript, all screenshots, computed style diffs, and a summary for every section. Review what happened without watching the session live.

- **`--debug` flag**: Pass to `pull-section`, `pull-page`, or `--full`. Creates `.theme-forge/debug/{timestamp}-{section-key}/` per section.
- **Transcript**: `transcript.md` with every step, decision, command, and output. A reviewer reading only the transcript should understand the full story.
- **Screenshots**: Saved to `debug/screenshots/` with step-prefixed names (`step4-live.png`, `step8-verify.png`). No more lost `/tmp/` files.
- **Computed style diffs**: Live and dev extraction results saved as JSON. Delta tables saved as markdown.
- **Summary**: `summary.json` with structured metadata — status, variance counts, errors, files modified.
- **Zero overhead when off**: No ambient logging. No debug directory. No transcript. Only activated by `--debug`.

## 0.5.7 — 2026-04-09

**Section-level screenshots + browse command chaining.** Two issues from the same migration session:

1. **Full-page screenshots banned for section comparison.** The agent was screenshotting the entire page. At that resolution you can't see font-weight, letter-spacing, or overlay differences. Per-section screenshots are now the only accepted approach.

2. **Browse commands must be chained in ONE Bash call.** The browse tool loses page state between separate Bash tool invocations (it restarts its server). The agent would `$B goto` in one call, then `$B screenshot` in the next, and find itself on `about:blank`. All examples now use `&&` chaining: `$B goto "<url>" && sleep 2 && $B screenshot`.

- **"Never use full-page screenshots for section comparison"**: Explicit rule in Step 4 and the Shadow DOM section. Full-page is only for the final page-level review in pull-page, not for per-section work.
- **Scroll-to-section technique**: Primary method for Shadow DOM themes — `scrollIntoView` + viewport screenshot. Works when element selectors fail because sections are custom elements with shadow roots.
- **Three technique hierarchy**: (1) scroll-to-section + viewport screenshot, (2) section ID selector, (3) custom element tag. No fallback to full-page.
- **Verification step updated**: Step 8 now explicitly says "section-level screenshot" instead of just "new screenshot."

## 0.5.6 — 2026-04-09

**Image sourcing rule.** Prompted by an agent that told the user images "need to be set via Shopify admin" and would "remain placeholders until uploaded through the theme editor." Wrong — the images already exist on Shopify's CDN.

- **IMAGE SOURCING RULE**: New explicit rule in both `pull-section` and `pull-page`. Images use `shopify://shop_images/filename.ext` URLs stored in `settings_data.json`. Copy them from the base theme to the target theme. They resolve to the store's CDN automatically. No upload needed, no admin needed, no theme editor needed.
- **"Never tell the user images need to be uploaded manually"**: If a placeholder appears, the agent missed copying the image reference. Go back and fix it instead of telling the user to do it by hand.
- **Where to find images**: Documented the three locations (settings_data.json section keys, template JSON blocks, global settings).

## 0.5.5 — 2026-04-09

**Shadow DOM support for Horizon and modern themes.** Prompted by a migration where the agent got blank screenshots and empty `querySelector` results because Horizon renders everything inside Declarative Shadow DOM.

- **Shadow DOM detection**: New detection one-liner checks for shadow hosts in the page DOM. If found, all subsequent queries use shadow-piercing functions.
- **`deepQuery` and `deepQueryAll` helpers**: Recursive functions that traverse `.shadowRoot` on every element to find elements behind shadow boundaries. `getComputedStyle()` works fine on shadow DOM elements... the hard part was finding them.
- **Hydration wait for screenshots**: Shadow DOM themes need 3-5 seconds after navigation before screenshots. Without the wait, the headless browser captures a blank page. Instructions now include explicit `await new Promise(r => setTimeout(r, 3000))` before screenshotting.
- **CSS custom properties as primary comparison tool**: For Shadow DOM themes, CSS custom properties (`--font-body-family`, `--color-foreground`, etc.) defined on `:root` pierce all shadow boundaries. These are the most reliable way to compare styles.
- **Updated computed-style-diff.md**: The extraction script now uses `deepQuery`/`deepQueryAll` to find the section and its children, even when nested inside shadow roots.

## 0.5.4 — 2026-04-09

**Browse tool discovery fix.** Prompted by an agent that couldn't find the browse tool even though it was installed. The agent checked its named tool list, didn't see "browse", and concluded it was unavailable — then thrashed with curl/WebFetch workarounds.

- **"This is a Bash command" — explicit and prominent**: The browse tool is a CLI binary (`~/.claude/skills/gstack/browse/dist/browse`), not an MCP tool or a named tool. The agent will never see "browse" in its tool list. This is now stated clearly at the top of the Browse Tool section in both `pull-section` and `pull-page`, with a concrete Bash discovery command to run.
- **Discovery via Bash check, not tool-list inspection**: Instead of "check your available tools", the skill now says "run this Bash command" with a one-liner that prints `BROWSE READY` or `NOT FOUND`. No ambiguity.
- **Explicit "don't fake it" rule**: curl, WebFetch, and other non-browse tools cannot substitute for visual verification. These return HTML/markdown, not rendered pages.
- **`$B` persistence warning**: Shell variables don't persist between Bash tool calls. Every code example now defines `B=<path>` at the start, so agents don't get `command not found` on the second Bash call.
- **`$HOME` instead of `~`**: Tilde doesn't expand in all contexts. Discovery commands now use `$HOME` for robustness.
- **Code-only fallback is automatic**: When the binary genuinely isn't installed, falls back to code-only without blocking.

## 0.5.3 — 2026-04-09

**Base theme freshness and content sourcing.** Prompted by a migration where the agent pulled "Poetry you can wear" from a stale alternate template instead of "Most-Loved Gifts" from the live site.

- **Base theme freshness check**: New Step -1 in `pull-page`. If the base theme export is older than 24 hours, warns the user and offers to re-export via `shopify theme pull`. Records `base_theme_exported_at` and `live_theme_id` in config during onboard.
- **Content sourcing rule**: Explicit rule in `pull-section` Step 2 — never read content from alternate templates (`index.sl-*.json`). Always use the primary template and `settings_data.json`. `settings_data.json` wins when values disagree because it reflects what the theme editor shows on the live site.
- **Active template identification**: Onboard now records which template files are active vs alternate/unused.

## 0.5.2 — 2026-04-09

**Safety and pipeline enforcement.** Prompted by a real migration where the agent pushed to Shopify without permission and skipped the entire pull-section pipeline.

- **NEVER push to Shopify without user approval**: New hard safety rule. `shopify theme push` and `shopify theme publish` are now explicitly forbidden without user confirmation. `pull-page` Step 0 updated to save settings locally instead of pushing. `shopify theme dev` hot-reloads local files, so pushing is unnecessary during development.
- **`--full` workflow enforced**: Previously, `--full` was described as a flag but had no defined workflow. An agent could (and did) skip scan, map, pull-section, state tracking, and visual verification entirely. Now `--full` has an explicit 8-step pipeline that must be followed in order. Every section must go through `pull-section` with its compare→fix→verify loop.
- **State machine required**: The `--full` workflow now initializes `state.json` and tracks every section. No section can be marked complete without running pull-section on it.

## 0.5.1 — 2026-04-08

**Zero-friction install.** Clone and go — no setup script required.

- **SKILL.md moved to repo root**: Cloning the repo into `~/.claude/skills/theme-forge` or `.claude/skills/theme-forge` makes `/theme-forge` immediately discoverable. No symlinks, no setup step, no debugging nested directories.
- **Setup script is now optional**: Only needed to check dependencies (Shopify CLI, browse tools, Git). Install no longer requires running it.
- **Fixed `--project` install bug**: Previously, running `./setup --project` from inside the clone used `$(pwd)` to find the project root, which created broken nested paths like `.claude/skills/theme-forge/.claude/skills/theme-forge`. Now walks up to find the actual project root.
- **Removed `theme-forge/` subdirectory**: The orchestrator SKILL.md lived inside a `theme-forge/` subdirectory, which meant the repo root had no SKILL.md for Claude Code to discover. Moved to root.

## 0.5.0 — 2026-04-08

**theme-forge.** Renamed from theme-pull. Same tool, better name.

- **Renamed to theme-forge**: All commands, config paths, and state directories updated. `.theme-pull/` → `.theme-forge/`, `/theme-pull` → `/theme-forge`.
- Existing installs: re-run `setup` to update. State files in `.theme-pull/` will need to be moved to `.theme-forge/` (or start fresh with `onboard`).

## 0.4.6 — 2026-04-08

Enforcement release. Closes loopholes that let the agent skip fixes.

- **Closed zero-tolerance loophole**: Explicit list of properties that are NEVER platform limitations (font-weight, font-size, letter-spacing, container width, image sizing, padding, alignment). "Global theme setting" is not an excuse to skip a fix. Override with CSS `!important`.
- **Mandatory extraction script**: The JS extraction script MUST be run on both live and dev sites during verification. Cannot be skipped because "screenshots look close enough."
- **Final Validation Gate**: Replaced soft "Final Visual Comparison" step with a hard gate. Must build a delta table comparing every extracted property. If ANY row has a non-zero delta, the section cannot be declared done. The delta table must be shown to the user.
- **Agent cannot accept variances**: Only the user can accept a variance. The agent may never mark a difference as "accepted" or "known limitation" on its own.
- **Two new operational rules**: (8) always run the extraction script, (9) never accept a variance without user approval.

Prompted by a services page pull where the agent accepted font-weight 700 vs 400 as a "global Horizon setting" and declared the section done with visible variances in hero height, image aspect ratios, container widths, and text positioning.

## 0.4.5 — 2026-04-08

Image fidelity release. Fixes the "same image looks different" problem.

- **Image container validation**: New checks (#17, #18) in rendered output validation. Extracts `getBoundingClientRect()` on image containers, `object-fit`, `object-position`, and `aspect-ratio` from both live and dev. Catches when images show different visible areas despite using the same source file.
- **Image extraction in JS script**: The validation script now captures all `<img>` elements with their container dimensions, object-fit/position, and aspect-ratio. Enables precise comparison of which part of an image is visible.
- **Image Viewable Area Mismatch gotcha**: New common gotcha documenting the three most frequent causes of image differences (container height, object-position focal point, aspect-ratio vs explicit height).

## 0.4.4 — 2026-04-08

Precision and safety release. Catches variances that code-only analysis misses.

- **Browse tool runtime verification**: When browse tool was configured during onboard but is unavailable at runtime, STOP and ask the user whether to fall back to code-only or troubleshoot. No more silent degradation.
- **Bounding box extraction**: New validation check (#16) captures `getBoundingClientRect()` for all key elements (headings, paragraphs, images, buttons) on both live and dev sites. Compares x, y, width, height to catch layout/positioning differences invisible in computed style diffs.
- **Zero-tolerance on measured deltas**: Any measurable difference between live and dev rendering MUST be fixed. "Could add if needed" is not a valid resolution. Only user-approved accepted variances or documented platform limitations are exceptions.
- **Cutover checklist**: `.theme-forge/cutover.json` auto-accumulates items that require manual action during production go-live (template assignments, asset uploads, custom section verification). New `/theme-forge cutover` command displays and verifies the checklist.
- Total commands: 14 (was 13)

## 0.4.3 — 2026-04-08

Operational quality release. Encodes real-session learnings into the methodology.

- **7 operational rules**: Extracted from analyzing a real pull-page session (lagunapeak.com → Horizon). Rules: never do rem math manually, read target schema first, find CSS loading mechanism early, navigate before screenshot, screenshot individual sections, match visual weight via font settings, set global settings before sections.
- **Favicon detection**: pull-page Step 0 now extracts favicon from the live site's HTML via browse tool and sets it in the target theme's `settings_data.json`.

## 0.4.2 — 2026-04-08

Visual fidelity release. Makes cross-theme CSS comparison actually work.

- **Cross-theme CSS resolution**: New Step 2.5 in pull-section requires resolving both themes' CSS variables to final computed pixel/color/font values and comparing those, not variable names. Includes a cross-theme variable mapping reference (Dawn↔Horizon) for colors, fonts, spacing, and layout.
- **Rendered output validation checklist**: 15 automated checks (background color, font weight/size, letter-spacing, padding, button variant, Liquid errors, empty CSS values, placeholder images) with a JavaScript extraction script that runs on both sites via the browse tool.
- **Light/dark polarity check**: Detects when a section's background color polarity flips between live and dev (the single most visible migration error).
- **Common Gotchas expanded**: CSS variable name mismatches (#1 error source), heading weight differences, spacing formula resolution, rendered HTML validation.
- **Browse tool abstraction**: Replaced all Chrome MCP references with a browse tool layer supporting gstack browse binary, Playwright MCP (`@playwright/mcp`), and legacy Chrome MCP.
- **Onboard install prompt**: When no browse tool is detected, prompts user to install Playwright MCP or notes gstack browse if available.
- **Shopify CLI 3.x auth**: Use `shopify theme list` for authentication and theme detection (CLI 3.x removed `auth login`)

## 0.4.0 — 2026-04-08

Pipeline hardening release. Makes theme-forge reliable enough for unsupervised full-store migration runs.

- **State machine**: `.theme-forge/state.json` tracks every section through 6 states (pending, in_progress, completed, completed_code_only, failed, skipped) with atomic write-then-rename persistence
- **Resume protocol**: Kill a run, restart it, picks up where it left off. Stale `in_progress` sections auto-reset after 10 minutes.
- **Lock mechanism**: Session-level lock prevents concurrent runs. Stale locks (>30 min) breakable with `--force`.
- **Error classification**: 7 error classes (css_override_failed, structural_mismatch, missing_asset, schema_incompatible, chrome_mcp_error, liquid_render_error, unknown) with structured error reports and suggested remediation
- **Pipeline flags**: `--full` (all sections), `--force` (break stale lock), `--reset` (reset all to pending), `--reset-failed` (retry failures only)
- **Chrome MCP fallback**: Graceful degradation to code-only analysis when Chrome MCP is unavailable, with `completed_code_only` status
- **Configurable retry budget**: `default_retry_limit` in config (default 3), `computed_style_match_threshold` (default 85%)
- **Status command upgrade**: Shows pipeline lock state, failed section details with error class and remediation, state.json as primary data source
- **Onboard .gitignore**: Auto-adds `.theme-forge/` to `.gitignore` during onboard
- **Config version fix**: defaults.json version corrected from 0.1.0 to 0.3.1

## 0.3.1 — 2026-04-08

- Add gstack skill routing to CLAUDE.md for automatic skill dispatch

## 0.3.0 — 2026-04-07

Efficiency release — focused on one-shotting sections.

- **Learnings system**: `.theme-forge/learnings.json` accumulates knowledge from every correction. When a fix requires retry or the user corrects an approach, the pattern is captured and applied proactively on future sections. Includes confidence levels, scoping (universal/project/theme), and cross-project portability.
- **Computed style diff**: Structured JavaScript extraction that pulls all visual CSS properties from both live and dev sites in one pass, producing a severity-rated diff table. Replaces ad-hoc inspection.
- **Resolved CSS in scan**: `scan` now pre-resolves all Liquid template variables in section CSS against `settings_data.json`, eliminating manual cross-referencing during pull.
- **!important guardrails**: !important usage is learning-driven, not default. Each use must trace to a specific learning with a documented trigger. Code comments reference the learning ID.
- Seed learnings created on onboard (3 universal rules)

## 0.2.0 — 2026-04-07

- New command: `reconcile` — detects work already done on in-progress migrations, creates report stubs with completeness tiers (Done/Mostly done/In progress/Scaffolded/Not started)
- `pull-section` now accepts `--page <template>` and `--url <live-page-url>` arguments for page context
- `review` now supports accepted variances — "close enough" decisions persist across sessions and don't create noise on future reviews
- Total commands: 13 (was 12)

## 0.1.0 — 2026-04-07

Initial release.

- Core commands: `onboard`, `scan`, `map-section`, `pull-section`
- Compound commands: `map-page`, `pull-page`, `pull-header`, `pull-footer`
- Utility commands: `review`, `status`, `upgrade`
- Setup script with global and project-level install modes
- Platform detection: Claude Code, Cowork, OpenClaw
- Auto-update mechanism via GitHub version checking
- JSON-based reporting in `.theme-forge/` project directory
