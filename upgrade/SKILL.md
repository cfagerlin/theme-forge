---
name: upgrade
description: >
  Check for and apply updates to theme-forge from GitHub. Compares local version against cfagerlin/theme-forge main branch.
  - MANDATORY TRIGGERS: theme-forge upgrade, update theme-forge, check for updates
---

# upgrade — Auto-Update

Check for and apply updates to theme-forge from the GitHub repository.

## Workflow

### Step 1: Detect Installation Type

Determine how theme-forge was installed:

1. **Git-based** — Check if `.git/` exists in the theme-forge root directory
   - If yes: can update via `git pull`
2. **Vendored** — No `.git/` directory
   - If yes: needs fresh clone to update

Also detect install location:
- **Global**: `~/.claude/skills/theme-forge` or `~/.codex/skills/theme-forge`
- **Project-level**: `{project}/.claude/skills/theme-forge`

### Step 2: Check Remote Version

1. Read local `VERSION` file
2. Fetch remote version from GitHub:
   ```bash
   curl -sf https://raw.githubusercontent.com/cfagerlin/theme-forge/main/VERSION
   ```
3. Compare versions (semver)

### Step 3: Show Update Info

If a newer version is available:

1. Fetch the CHANGELOG.md from GitHub
2. Show the relevant changelog entries (between local and remote version)
3. Ask the user:
   - **Update now** — Apply the update
   - **Skip** — Don't update this time
   - **Always auto-update** — Set `auto_upgrade: true` in config

If already up to date, report the current version.

### Step 4: Apply Update

**For git-based installs:**
```bash
cd {theme-forge-dir}
git fetch origin
git merge origin/main --ff-only
```

If fast-forward fails (local changes):
- Warn the user
- Offer to `git stash` and retry, or skip

**For vendored installs:**
```bash
rm -rf {theme-forge-dir}
git clone --single-branch --depth 1 https://github.com/cfagerlin/theme-forge.git {theme-forge-dir}
```

### Step 5: Run Migrations

After updating:

1. Check if any migration scripts exist for versions between old and new
2. Run them in order (if applicable)
3. Re-run setup if needed

#### Migration: v0.21 → v0.22

Triggered automatically when local was `0.21.*` and remote is `0.22.*`. Also available ad-hoc:

```
/theme-forge upgrade --to v0.22 [--dry-run]
```

Performs THREE changes across the project's `.theme-forge/`:

1. **Create project library skeleton.** If `.theme-forge/role-libraries/projects/<slug>.json` does not exist, write an empty skeleton:
   ```json
   { "project": "<slug>", "version": 1, "updated_at": "<now>", "roles": {} }
   ```
   The slug resolves from `.theme-forge/config.json → project_slug` or the kebab-cased repo root basename. Do NOT overwrite if a file exists — the user may have hand-authored entries.

2. **Backfill decision reports.** For each existing `.theme-forge/anchors/<section>.json`, if no `<section>.decision-report.json` sibling exists, write a minimal v0.21-compatible stub:
   ```json
   {
     "section": "<section>",
     "generated_at": "<anchors.updated_at>",
     "schema_version": "0.21-backfill",
     "roles": { "<role>": { "status": "<status>", "winner": { "selector": "<live|dev>", "score": "<roles.<role>.score.live|dev>", "source": "legacy (pre-v0.22 run — re-run intake-anchors for full breakdown)" } } }
   }
   ```
   This gives `--why <role>` something to print on pre-v0.22 anchor maps. Tell users in the migration summary that running `/theme-forge intake-anchors <section>` will replace the stub with a real decision report.

3. **Rewrite `cross_verify: "failed"` variance entries.** Scan every `.theme-forge/reports/sections/<section>.json`. For each variance with `confidence: "low"` AND `notes` containing `"cross-verify failed"`, rewrite to `confidence: "rejected"` and update the notes to match the v0.22 wording (refer to find-variances Step 1.5 cross_verify block). This ensures refine-section's new rejected-filter (Step 1.0a) correctly skips these variances on first run post-upgrade. Skip variances whose `notes` don't match the pattern — don't assume.

**Dry-run output example:**

```
upgrade --to v0.22 --dry-run

PROJECT LIBRARY:
  WOULD CREATE .theme-forge/role-libraries/projects/acme.json (skeleton)

DECISION REPORT BACKFILL:
  WOULD CREATE .theme-forge/anchors/product-information-main.decision-report.json (stub from v0.21 anchors)
  WOULD CREATE .theme-forge/anchors/header.decision-report.json (stub from v0.21 anchors)
  SKIP .theme-forge/anchors/footer.decision-report.json (already exists)

VARIANCE REWRITES:
  .theme-forge/reports/sections/product-information-main.json:
    WOULD REWRITE 3 variances: confidence low → rejected (cross_verify pattern match)
  .theme-forge/reports/sections/header.json:
    no changes (no matching variances)

Summary: 1 library to create, 2 reports to backfill, 3 variances to rewrite.
Re-run without --dry-run to apply.
```

**Rollback.** Every file the migration WRITES is listed in `.theme-forge/.migrations/v0.22-backup.json` (old bytes captured before overwrite, skipped for pure CREATE operations). `/theme-forge upgrade --rollback v0.22` restores.

Always run `--dry-run` first on projects with committed `.theme-forge/` state so the user sees the diff before accepting.

### Step 6: Confirm

Print:
```
✅ theme-forge updated: v0.1.0 → v0.2.0
   3 new features, 2 bug fixes
   Run /theme-forge status to see your migration progress
```

## Auto-Update Check

On first invocation of any theme-forge command per session:

1. If `auto_upgrade` is true in config, silently check and update
2. If false, check but only notify (don't update automatically)
3. Track last check time — only check once per day maximum

## Output

- Updated theme-forge files (if update applied)
- Version info printed to conversation
