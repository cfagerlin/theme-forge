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
