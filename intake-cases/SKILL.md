---
name: intake-cases
description: >
  Ingest a screenshot, CSV, markdown table, or prose description of a template's dynamic renderings ("cases") and produce `.theme-forge/cases/<page>.json`. This is the first command in the multi-case workflow — run it before `--cases` on any verify/refine/find-variances command. Shared sections (header, footer) live in `_shared.json`.
  - MANDATORY TRIGGERS: theme-forge intake-cases, intake cases, define archetypes, add cases, create cases file, multi-archetype setup
---

# intake-cases — Build a Cases File from an Artifact

A single Shopify template (especially `product`) renders N different layouts depending on tags, metafields, product type, or customer state. This skill captures that matrix so `refine-page`, `verify-page`, and `find-variances` can iterate it.

A "case" is one specific rendering: a URL path, a status (active/dormant/draft), and notes. The cases file is the source of truth for the matrix.

## Prerequisites

- `.theme-forge/config.json` must exist (run `onboard` first)
- `.theme-forge/cases/` directory is created by this skill if missing

## Arguments

```
/theme-forge intake-cases <page> [--from <artifact>] [--update <key> --path <new-path>] [--list]
```

- `page` — the template name (`product`, `collection`, `page.about`, `index`, ...) or the literal `_shared` for header/footer/reusable sections. Matches the filename: `.theme-forge/cases/<page>.json`.
- `--from <artifact>` — a path to a screenshot (PNG/JPG), CSV, markdown table, or plain-text description. Optional. If omitted, enters interactive mode.
- `--update <key> --path <new-path>` — in-place edit of a single case's path. Use when a client renames a product handle. Skips the intake parser entirely.
- `--list` — print the current cases file contents. Skips parsing and writing.

## Workflow

### Step 1: Validate inputs

1. `page` is required. If omitted, hard-error:
   ```
   ERROR: intake-cases requires a page name.

   Usage:
     /theme-forge intake-cases <page> [--from <artifact>]

   Example:
     /theme-forge intake-cases product --from ~/Desktop/archetypes.png
     /theme-forge intake-cases _shared --from shared-sections.csv
   ```

2. Derive output path: `.theme-forge/cases/<page>.json`. Create `.theme-forge/cases/` directory if missing.

3. If `--list`, read and pretty-print the existing file, then exit.

4. If `--update`, read existing file, apply the single-key change, write back, show a diff, commit. Skip everything else.

5. If `--from` was provided, verify the artifact file exists. If not, hard-error with the expected path.

### Step 2: Parse the artifact (if `--from` given)

Parse behavior varies by artifact type. Detect by extension.

**Screenshot (`.png`, `.jpg`, `.jpeg`):** Read with the Read tool — it accepts image files and renders them visually. Extract archetype names, product handles, and descriptions from the image. The image might be a wireframe, a whiteboard photo, or a Figma export. Ask the user to confirm ambiguous parses.

**CSV (`.csv`):** Expect columns `key`, `path`, `status`, `notes` (case-insensitive headers). If columns are missing, ask the user how to map them. Example:
```csv
key,path,status,notes
full_personalizer,/products/thames-pinky-ring,active,engraving + illustration
tag_personalizer,/products/birth-flower-disk-necklace,active,add-a-tag button only
```

**Markdown table (`.md`):** Expect a table with columns similar to CSV. Parse rows into cases. Example:
```markdown
| key | path | status | notes |
|---|---|---|---|
| full_personalizer | /products/thames-pinky-ring | active | engraving + illustration |
```

**Plain text / prose (`.txt`, `.json`, or extension unknown):** Read the file and infer cases from its content. If the file is already valid cases-schema JSON, validate and use it directly. Otherwise use natural-language extraction: each paragraph or bullet typically describes one case. Confirm with the user before writing.

### Step 3: Interactive mode (if no `--from`)

Prompt:
```
No artifact provided. Let's build the cases file interactively.

Paste a list of product handles (one per line) OR a description of your archetypes.
End with an empty line.
```

After receiving input, run the same extraction logic as Step 2's plain-text branch.

### Step 4: Normalize case keys

Case keys must be stable, lowercase, snake_case, and unique within the file.

Normalization rules:
- Lowercase everything.
- Replace spaces and hyphens with underscores.
- Strip non-alphanumeric/underscore characters.
- If key collides with an existing key during parsing, append `_2`, `_3`, ...

Example:
- "Full Personalizer (Engraving)" → `full_personalizer_engraving`
- "Ready to Ship" → `ready_to_ship`

If a derived key is ambiguous (two archetypes with similar names), ask the user to rename before writing.

