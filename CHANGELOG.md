# Changelog

## 0.16.4 — 2026-04-14

**`/theme-forge dev-server` sub-command — deterministic dev server management.**

Observed in semarang workspace: user asked agent to restart dev server, agent ran `shopify theme dev --port 9294` directly instead of using `scripts/dev-server.sh`. The "NEVER run shopify theme dev directly" rule existed but was ignored because there was no `/theme-forge dev-server` command to route to.

- **New sub-command**: `/theme-forge dev-server start|restart|stop|status|cleanup` routes to `scripts/dev-server.sh`.
- **Command routing**: added dispatch rule #6 (dev-server → shell script) and #7 (natural language "restart server" → dev-server restart).
- **CLAUDE.md routing**: "restart dev server, server down, server clobbered" → `theme-forge dev-server`.
- **Strengthened safety rule**: now explicitly mentions `/theme-forge dev-server start` as the command to use and adds "If you find yourself typing `shopify theme dev`, STOP."

## 0.16.3 — 2026-04-14

**Hard gate: no ad-hoc fixes after pull completion.**

Observed in perth workspace: agent completed pull-section correctly, then made a follow-up `fix:` commit tweaking CSS and settings without running refine-section. No variance reports, no experiment loop, no verification. The "recommend refine-section" rule was too soft.

- **Hardened pull-section hard rule**: "No ad-hoc fixes after pull completion — use refine-section." After pull-section commits, the agent is DONE. Visual issues are variances for refine-section, not ad-hoc fix commits.
- **Step 9 explicit stop**: added "Do NOT attempt to fix remaining variances yourself" with explanation of why ad-hoc fixes break the audit trail.

## 0.16.2 — 2026-04-14

**Fix dev-server.sh cross-workspace clobbering.**

### Fixed: dev-server restart no longer kills other workspaces' servers

`find_dev_process` now matches on `--path` in addition to `--port` and `--theme`. Previously,
two workspaces sharing the same development theme could claim each other's processes. A `restart`
in workspace B would kill workspace A's server.

- `find_dev_process` takes optional `path` arg, greps for `--path $PROJECT_ROOT` in process args
- `find_port_process` now returns the `--path` value (identifies which workspace owns a port)
- New `find_port_theme` extracts the `--theme` value (split from old `find_port_process`)
- `cmd_restart` refuses to kill a process belonging to a different workspace; falls back to
  `cmd_start` which finds a new port
- `cmd_stop` and `cmd_cleanup` pass `$PROJECT_ROOT` to path-matched process lookup
- `clear_dev_fields` now includes `dev_pid`
- All output paths (start, reconnect, restart) emit `DEV_PID`

## 0.16.1 — 2026-04-13

