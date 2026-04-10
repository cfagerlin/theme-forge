#!/usr/bin/env bash
# Session setup script for Conductor workspaces.
# Runs when a new session is created to ensure it starts from the latest main.
#
# What it does:
#   1. Fetches latest from origin
#   2. Checks out main/master and pulls
#   3. Creates a working branch for this session
#   4. Verifies expected artifacts exist (config, mappings, etc.)
#
# Usage: scripts/session-setup.sh [branch-name]
#   branch-name: optional, defaults to session-<timestamp>

set -euo pipefail

BRANCH_NAME="${1:-session-$(date +%Y%m%d-%H%M%S)}"

echo "=== theme-forge session setup ==="

# Step 1: Fetch latest
echo "Fetching latest from origin..."
git fetch origin

# Step 2: Determine default branch (main or master)
DEFAULT_BRANCH=""
for branch in main master; do
  if git rev-parse --verify "origin/$branch" &>/dev/null; then
    DEFAULT_BRANCH="$branch"
    break
  fi
done

if [[ -z "$DEFAULT_BRANCH" ]]; then
  echo "ERROR: No main or master branch found on origin"
  exit 1
fi

echo "Default branch: $DEFAULT_BRANCH"

# Step 3: Checkout and pull default branch
git checkout "$DEFAULT_BRANCH"
git pull origin "$DEFAULT_BRANCH"

# Step 4: Create working branch
echo "Creating working branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

# Step 5: Check for expected artifacts
echo ""
echo "=== Pre-flight checks ==="

WARNINGS=0

# Check for theme-forge config
if [[ -f ".theme-forge/config.json" ]]; then
  echo "✓ .theme-forge/config.json found"
else
  echo "⚠ .theme-forge/config.json NOT found on $DEFAULT_BRANCH"
  echo "  → Run /theme-forge onboard first, or merge onboard work to $DEFAULT_BRANCH"
  WARNINGS=$((WARNINGS + 1))
fi

# Check for global maps (from scan)
if [[ -f ".theme-forge/settings-map.json" ]]; then
  echo "✓ .theme-forge/settings-map.json found"
else
  echo "⚠ Global settings map not found — scan hasn't been merged to $DEFAULT_BRANCH yet"
  WARNINGS=$((WARNINGS + 1))
fi

if [[ -f ".theme-forge/class-map.json" ]]; then
  echo "✓ .theme-forge/class-map.json found"
else
  echo "⚠ Global class map not found — scan hasn't been merged to $DEFAULT_BRANCH yet"
  WARNINGS=$((WARNINGS + 1))
fi

# Check for Playwright MCP
if [[ -f ".mcp.json" ]]; then
  echo "✓ .mcp.json found (Playwright MCP configured)"
else
  echo "⚠ .mcp.json not found — Playwright MCP not configured at project level"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
if [[ $WARNINGS -gt 0 ]]; then
  echo "⚠ $WARNINGS warning(s). Some prerequisites may not be merged to $DEFAULT_BRANCH yet."
  echo "  Check open PRs: gh pr list"
  echo "  Previous session work may need to be merged before this session can proceed."
else
  echo "✓ All pre-flight checks passed. Ready to work."
fi

echo ""
echo "Session ready on branch: $BRANCH_NAME"
echo "Base: origin/$DEFAULT_BRANCH @ $(git rev-parse --short origin/$DEFAULT_BRANCH)"