### Step 5: Validate paths

Every case must have a `path` field that starts with `/`. If a path is missing or malformed, hard-error:

```
ERROR: case "full_personalizer" has invalid path: "products/thames-pinky-ring"
  Path must start with "/"

Expected:
  /products/thames-pinky-ring
```

**Do not auto-fix** — ask the user to confirm the correction. Bad paths indicate ambiguity upstream.

For `_shared.json`, paths are optional (shared sections often use the default page URL). If `path` is omitted, set it to `null` and add a `notes` entry explaining which page(s) the shared section is tested against.

### Step 5.5: Validate expect_variances (if present)

If any case carries `expect_variances`, validate each entry before writing:

1. Required fields present: `region`, `anchor`, `describe`, `extract`.
2. `extract` is one of `layout_signature`, `vertical_rhythm`, `text_content`, `per_state`, `computed_style`.
3. If `extract: computed_style`, `property` must also be present.
4. `region` is unique within the case (no two entries with same region slug).
5. `anchor` reference is NOT resolved against the anchor map at intake time. This skill does not require `.theme-forge/anchors/<section>.json` to exist yet — the user may intake cases first, then run `intake-anchors`. Find-variances does the anchor resolution and hard-errors if the referenced anchor is missing.

On validation failure:
```
ERROR: case "standard_product" has invalid expect_variances[1]
  Missing required field: extract
  Allowed extract values: layout_signature, vertical_rhythm, text_content, per_state, computed_style

Fix the artifact and retry:
  /theme-forge intake-cases <page> --from <artifact>
```

### Step 6: Build the JSON

Schema:
```json
{
  "page": "product",
  "updated_at": "2026-04-20T12:00:00Z",
  "cases": {
    "full_personalizer": {
      "path": "/products/thames-pinky-ring",
      "status": "active",
      "notes": "engraving + illustration",
      "expect_behaviors": {
        "personalizer_button": "present",
        "native_atc": "absent"
      },
      "expect_variances": [
        {
          "region": "primary_cta",
          "anchor": "primary_atc",
          "describe": "replace native ATC with 'Personalize your piece'",
          "extract": "text_content"
        }
      ]
    },
    "standard_product": {
      "path": "/products/dainty-chain-necklace",
      "status": "active",
      "notes": "swatch size variant",
      "expect_behaviors": {
        "personalizer_button": "absent",
        "native_atc": "present"
      },
      "expect_variances": [
        {
          "region": "material_finish_layout",
          "anchor": "variant_material_container",
          "describe": "Material + Finish render side-by-side, not stacked",
          "extract": "layout_signature"
        },
        {
          "region": "size_grid",
          "anchor": "variant_size_container",
          "describe": "6-top + 3-bottom grid, grey bg, black outline on select",
          "extract": "layout_signature"
        },
        {
          "region": "header_rhythm",
          "anchor": "product_information_header",
          "describe": "tighter vertical rhythm between title, subtitle, reviews",
          "extract": "vertical_rhythm"
        }
      ]
    }
  }
}
```

**Status values:**
- `active` — included in matrix runs by default
- `dormant` — exists in the file for documentation but skipped by matrix runs (use for archetypes that are currently out of stock or unreleased)
- `draft` — work-in-progress definition, skipped by matrix runs, will error if user tries to run refine-page without either marking active or removing

**Fields:**
- `path` (required for per-page files, optional for `_shared`) — URL path relative to `live_url` / `dev_url` origin
- `status` (required) — one of the three values above
- `notes` (optional) — free-text description, shown in matrix output
- `expect_behaviors` (optional) — map of behavioral role → `"present" | "absent" | "<state-value>"`. Used by find-variances to assert DOM presence/absence per case (e.g., `"personalizer_button": "present"` means the role must resolve to a visible node for this case).
- `expect_variances` (optional) — array of user-asserted design gaps. Each entry is a regression benchmark: find-variances must detect it (or the run flags the extraction as incomplete). Fields:
  - `region` (required) — short stable slug for the gap (e.g., `material_finish_layout`). Used as the variance ID suffix.
  - `anchor` (required) — role name from `.theme-forge/anchors/<section>.json`. Anchor resolves to a live+dev selector pair.
  - `describe` (required) — plain-English description of the gap, shown in refine-section variance card.
  - `extract` (required) — one of `layout_signature`, `vertical_rhythm`, `text_content`, `per_state`, `computed_style`. Tells find-variances which extractor to run on the anchor.
  - `property` (optional, required when `extract: computed_style`) — single CSS property name (e.g., `font-size`).

