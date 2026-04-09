#!/usr/bin/env bash
# Check if a newer version of theme-forge is available on GitHub
# Usage: ./check-update.sh [theme-forge-dir]

set -euo pipefail

THEME_PULL_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
REPO="cfagerlin/theme-forge"
VERSION_FILE="$THEME_PULL_DIR/VERSION"

# Read local version
if [[ ! -f "$VERSION_FILE" ]]; then
  echo "error: VERSION file not found at $VERSION_FILE" >&2
  exit 1
fi
LOCAL_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')

# Fetch remote version
REMOTE_VERSION=$(curl -sf "https://raw.githubusercontent.com/$REPO/main/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "")

if [[ -z "$REMOTE_VERSION" ]]; then
  echo '{"status": "check_failed", "local": "'"$LOCAL_VERSION"'", "reason": "Could not reach GitHub"}'
  exit 0
fi

if [[ "$LOCAL_VERSION" == "$REMOTE_VERSION" ]]; then
  echo '{"status": "up_to_date", "version": "'"$LOCAL_VERSION"'"}'
else
  echo '{"status": "update_available", "local": "'"$LOCAL_VERSION"'", "remote": "'"$REMOTE_VERSION"'"}'
fi