**Eng review fixes for settings/app variance detection (PR #71 follow-up).**

Addresses 15 findings from eng review + Codex outside voice on the 0.16.0 changes.

### find-variances: Step 4.3 rewrite (behavior-first)
- **Behavior-first comparison**: run the same JS probe on both live and dev sites, compare results directly. Theme-agnostic: doesn't matter what settings are called in each theme's schema.
- **Combined probe**: single `browser.evaluate()` call returns settings behavior + app integrations. Cuts browser round-trips by 2/3.
- **Two-pass app detection**: first searches inside section container, then searches page-level for app widgets near the section's bounding box. Catches apps injected as siblings.
- **site-inventory.json cross-reference**: reads known apps from onboard inventory as primary detection, falls back to hardcoded selector list.
- **Normalized element capture**: app variances use structured `{ tagName, className, id, dataAttrs }` instead of inconsistent strings.
- **Deduped selectors**: reviews and loyalty no longer share overlapping Okendo selectors.
- **Per-breakpoint visibility**: app variances only include breakpoints where the app is actually visible on live.
- **Stronger test conditions**: settings verification checks multiple behavioral signals (image count + slider + dots + arrows), not just one scalar.
- **Dev server health check**: probes fail loudly if either site is unreachable, preventing false "zero variances" results.
- **Merge rules**: settings/app variances follow standard ID format and stale/update contract.
- **Source of truth clarified**: probes are the detector, `templates/{page}.json` + `settings_data.json` inform fix hints only.

### pull-section: App migration reorder
- **Preference order**: enable app block in template JSON (simplest) > enable app embed in settings_data.json > scaffold with custom-liquid (last resort).
- **base-cache fallback**: if `.theme-forge/base-cache/config/settings_data.json` is missing, fetches it from the live theme automatically.

### refine-section: fix_hint wiring
- **Step 2.1 reads fix_hint**: if a variance has a `fix_hint` field, uses it as starting hypothesis instead of inspecting DOM from scratch.

## 0.16.0 — 2026-04-13

**App integrations must be migrated, not parked. Settings-level variance detection.**

Two changes that close the gap where pull-section/find-variances missed structural and functional differences on product pages (and other pages with app integrations).

### pull-section: App integration migration rules
- **App integrations are no longer valid skip/cutover reasons.** If an app is running on the live store, it must be brought to the dev theme. Star ratings, payment installments, loyalty points, wishlists — these are open variances, not cutover items.
- **Three-step process**: enable app block > enable app embed in `settings_data.json` > scaffold with custom-liquid (last resort). Theme-forge uses dev themes on the same store, so installed apps work on all themes.
- **Only valid cutover items**: apps requiring paid plan upgrades for multi-theme, store-level merchant authorization, or DNS/domain changes at go-live.
- New variance types: `app_integration` (structural) and `settings` (layout/presentation).

### find-variances: Settings-level comparison (Step 4.3)
- **New step** compares live vs dev site behavior using JS probes. Catches layout mismatches CSS extraction misses: image gallery mode (grid vs slideshow), column counts, media presentation, product grid density, feature toggles.
- **App integration detection** scans live site for app-rendered elements (star ratings, payment terms, wishlists, loyalty widgets, size guides) and creates structural variances when they're missing on dev.
- New variance fields: `fix_hint` (which JSON settings to change), `source: "settings_comparison"` and `source: "app_detection"`.

## 0.15.5 — 2026-04-13

**Fix dev-server.sh: look up existing themes by name to prevent session clobbering.**

- **Fix**: Before creating a new unpublished theme, the script now runs `shopify theme list --json` and looks for an existing `[TF] <repo> / <branch>` theme matching the current branch. If found, reuses that theme ID and syncs files to it instead of creating a duplicate.
- This prevents a 3rd parallel session from creating a new theme and clobbering an existing session's port/process.
- Theme naming convention: `[TF] <repo-name> / <branch-name>` (e.g., `[TF] gldn-hrzn4 / pull-megamenus`).

## 0.15.4 — 2026-04-13

**Fix dev-server.sh: correct flag for unpublished theme naming.**

- **Fix**: Use `--theme` (not `--name`) to name unpublished themes. `--name` doesn't exist in Shopify CLI. `--theme` accepts a name string when combined with `--unpublished`. Tested and confirmed on CLI 3.77 and 3.93.
- Theme names use branch name: `[TF] <branch>` for easy identification in Shopify admin.

## 0.15.3 — 2026-04-13

**Fix dev-server.sh: unpublished theme creation + PID lifecycle tracking.**

- **Fix**: `shopify theme push --unpublished` now passes `--name` for non-interactive mode. Without it, parallel session isolation silently failed.
- **PID tracking**: Dev server PID is stored in `config.json` (`dev_pid`). On reconnect, the script checks `kill -0 $pid` first (fast, exact), falling back to `ps aux` grep only if PID is missing or stale. Dead PIDs trigger fresh start with port scan.
- All subcommands (`start`, `stop`, `restart`, `status`, `cleanup`) now emit `DEV_PID` in machine output and persist it in config.

## 0.15.2 — 2026-04-13

**Responsive spacing guardrails for refine-section CSS overrides.**

### New hard rule: No hardcoded pixel values for layout spacing

CSS overrides for padding, margin, gap, and column-gap must use `clamp()` with viewport-relative
preferred values, not fixed pixels. Values measured at 1440px (e.g., `padding-inline: 96px`)
don't scale down. At 1024px, fixed spacing consumes a disproportionate share of available width,
crushing content columns. Formula: `clamp(floor, (live_px / 1440 * 100)vw, live_px)`.

### New verification gate: Cross-breakpoint check for layout CSS overrides

Step 2.3 VERIFY now includes a cross-breakpoint check (item 5) that runs after any layout CSS
override passes at the primary viewport. Extracts column widths, gap, and spacing ratio at
1024px and 768px. Fails if content columns drop below 250px or spacing exceeds 40% of section
width. On failure, reverts the change and redirects to a clamp()-based approach.

### Updated approach table: Layout spacing variances

Step 2.1 HYPOTHESIZE now includes a spacing-specific table showing correct clamp() patterns
alongside the existing height mechanism table. Provides the conversion formula and common
examples (padding-inline, column-gap, margin-inline).

## 0.15.1 — 2026-04-13

**Two-axis multi-resolution probe for accurate responsive classification.**

### Fixed: Multi-resolution probe now varies both width AND height

The old probe only varied viewport width (1024, 1440, 1920) while keeping height constant.
This meant it could confirm `width-relative` sizing (vw, %) but could not distinguish
`fixed` from `viewport-height` (vh, svh, dvh), since both show constant element height
when only viewport width changes.

The probe now runs two sweeps:
- **Width sweep** (1024×900, 1440×900, 1920×900): detects width-relative scaling
- **Height sweep** (1440×600, 1440×900, 1440×1200): detects viewport-height scaling

Classification uses a 2D matrix: width-ratio constant + height constant = `width-relative`,
width constant + height-ratio constant = `viewport-height`, both constant = `fixed`, etc.

Probe data structure updated from flat keys (`"1024"`, `"1440"`, `"1920"`) to nested
`width_sweep` and `height_sweep` objects. refine-section reads `responsive_type` and
`classification` only, so no downstream changes needed.

## 0.15.0 — 2026-04-13

**Decouple pull-section from refine-section, add user-provided variance priorities, new refine-page command.**

### Changed: pull-section no longer auto-invokes refine-section

pull-section now completes after its first-pass fixes and reports remaining variances with
status `needs_refinement`. The user decides whether to run refine-section separately.
This saves tokens on sections that are close enough on the first pull.

Step 9 changed from "Hand Off to refine-section (MANDATORY)" to "Report & Recommend".
Step 10 now accepts `needs_refinement` as a valid final status when open variances remain.

### New: User-provided variance priorities (refine-section)

refine-section now accepts `--variances "element:property, ..."` to specify which variances
matter most to the user. These are marked with `priority: "user"` and sort to the top of
the queue (above visibility, structural, layout, etc.). find-variances still runs to discover
all variances, but user-provided ones are processed first.

Dedup rule: if find-variances independently discovers a user-specified variance, the existing
entry's priority is upgraded rather than creating a duplicate.

### New: refine-page command

`/theme-forge refine-page [page-path]` runs refine-section on all sections of a page that
have status `needs_refinement`. Similar to pull-page but for the refinement pass. Supports
`--variances` flag (applied to all sections). Commits and pushes after each section.

### Changed: pull-page reports needs_refinement count

pull-page Step 5 now reports `sections_completed` and `sections_needs_refinement` separately,
and recommends `/theme-forge refine-page` when sections need refinement. Step 3 skips
sections with `needs_refinement` status (refinement is a separate step).

## 0.14.0 — 2026-04-13

**Three fixes to refine-section and find-variances to prevent CSS mapping failures.**

Root cause: the hero banner about page migration produced invisible text because (1) height
was mapped using wrong CSS units, (2) conflicting global CSS rules weren't detected, and
(3) the verification system trusted computed styles without checking visual visibility.

### New: Height Mechanism Extraction (find-variances)

When a layout variance involves height, find-variances now inspects `document.styleSheets` on
the live site to discover the **authored CSS rule** (e.g., `padding-top: 38%` vs `height: 60vh`).
The mechanism is stored in a new `height_mechanism` field on the variance entry with a
`responsive_type` classification: `width-relative`, `viewport-width`, `viewport-height`,
`aspect-ratio`, `font-relative`, or `fixed`.

refine-section reads `responsive_type` to choose the correct fix approach. A `width-relative`
height (like `padding-top: 38%`) maps to `aspect-ratio` or `padding-top %`, never to
`section_height_custom` (which produces `svh` units).

### New: Cascade Pre-flight Check (refine-section Step 2.1.5)

Before applying a CSS change, refine-section now scans the existing override file for
conflicting rules on the same element or its ancestors/descendants. Detects min/max conflicts,
`!important` clashes, and `overflow: hidden` risks. If a conflict is found, the hypothesis is
adjusted before the edit, not after a failed verification.

### New: Visual Visibility Gate (refine-section Step 2.3 + find-variances)

After each property test passes, refine-section now runs a visibility check on all text elements
in the section. If any text element is invisible (clipped by `overflow: hidden`, zero-size,
`opacity: 0`, `display: none`), the change is treated as a REGRESSION and reverted.

find-variances also runs the visibility check during extraction and creates variance entries for
text that's visible on the live site but invisible on dev. These visibility variances are a
**hard gate** — they block the section from being marked complete.

Step 3 (Final Verification) adds a Screenshot Diff Gate that catches structural visual mismatches
(e.g., text overlay visible on live but missing on dev) even when all individual property tests pass.

### New: Multi-Resolution Probe (find-variances Step 4.5)

When layout variances exist, find-variances now extracts bounding boxes at 3 viewport widths
(1024px, 1440px, 1920px) to empirically classify responsive behavior. If height/width ratio is
constant across sizes, it's width-relative. If height is constant, it's fixed. This corroborates
the source CSS inspection and serves as fallback when `document.styleSheets` is inaccessible
(cross-origin). Probe data stored on the variance entry alongside `height_mechanism`.

### Changed: Responsive-First Queue Ordering

Variance queue priority reordered: visibility > structural > layout > setting > css > content.
Layout variances (height, responsive behavior) are now fixed BEFORE typography details. This
establishes the responsive skeleton first so subsequent fixes aren't invalidated by height or
overflow changes.

### Rendered Output Validation additions

- Check 19: Text visibility (hard gate)
- Check 20: Height mechanism extraction

## 0.13.0 — 2026-04-13

**Migrate from Playwright MCP to Playwright CLI for deterministic screenshots.**

### New: `scripts/screenshot.sh`

Deterministic screenshot capture script — one command, all three breakpoints, no agent discretion.

```bash
eval "$(scripts/screenshot.sh capture --url <url> --selector '#section-id' --out .theme-forge/tmp/capture)"
```

What the script handles:
- **Hardcoded viewports**: Desktop 2560x1440 (2x previous resolution), Tablet 768x1024, Mobile 375x812. Agents cannot override.
- **Section targeting**: CSS selectors or numeric indices. Scrolls into view automatically.
- **Popup dismissal**: Attentive, Klaviyo, Privy popups removed on live sites (not dev URLs).
- **Validation**: Screenshots must be >10KB. Auto-retries once on blank/broken captures.
- **Machine-parseable output**: `CAPTURE_STATUS=ok`, `CAPTURE_DESKTOP=path`, etc.
- **JS eval at breakpoints**: `screenshot.sh eval --url <url> --js <expr> --breakpoint tablet` for find-variances extraction.

### Why: Playwright CLI over MCP

- **4x fewer tokens**: CLI writes snapshots to disk; MCP streams them into context (~114k vs ~27k tokens/task).
- **Deterministic**: Shell commands, not MCP tool calls. Same philosophy as `dev-server.sh`.
- **Higher resolution**: Desktop screenshots at 2560px wide (was 1280px). 4x more pixel data for variance detection.
- **No MCP dependency**: One fewer daemon to manage.

### Updated skills

- `capture/SKILL.md` — fully rewritten to use `screenshot.sh`. All MCP/gstack paths removed.
- `find-variances/SKILL.md` — extraction via `screenshot.sh eval` instead of `mcp__playwright__browser_evaluate`.
- `refine-section/SKILL.md` — updated prerequisites.
- `pull-section/SKILL.md` — updated file path references.
- `onboard/SKILL.md` — detects Playwright CLI instead of MCP. Updated gitignore entries.
- `SKILL.md` (orchestrator) — updated architecture description and gitignore.

## 0.12.1 — 2026-04-13

**Fix: dev-server.sh path resolution + script discovery pattern across all skills.**

- `scripts/dev-server.sh` now accepts `--path <project-root>` argument. Previously resolved PROJECT_ROOT from script location (`dirname "$0"`), which broke when the script was installed globally at `~/.claude/skills/theme-forge/scripts/`. Now uses `--path` arg > `pwd` > error with clear message.
- All skills (pull-header, pull-footer, pull-page, pull-section, onboard) updated with script discovery pattern: try project-local first (`git rev-parse --show-toplevel`), fall back to global install.
- All skills now include explicit "if the script fails, STOP" gate. Agents were continuing workflows without a running dev server and finding phantom errors.
- Script outputs `DEV_STATUS=error` and `DEV_ERROR=config_not_found` on failure for machine-parseable error detection.

## 0.12.0 — 2026-04-13

**Deterministic dev server script + hard gates for find-variances/refine-section.**

### New: `scripts/dev-server.sh`

The Dev Server Protocol was 200 lines of SKILL.md prose that agents could misread or skip. Now it's a shell script with subcommands: `start`, `stop`, `restart`, `cleanup`, `status`. Machine-parseable KEY=VALUE output on stdout. Agent usage: `eval "$(scripts/dev-server.sh start)"`.

What the script handles:
- **Safety**: Verifies theme role via `shopify theme info --json`. Hard blocks live/demo themes.
- **Parallel isolation**: Detects existing dev servers via `ps aux`. First session uses `[development]` theme; additional sessions auto-create unpublished themes named `[TF] <worktree>`.
- **Port discovery**: Scans 9292-9299 for first available port.
- **Reconnect**: If config has `dev_port` and the process matches, outputs existing session info without restarting.
- **Cleanup**: Stops server, deletes unpublished theme if created, scans for orphaned `[TF]` themes (Shopify 99-theme limit).
- **URL capture**: Parses preview and editor URLs from Shopify CLI output, writes to config, presents to user.

### Hard gates for find-variances and refine-section

Audit of a parallel agent session showed it had access to the new skills but never invoked them. Added blocking gates:
- **Top-level hard rules**: "find-variances is MANDATORY" and "refine-section is MANDATORY" — agents running inline `getComputedStyle()` extraction are told to STOP
- **Step 4.3 gate**: Marked MANDATORY with warning that Steps 5-10 will block without it
- **Step 5 gate**: Pre-condition check — no `variances` array → STOP
- **Step 9 gate**: MANDATORY handoff to refine-section for open variances
- **Step 10 gate**: Report without `variances` array is INVALID

### Safety rule: never run `shopify theme dev` directly

Added explicit NEVER rules to orchestrator and pull-section: always use `scripts/dev-server.sh`, never invoke `shopify theme dev` manually. Bypassing the script skips live theme checks, parallel isolation, and port management.

### SKILL.md reduction

Orchestrator Phase 3 went from ~200 lines to ~20 lines referencing the script. Sub-skills use a single `eval` call.

## 0.11.1 — 2026-04-12

**Thread-safe dev server management.**

Parallel agent sessions were stepping on each other's dev servers. One session would start a server on a port already used by another, or kill/restart the wrong process. The root cause: no session owned its port, and servers were started without `--theme` flags.

### Dev Server Protocol

New protocol in the orchestrator that all skills reference:

- Each session finds an open port (9292-9299) and starts with both `--theme` and `--port` flags. The port + theme ID pair is saved to `.theme-forge/config.json` in the session's worktree.
- Restarts match by port + theme ID (not PID). If the user manually kills/restarts the server, the agent reconnects cleanly.
- If an unexpected theme is on the session's port (another agent took it), the agent escalates instead of killing it.
- Preview URL and theme editor URL are captured from Shopify CLI output, saved to config, and presented to the user after every start/restart.

### Config additions

New fields in `.theme-forge/config.json`: `dev_port`, `dev_url`, `dev_preview_url`, `dev_editor_url`.

### Updated skills

- **orchestrator**: Phase 3 rewritten with full Dev Server Protocol
- **pull-header**: Step 2 references Dev Server Protocol
- **pull-footer**: Step 2 references Dev Server Protocol
- **pull-page**: Step 0.8 references Dev Server Protocol (removes fixed per-page port assignment)
- **onboard**: Step 4 rewritten to start server via protocol, config schema updated

## 0.11.0 — 2026-04-12

**New `/find-variances` skill: structured variance discovery with test conditions.**

Variance discovery was scattered across pull-section Steps 4-8 with no persistent artifact, no user input channel, and no per-variance test conditions. The agent thrashed because it re-discovered variances each iteration and improvised its verification checks.

### New skill: find-variances

Extracts computed styles from live and dev sites at all 3 breakpoints, compares property-by-property, runs the full 18-check rendered output validation, and writes a structured variance array to the section report.

Each variance entry includes:
- Stable ID (`{element}:{property}:{breakpoint}`) for merge-not-replace semantics
- Structured test condition (`{selector, property, expected}`) with optional JS escape hatch
- Shadow DOM metadata (host tag, discovered custom properties)
- Type classification (structural, setting, css, layout, content)
- Status tracking (open, fixed, escalated, accepted)
- Attempt history (logged by refine-section)

### Shadow DOM custom property auto-discovery

When extraction finds elements inside Shadow DOM boundaries, find-variances scans the host component's stylesheets for `var(--xxx)` usage and maps discovered properties to CSS property names. Confidence levels (high/medium/low) indicate reliability.

### Test condition correction learning loop

When a test says PASS but the user reports the variance still exists, the corrected test condition is saved as a learning. Future find-variances runs apply corrections to generate better tests for similar elements.

### Integration changes

- **capture/SKILL.md**: Extraction JS and `--extract-styles` flag removed. Screenshots only.
- **pull-section/SKILL.md**: Step 4 calls capture (screenshots) then find-variances (extraction). Step 8 calls find-variances for re-extraction. Step 10 reads variance array for final gate. Rendered output validation checklist moved to find-variances.
- **refine-section/SKILL.md**: Step 1 reads variance array from section report as work queue. Step 2.3 executes structured test conditions from variance entries (no improvised JS). Step 3 calls find-variances for full re-extraction with merge semantics.

### Flags

- `--force` — bypass live extraction cache
- `--add "description"` — add a user-defined variance interactively

### Live extraction caching

Live site values are cached in the section report. Only dev values are re-extracted on subsequent runs, cutting per-iteration verify time in half.

## 0.10.3 — 2026-04-11

**New `/refine-section` skill: Karpathy autoresearch experiment loop for closing extraction FAILs.**

The semarang agent batched 5 unrelated CSS changes per commit, used wrong selectors, extracted from the wrong product, and wrote zero learnings across 6 iterations. The existing pull-section rules (one-at-a-time, DOM inspection, learnings) were scattered across Steps 5-9 as guidelines. The agent read them as a waterfall and batched anyway.

### New skill: refine-section

Modeled on [Karpathy's autoresearch](https://github.com/karpathy/autoresearch). A tight experiment loop where the structure enforces the rules:

1. **Build variance queue** from extraction FAIL rows, prioritized: structural → settings → CSS
2. **Loop per variance**: hypothesize (inspect DOM, choose simplest approach) → apply ONE change to ONE file → verify (re-extract computed style) → accept (commit) or revert → log learning
3. **Final verification**: re-extract ALL properties to catch regressions
4. **Report**: experiments run, passed, failed, escalated

Hard rules enforced by the loop structure, not guidelines:
- One change per iteration (loop enforces it, you verify before next)
- Git as state machine (commit each PASS, revert each REGRESSION)
- Settings > CSS custom properties > CSS class overrides (simplicity criterion)
- 3 failed attempts on same variance = escalate, don't thrash
- Learning entry after every experiment, success or failure
- No positional selectors, same product URL for live/dev

### Auto-handoff from pull-section

pull-section Step 9 now auto-invokes refine-section when FAIL rows remain after Step 8. The old manual Step 5→8 loop is superseded by the experiment loop for variance closing.

## 0.10.2 — 2026-04-11

**Anti-thrash: no positional selectors, extraction consistency, iteration limits.**

The semarang agent thrashed through 6 product page iterations (v2→v3→v4→v5→revert), each time writing large CSS blocks with positional selectors (`:nth-child(2)`) that broke on products with different variant counts. Zero learnings written across all iterations. Extraction data was from a different product than the one being compared visually.

### No positional CSS selectors for variant options
Banned `:first-child`, `:nth-child(N)` for targeting variant option types. These break when products have different numbers of options. Must use option-name-based selectors (`[data-option-name="Material"]`) instead. CSS must work across all product variant configurations.

### Extraction consistency
Live and dev style extractions must be from the SAME product URL. Record which product was extracted in the report. Contradictory extraction data (dark ATC in extraction, light in screenshots) usually means wrong product.

### Thrash loop prevention
If you revert a commit, STOP and escalate — don't try v6 after reverting v5. Before each iteration, review the previous diff and explain why it failed. 3 iterations maximum on the same section before mandatory escalation.

### One change at a time (Step 6)
Apply ONE CSS fix, save, wait for hot-reload, verify visually, then move to the next fix. Do not batch multiple unrelated CSS changes — when something breaks you can't isolate the cause. The v5 regression bundled swatch circles + side-by-side layout + 6-col grid + ATC color + installments into one commit.

### Iteration limit refined
Changed from "3 iterations maximum on a section" to "3 failed attempts at the SAME variance." The autoresearch loop means many small successful changes — the limit should catch thrashing at one problem, not cap total forward progress.

### Learnings after every fix attempt
Learnings are mandatory after every fix attempt (successful or not), not just after completion. Six iterations with zero learnings is a critical failure.

## 0.10.1 — 2026-04-11

**DOM inspection before CSS, settings-first, selector verification loop.**

The semarang product page agent wrote CSS with correct values but wrong selectors. Its own extraction data proved none of the overrides were taking effect (title 32px not 28px, price weight 500 not 300, variant labels 16px not 12px) but it marked the section complete anyway. Three changes:

### Mandatory DOM inspection (new Step 5.5)
Before writing ANY CSS override, inspect the actual rendered DOM on the dev site. Horizon uses web components and Shadow DOM — the rendered DOM differs from `.liquid` source. Discover the correct selector, check for Shadow DOM boundaries, find CSS custom properties. Record the verified selector in the transcript before writing CSS.

### Settings-first enforcement (Step 5.5 + Step 6)
Before writing a CSS override, verify the value isn't controlled by a JSON setting. If a setting exists, change the setting — don't override it with CSS. Example: `variant_button_width: "equal-width-buttons"` in settings fights CSS swatch overrides. Change the setting first. Step 6 priority order updated: JSON settings → CSS custom properties → stylesheet → extension CSS → inline styles.

### Wrong-selector detection (Step 8)
If extraction shows a FAIL row with the SAME dev value as before the fix, the selector is wrong. Hard rule: do NOT retry with the same selector. Go back to Step 5.5 and re-inspect the DOM. Switch to CSS custom properties or JSON settings when Shadow DOM blocks the selector.

## 0.10.0 — 2026-04-11

**Anti-skip enforcement: every section gets attempted, no self-approved variances.**

The semarang product page run completed 2/6 sections in 8 minutes — the agent classified 4 sections as "requires custom section" and skipped them without user approval. It also self-accepted 6 variances and never checked tablet/mobile. Three enforcement changes:

### pull-page: no self-skipping (Step 2 + Step 3)
Hard rule: every section gets attempted. `requires_customization` and `incompatible` describe the approach (build a custom section), not a reason to skip. The only valid skip reasons are app embeds or explicit user approval via `AskUserQuestion`. Report validation now also checks responsive breakpoints and flags unauthorized skips.

### pull-page: completeness gate (new Step 3.5)
Before full-page comparison, verify coverage: count completed sections, flag gaps, escalate if <80% complete, and do a below-fold audit to catch missed content that has no section work at all.

### pull-section: "requires custom section" = build it
New hard rule: if a section needs a custom section, build the custom section. Create the `.liquid` file, schema, CSS, register in template JSON. `status: "skipped"` with reason "requires custom section" is a bug. Below-fold content (collapsible details, trust badges, recommendation carousels) is not optional.

## 0.9.9 — 2026-04-11

**Tighten asset migration: referenced-only, no third-party CSS, smoke test.**

The semarang scan's asset migration (Step 5.9) copied 38 base theme assets — all images, all fonts, and third-party CSS. The bulk copy caused transient 502 errors while the dev server synced, and the "copy everything" approach risks future conflicts from third-party CSS with global selectors. Four guardrails added:

1. **Referenced-only policy**: Images and fonts are now copied ONLY if referenced by migrated code (`asset_url`, `@font-face`). No more "copy all images" or "copy all fonts" — reduces unnecessary files and sync time.
2. **Third-party CSS banned**: Full CSS files from integrations (Beam, Yotpo, etc.) are NEVER copied — they contain global selectors, resets, and layout rules that can conflict with the target theme. Added to cutover checklist instead; apps should load their own CSS via CDN.
3. **Mandatory smoke test**: After copying assets, the agent must screenshot the dev site and verify it still renders before committing. Would have caught the transient 502s and prevented false alarm.
4. **SVG font detection**: SVG files are now inspected — icon font SVGs (with `<glyph>` elements) are classified as fonts, not images.

## 0.9.8 — 2026-04-11

Three improvements from validating the bangalore scan PR.

### Functional template format rule (scan Step 4.5)
Hard rule: functional/redirect templates MUST have `target_format: "liquid"`. The bangalore scan incorrectly marked 25 AJAX endpoints as `"json"` — these don't use Shopify's JSON section architecture and would break if converted.

### Broken asset reference checks (scan Step 5.8)
After copying snippets to the target theme, scan for `{{ '...' | asset_url }}` calls and verify each file exists in target `assets/`. Copy from base-cache if found, add to cutover if not. Shopify CDN URLs are case-sensitive (`Logo.png` ≠ `logo.png`).

### Asset migration (scan Step 5.9)
New step: classify every base theme asset and copy what's needed. Images (favicons, icons) and fonts (brand/icon fonts) are store-specific and get copied. Third-party assets get copied if referenced by migrated snippets. Base theme CSS/JS/Liquid/SCSS are skipped — the target theme replaces them. Dependency-driven, not bulk copy.

## 0.9.7 — 2026-04-11

**Template migration map + enumerate from base theme, not target.**

### Template migration map (scan Step 4.5)
Scan now classifies every base template into one of five types: `page`, `alternate`, `functional` (AJAX endpoints), `redirect`, and `app-artifact`. For each template, traces the full dependency cascade: template → sections → snippets → blocks → assets. Saves to `.theme-forge/template-map.json`. This drives everything downstream — `--full` uses it to enumerate work, `pull-page` uses it to know dependencies.

### Enumerate from base theme
The `--full` Phase 5 was listing templates from the target theme's `templates/` directory. But the target starts mostly empty — the base (live) theme has the templates that need migrating. Now enumerates from `template-map.json`. Functional templates (AJAX endpoints, redirects) are copied first with their dependencies. Page templates get the full pull-page treatment. Nothing is skipped — customers/*, gift_card, password all get migrated.

## 0.9.6 — 2026-04-11

Four new capabilities for third-party integrations, navigation, and search.

### App embeds inventory + migration (scan Step 5.7)
The scan now inventories every app embed from the base theme's `settings_data.json` (tracking pixels, review widgets, search overlays, loyalty programs, form embeds — everything in the App Embeds panel) and copies them to the target theme. Saves an `app-embeds.json` inventory with migration status. App embeds only activate when the corresponding app is installed on the store, so they're inert on dev but ready for production.

### Layout audit for third-party scripts (scan Step 5.8)
Compares base vs target `layout/theme.liquid` for custom scripts, meta tags, snippet render calls, and app sections. Shopify-managed hooks (`content_for_header`) auto-migrate, but manually added scripts (GTM, chat widgets, A/B tools) and custom snippets need explicit copying. Results saved to `site-inventory.json`.

### Search provider migration (pull-header)
Detects if the live site uses a third-party search provider (Searchspring, Algolia, Klevu, etc.) via theme snippets, assets, or app embeds. If found, copies the integration files and documents what needs the app installed. If native search, configures visibility and style to match the live site.

### Mega menu build-out (pull-header)
Pull-header now replicates the live site's mega menu structure instead of just matching visual styles. Configures featured products/collections, column layouts, image settings, mobile drawer behavior, and menu depth. Verifies every top-level nav item renders correctly on both live and dev.

## 0.9.5 — 2026-04-11

Three fixes from observing the bangalore pull-page-index run.

### Extraction FAIL = must fix (new hard rule)
The agent was rationalizing away extraction failures. The hero section had `text-align: center` on live and `left` on dev — a clear FAIL — but the agent called it a "measurement artifact" because "the container is narrow so they look the same." New hard rule: extraction FAIL rows are binding. You fix them or escalate. No reclassifying as "visually equivalent."

### Learnings: per-section files instead of single JSON
`learnings.json` was a single array that parallel sessions both append to — guaranteed merge conflicts. Now learnings are stored as one file per section in `.theme-forge/learnings/` (e.g., `learnings/header.json`, `learnings/hero-1_index.json`). Two sessions working different sections create different files, so git merge succeeds without conflicts. Old-format `learnings.json` files are auto-migrated on read.

### Branch visibility: push immediately after creation
The agent was creating `pull-page-{page}` branches but not pushing them to remote until after the first section completed. This meant the user couldn't see diffs in VS Code or track progress. Now the branch is pushed with `-u` immediately after creation, before any work starts.

### `--full` is now a one-shot pipeline
Previously, `--full` required the user to manually onboard, run scan, start the dev server, and pull globals before it would work. Now it handles every prerequisite automatically:

- **Auto-onboard**: If `.theme-forge/config.json` doesn't exist, runs the full onboard flow (collects dev store domain, detects capabilities, writes config, sets up gitignore).
- **Auto-scan**: If global maps (`settings-map.json`, `class-map.json`) are missing, runs `scan --apply-globals` to inventory the site and apply global settings (logo, fonts, colors).
- **Auto-dev-server**: Detects if a Shopify dev server is running for this theme. If not, starts one on the first available port (9292-9295).
- **Ordered page pulls**: After header + footer, pulls pages in priority order (index → product → collection → page → remaining). Template alternates pulled after base templates.
- **Idempotent resume**: Every step checks existing artifacts before running. Re-running `--full` after a crash, context limit, or interruption picks up where it left off — no duplicate work.

The goal: install theme-forge, open a target theme, run `/theme-forge --full`, walk away.

## 0.9.4 — 2026-04-11

**Settings migration rubric and expanded base pull.** Two changes that fix the agent's blindness to how base themes work.

### Settings Migration Rubric (new Step 2.1)
The agent was diving straight into JSON and CSS without analyzing what the merchant actually needs from section settings. New Step 2.1 gates all implementation work behind a settings migration table that classifies every base setting into one of six categories:

- **NATIVE** — target has equivalent setting, map directly
- **MAPPED** — target achieves same intent differently (e.g., color schemes vs per-element pickers)
- **CSS-ONLY** — design constant, hardcode in overrides (e.g., "Text Width: 25em", responsive padding)
- **EXTEND** — real authoring need, add custom block
- **CUSTOM-SECTION** — last resort, fork the section (breaks upgradability)
- **DEPRECATE** — implementation artifact, handle programmatically (e.g., "Make it h1?" toggle)

The table is written to the debug transcript for decision evaluation and included as structured data in summary.json and the section report for cross-section auditing.

### Expanded Base Pull
The targeted base pull was only fetching `templates/*` and `config/*`, leaving the agent unable to read base section code, snippets, JS, or block schemas. Now pulls `sections/*`, `snippets/*`, `blocks/*`, `layout/*`, `assets/*.css`, and `assets/*.js`. Pull-section Step 2 now requires reading all `{% render %}` calls, `<script>` tags, and block definitions. Hard stop if base-cache sections are missing.

## 0.9.3 — 2026-04-11

**Third-party form integrations: port the JS, not just the HTML.** The bangalore footer pull preserved the Klaviyo form HTML correctly, but the form doesn't actually work on dev because the AJAX submission JS was never ported. The `data-ajax-submit` attribute needs JavaScript to intercept the submit event, and the success message div needs JS to toggle visibility.

- **Form JS guidance**: New instructions to search the base theme for form handling JS, port it to the custom-liquid block, or add an inline AJAX fallback script. Includes a copy-paste fallback pattern for Klaviyo-style `data-ajax-submit` forms.
- **App embed vs form HTML**: Clarifies that the Shopify app embed (e.g., `klaviyo-onsite-embed`) handles popups/tracking, not the footer form. Both must be preserved, but the form should work independently. App embeds only function if the app is installed on the dev store.
- **pull-footer: form testing step**: Must actually test the email form on dev after pulling. Enter a test email, verify the success message appears inline (not a page redirect).
- **pull-footer: third-party signup checklist**: Three things must all be right: form HTML, form JS, and app embed. Expanded footer gotchas with the full checklist.
- **Fix: gitignore missing entries**: Onboard was creating `.gitignore` with only 3 entries (base-cache, debug, tmp). Missing: `.playwright-mcp/` (Playwright MCP session YAMLs), `.theme-forge/references/` (live reference screenshots), `.gstack/`, and `/*.png` (root-only catch-all for screenshots saved to repo root). The bangalore workspace had 259 untracked files.
- **Hard rule: never save files to repo root**: Screenshots, YAML files, and working artifacts must go in `.theme-forge/` subdirectories. The agent was saving comparison screenshots (`dev-footer-v3.png`, `dev-header-sticky-v4.png`, etc.) directly to the repo root.

## 0.9.2 — 2026-04-11

**Extract first, don't guess: mandatory computed style extraction before writing any code.** The bangalore migration showed pull-section taking 3 rounds per section because it guessed CSS values from source files instead of extracting them from the live browser. Same typography fixes (heading 2.18rem, letter-spacing -0.02em, font-weight 300) were re-derived for every section. learnings.json was completely empty after 5 sessions and 13 variances.

- **New Step 2.75**: Mandatory live-site computed style extraction via browser before writing any settings or CSS. Produces a structured spec table that every subsequent value must trace back to.
- **Custom Section Spec Sheet**: When creating a new `.liquid` section, must produce a spec with every element's exact computed values from extraction before writing code. No guessing font sizes or spacing.
- **Learnings are now a hard rule**: Empty learnings.json after 2+ sections is a red flag. Must write at least one learning per section. Must read and apply learnings before starting each section.
- **Step 8 computed style validation**: Structured comparison table (Property | Live | Dev | Delta | Status) catches sub-pixel differences invisible in screenshots. FAIL rows must be fixed before proceeding.
- **Theme Constants**: After the first section, identify and capture theme-wide values (font weights, letter-spacing, button styles) to learnings.json with `scope: "target_theme"`. Every subsequent section applies them automatically instead of rediscovering them.

## 0.9.1 — 2026-04-10

**Fix section settings mapping: read block schemas, prefer native blocks, respect conditional settings.** The agent was bypassing Horizon's native `menu`, `social-links`, and `email-signup` blocks in favor of `custom-liquid` blobs, and setting typography values that were silently ignored due to `visible_if` conditions.

- **New rule #12**: Prefer native blocks over `custom-liquid`. Only use custom-liquid for third-party integrations or when no native block exists.
- **Step 2 expanded**: Must read `blocks/*.liquid` schemas for every block type used — not just the section's `{% schema %}`. Block settings like `font_size`, `line_height`, `color` have `visible_if` conditions that silently ignore values when conditions aren't met.
- **Gotcha: Block schema settings are conditional**: `text` block typography requires `type_preset: "custom"`. Setting `font_size` with `type_preset: "h2"` does nothing.
- **Gotcha: Native blocks before custom-liquid**: Decision tree for when to use native vs custom-liquid. Real GLDN footer example.
- **Gotcha: Setting values must match schema options**: `font_size` only accepts specific rem values, `line_height` accepts keywords not numbers. Arbitrary values silently fall back to defaults.

## 0.9.0 — 2026-04-10

**Session setup script for Conductor workspaces.** New sessions now start from the latest `origin/main` with pre-flight checks for expected artifacts (config, global maps, Playwright MCP).

- `scripts/session-setup.sh` — fetches origin, checks out main, creates working branch, verifies prerequisites
- Pre-flight checks: `.theme-forge/config.json`, `settings-map.json`, `class-map.json`, `.mcp.json`
- Warns when prerequisites haven't been merged to main yet, with actionable next steps
- For Conductor: set as the workspace Setup Script. For terminal: run `scripts/session-setup.sh [branch-name]`

## 0.8.9 — 2026-04-10

**Better error when config is on another branch.** New workspaces branched from `main` before onboard/scan was merged get a confusing "run onboard" message. Now checks if `.theme-forge/config.json` exists on another branch and tells the user to merge first.

## 0.8.8 — 2026-04-10

**Playwright MCP support as primary browser tool.** Complete rewrite of the capture skill with dual-path architecture: Playwright MCP (preferred) with gstack browse as fallback.

- **Playwright MCP (Path A)**: Stable browser sessions across tool calls, no daemon timeout issues, inline screenshot results, clean JS evaluation without shell escaping. Tested and verified on gldn.com.
- **gstack browse (Path B)**: Preserved as fallback with all existing workarounds (JS-based waits, scroll-triggered dismiss, Attentive/Klaviyo/Privy removal).
- **Install prompt**: When no browser tool is detected, suggests `claude mcp add playwright -- npx @playwright/mcp --headless --caps vision --viewport-size 1280x720 --ignore-https-errors`.
- **Fixed dismiss selector**: Removed `[class*=overlay]` which was too aggressive and deleted legitimate footer/header overlay elements. Now targets only specific popup providers by name/src (Attentive, Klaviyo, Privy).
- **Detection priority flipped**: Onboard now checks for Playwright MCP first, gstack browse second.

## 0.8.7 — 2026-04-10

**Third-party form integration gotcha.** Agent replaced a Klaviyo email signup form (`manage.kmail-lists.com`) with Horizon's native `email-signup` block (Shopify email marketing). Silently breaks all email flows.

- **New gotcha in pull-section**: Third-party forms (Klaviyo, Mailchimp, Omnisend, Drip) must be preserved with exact `action` URL, hidden fields, and input names. Never substitute with native theme blocks.

## 0.8.6 — 2026-04-10

**Fix popup blocking and browse daemon crashes on live Shopify sites.** Complete rewrite of capture timing and popup dismissal. Verified working on gldn.com — clean footer capture with full content visible.

Three root causes fixed:
1. **Shell `sleep` kills the browse daemon.** The daemon has a ~2-3 second idle timeout and shuts down during shell sleeps, producing blank screenshots on subsequent commands. All waits now use JS `Promise`+`setTimeout` to keep the daemon alive.
2. **Popups are scroll-triggered.** Attentive (`attn.tv`) injects a full-viewport iframe only after the user scrolls. The previous flow dismissed popups before scroll, missing them entirely. Now: scroll first → wait for popup injection → dismiss.
3. **The popup was Attentive, not Klaviyo.** The dismiss selector list didn't include `iframe[src*="attn.tv"]` or `iframe[src*="attentive"]`. Now targets Klaviyo, Privy, AND Attentive (the three most common Shopify popup providers).

Changes:
- **Hard rule 3**: Never use shell `sleep` between browse commands — use JS `setTimeout` waits
- **Hard rule 3b**: Do not use `--networkidle` on live Shopify sites (third-party polling breaks it)
- **Step 2**: Simplified to navigate + JS wait (no popup dismissal — moved to after scroll)
- **Step 3**: Scroll to section → JS wait for lazy load + popup injection → dismiss all popups
- **Dismiss selector**: Added `iframe[src*="attn.tv"]`, `iframe[src*="attentive"]`, `script[src*=attentive]`; removes parent elements for iframe-based popups
- **All breakpoint commands**: Rewritten with JS-only waits, dismiss-after-scroll pattern

## 0.8.4 — 2026-04-10

**Blank capture hard stop + footer group gotchas.** Found when bangalore workspace completed pull-footer with a blank live screenshot and skeleton output — the agent silently continued without ever seeing the live site.

- **Operational rule #11**: Blank live screenshot is a hard stop. Must retry once, then escalate. Never proceed without a valid live baseline.
- **Gotcha: Blank or white live capture**: Detailed recovery steps (retry with longer wait, try different selector, escalate via AskUserQuestion)
- **Gotcha: Footer groups have multiple base sections**: Base themes often split footer content across `footer` + `footer_top`. ALL base sections must be mapped and pulled — not just the obvious one.

## 0.8.3 — 2026-04-10

**Dev server startup in pull-header and pull-footer.** Both skills silently fell back to code-only mode (no visual verification) because they never started a dev server. Only pull-page had a dev server step.

- **pull-header**: Added Step 2 — check for running dev server, start one if needed
- **pull-footer**: Added Step 2 — same
- **Git merge strategy**: Added merge points at onboard, scan, header/footer, and per-page completion. All merge points create PRs via `gh pr create` for visibility and conflict handling.

## 0.8.2 — 2026-04-10

**Tool-enforced compliance gates.** The agent can no longer skip screenshots, accept variances, or declare completion without user confirmation. Based on architectural review comparing theme-forge's text-based enforcement with gstack's tool-gated enforcement model.

- **AskUserQuestion gates in pull-section**: Three mandatory tool-enforced stops:
  - Step 4.4: User confirms captures look correct before code changes begin
  - Step 8 escalation: After 2 failed fix attempts, user must choose next action (no silent acceptance)
  - Step 10.5: User approves final result before section is marked complete
- **Escalation protocol**: Agent MUST escalate to user after 2 failed attempts. Only the user can approve a variance (`user_approved: true`). Agent cannot set this flag itself.
- **Report quality validation in pull-page**: After each section, pull-page validates the report (non-empty files_modified, non-empty screenshots, variance math, user-approved acceptances). Flags failures via AskUserQuestion.
- **Batch mode auto-proceed**: In pull-page or --full runs, AskUserQuestion gates auto-select the default option and log the decision. User can review batch-approved sections in the page report.

## 0.8.1 — 2026-04-10

**First-run fixes from real onboarding + pull session.**

- **One-at-a-time onboarding**: Step 1 now asks questions sequentially with A/B multiple choice, not all at once
- **Dev server detection**: Don't assume port 9292 belongs to this theme. Scan for available ports, suggest `--port` flag
- **Base cache git init**: `shopify theme pull` requires a git repo — now runs `git init` before pulling
- **`--only` glob syntax**: Use `'templates/*'` not `templates/`. Shopify CLI uses glob matching
- **Browse tool crash fallback**: `wait --networkidle` kills the browser on some live sites. Falls back to `sleep 3` on `forLoadState` errors
- **Legacy theme support**: Base themes with `.liquid` templates now documented — sections live in `settings_data.json` under `current`, not in JSON template files
- **Client identity scrubbed**: All gldn.com/GLDN references replaced with generic examples
- **Setup script**: Added missing `capture` and `cutover` skills, improved post-install guidance
- **Install hint**: Root SKILL.md now shows clone command for agents encountering the skill before install

## 0.8.0 — 2026-04-10

**Deterministic screenshot capture at all breakpoints.** Extracts screenshot logic from pull-section into a dedicated `capture` skill. Adds mandatory responsive comparison (desktop, tablet, mobile) throughout the entire fix loop, not just final review.

- **New `capture` skill**: Deterministic section-scoped screenshot recipe. Exact browse commands, no agent discretion. Handles navigation, popup dismissal, `wait --networkidle`, and section targeting.
- **Three breakpoints every time**: Desktop (1280), tablet (768), mobile (375) captured together on every screenshot. Responsive bugs caught per-section, not in a surprise final review.
- **Reference screenshots**: Live site captured once per section, stored in `.theme-forge/references/` (committed). Reused across all verification loops and parallel sessions. Manual recapture if live site changes.
- **Simplified pull-section**: ~400 lines of browse tool setup and screenshot code removed. Steps 4, 8, and 10 now invoke the capture workflow. Step 10 no longer needs a separate responsive pass.
- **Computed style extraction per breakpoint**: Style extraction runs at all three viewports, catching responsive-specific variances (layout shifts, font size changes, hidden elements).

### Removed
- Direct browse tool commands from pull-section (moved to capture)
- Shadow DOM screenshot techniques from pull-section (handled by capture)
- Separate responsive comparison pass in Step 10 (always responsive now)

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