**Why expect_variances exists:** Positional extraction (`heading-0`, `button-0`) misses layout-level differences and produces false positives when DOM order diverges across live and dev. `expect_variances` lets the user pin specific, known design gaps to anchors. Find-variances probes each anchor with the requested extractor, so the variance gets detected even when DOM positions shift. The list also doubles as a regression benchmark: if find-variances reports zero matches for a declared expect_variance, the run is flagged `incomplete` and the user is told which one failed to reproduce.

### Step 7: Handle existing files

If `.theme-forge/cases/<page>.json` already exists:

1. Read current file.
2. Compute diff against new cases (keys added, keys removed, keys modified).
3. Show the diff to the user:
   ```
   Existing cases file detected at .theme-forge/cases/product.json

   Changes:
     + new_archetype (NEW)
     ~ full_personalizer (path changed: /products/old → /products/new)
     - deprecated_archetype (REMOVED)

   Unchanged: 7 cases.

   Apply changes?
     A) Overwrite with new cases
     B) Merge (add new, keep existing unchanged)
     C) Abort
   ```

Default: ask. Never silently overwrite.

### Step 8: Write the file

```bash
# Ensure cases dir exists
mkdir -p .theme-forge/cases

# Write the file (pretty-printed JSON, 2-space indent)
# ... (use Write tool with the computed JSON)
```

### Step 9: Commit

Cases files are committed by default (locked in v0.19.0 — see onboard docs for opt-out):

```bash
git add .theme-forge/cases/<page>.json
git commit -m "intake-cases: <page> — <N> active cases"
git push -u origin $(git branch --show-current)
```

If the user's project has opted out (see onboard), skip the commit and print a reminder:
```
cases file written locally but NOT committed (per project opt-out).
Commit manually when ready: git add .theme-forge/cases/<page>.json
```

### Step 10: Next step hint

Print:
```
INTAKE COMPLETE: <page>
════════════════════════════════════════════════════════════
Active cases:    <N>
Dormant:         <M>
Draft:           <K>
File:            .theme-forge/cases/<page>.json

next:
  /theme-forge refine-page <page> --cases
  /theme-forge verify-page <page> --cases
  /theme-forge find-variances <section> --page <page> --cases
════════════════════════════════════════════════════════════
```

## Error messages (required)

All errors must name the problem AND the next command.

**Missing page arg:**
```
ERROR: intake-cases requires a page name.
Usage:
  /theme-forge intake-cases <page> [--from <artifact>]
```

**Artifact not found:**
```
ERROR: artifact not found at /path/to/file.png

Check the path, or drop the --from flag to enter interactive mode:
  /theme-forge intake-cases <page>
```

**Duplicate keys after normalization:**
```
ERROR: two archetypes normalize to the same key "full_personalizer"
  Source 1: "Full Personalizer (Engraving)"
  Source 2: "Full Personalizer - Illustration"

Rename one and retry:
  /theme-forge intake-cases <page> --from <artifact>
```

**Invalid status:**
```
ERROR: case "foo" has invalid status "enabled"
  Allowed: active, dormant, draft
```

**Invalid path:**
```
ERROR: case "foo" has invalid path "products/handle"
  Path must start with "/"
```

## `_shared.json` convention

For sections that appear on multiple pages (header, footer, announcement bar, cart drawer), cases live in `.theme-forge/cases/_shared.json` instead of per-page files. This prevents the same shared section from being tested under conflicting case definitions on different pages.

A shared cases file typically has fewer active cases — maybe one per customer state or market:
```json
{
  "page": "_shared",
  "cases": {
    "logged_out": { "path": null, "status": "active", "notes": "default anonymous visitor" },
    "logged_in":  { "path": null, "status": "draft",  "notes": "adds account link to header" }
  }
}
```

When verify-section or refine-section runs on a shared section, it reads `_shared.json` instead of the current page's cases file. This is automatic — the shared-section classification lives in `.theme-forge/mappings/sections/<section>.json`.

## Output

- `.theme-forge/cases/<page>.json` — cases file (committed)
- Next-step hint printed to conversation

## Notes

- Cases files are additive. Re-running intake-cases with a new artifact merges (or overwrites, at user choice).
- Use `--update` for path-only changes. It's faster than re-parsing an artifact.
- The `intake-cases` skill does NOT start a browser or probe URLs. URL validation happens when you actually run `refine-page --cases` or `verify-page --cases` — a 404 mid-loop marks the cell as ERROR but doesn't kill the run.
- For projects that prefer to hand-edit the JSON: this skill is optional. Any manually-authored `.theme-forge/cases/<page>.json` that matches the schema works.
