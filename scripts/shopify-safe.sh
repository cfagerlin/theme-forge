#!/usr/bin/env bash
# shopify-safe.sh — wrapper that refuses dangerous Shopify CLI operations.
#
# Blocks deterministically (not LLM-enforced):
#   - shopify theme publish ...                 (always refused)
#   - shopify theme push ... --live             (always refused)
#   - shopify theme push ... --allow-live       (always refused)
#   - shopify theme push --theme <ID> ...       (refused if ID is currently the live theme)
#   - shopify theme delete --theme <ID> ...     (refused if ID is currently the live theme)
#
# Live theme ID is queried from `shopify theme list --json` at execution time,
# so the check stays correct even if the user republishes a different theme between sessions.
#
# Anything else is passed through to the real `shopify` CLI unchanged.
#
# Usage: replace `shopify ...` with `scripts/shopify-safe.sh ...` in skill workflows.

set -euo pipefail

err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*" >&2; }

# Find the project root (where .theme-forge lives) by walking up.
find_project_root() {
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.theme-forge" ]]; then
      printf '%s' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# Extract the value of a flag like --theme or --store from positional args.
# Supports both `--flag value` and `--flag=value` forms.
extract_flag_value() {
  local flag="$1"; shift
  local prev=""
  for arg in "$@"; do
    if [[ "$prev" == "$flag" ]]; then
      printf '%s' "$arg"
      return 0
    fi
    if [[ "$arg" == "$flag="* ]]; then
      printf '%s' "${arg#${flag}=}"
      return 0
    fi
    prev="$arg"
  done
  return 1
}

# Has a bare flag (no value) been passed?
has_flag() {
  local flag="$1"; shift
  for arg in "$@"; do
    if [[ "$arg" == "$flag" ]]; then
      return 0
    fi
  done
  return 1
}

# Resolve the store: prefer explicit --store, fall back to .theme-forge/config.json.
resolve_store() {
  local store
  if store=$(extract_flag_value --store "$@"); then
    printf '%s' "$store"
    return 0
  fi
  local root
  if root=$(find_project_root); then
    if [[ -f "$root/.theme-forge/config.json" ]]; then
      command -v jq >/dev/null 2>&1 || return 1
      jq -r '.dev_store // empty' "$root/.theme-forge/config.json"
      return 0
    fi
  fi
  return 1
}

# Query the currently-live theme ID for a store. Echoes ID or empty.
fetch_live_theme_id() {
  local store="$1"
  command -v jq >/dev/null 2>&1 || {
    err "shopify-safe: jq is required for live-theme verification (not installed)."
    return 2
  }
  local list_json
  if ! list_json=$(shopify theme list --store "$store" --json 2>/dev/null); then
    err "shopify-safe: could not query 'shopify theme list --store $store'."
    err "  Refusing the operation out of caution. Re-run after auth/network is restored,"
    err "  or invoke the real \`shopify\` CLI directly if you accept the risk."
    return 2
  fi
  printf '%s' "$list_json" | jq -r '.[] | select(.role == "live") | .id' | head -1
}

# --- Decision logic ---

# Pass-through if not a `theme` subcommand.
if [[ "${1:-}" != "theme" ]]; then
  exec shopify "$@"
fi

sub="${2:-}"

case "$sub" in
  publish)
    err "BLOCKED: 'shopify theme publish' refused by shopify-safe.sh."
    err "  Publishing changes which theme customers see. theme-forge work stays local."
    err "  If you truly intend to publish a theme as live, invoke the raw \`shopify\` CLI directly,"
    err "  not via this wrapper."
    exit 1
    ;;
  push)
    if has_flag --live "$@" || has_flag --allow-live "$@"; then
      err "BLOCKED: 'shopify theme push --live' / '--allow-live' refused by shopify-safe.sh."
      err "  This flag pushes local files to the currently-published theme — your customers see"
      err "  the changes immediately. theme-forge work stays local. Refusing."
      exit 1
    fi
    if target_id=$(extract_flag_value --theme "$@"); then
      # Numeric IDs only — names like '[TF] foo' or 'mybranch' aren't theme IDs and can't equal live.
      if [[ "$target_id" =~ ^[0-9]+$ ]]; then
        if store=$(resolve_store "$@") && [[ -n "$store" ]]; then
          if live_id=$(fetch_live_theme_id "$store"); then
            if [[ -n "$live_id" && "$target_id" == "$live_id" ]]; then
              err "BLOCKED: 'shopify theme push --theme $target_id' refused by shopify-safe.sh."
              err "  Theme $target_id is currently the LIVE theme on $store."
              err "  Pushing would overwrite production. Refusing."
              err "  If the live theme has changed and you truly want to push to this id,"
              err "  invoke the raw \`shopify\` CLI directly."
              exit 1
            fi
          else
            # fetch_live_theme_id already printed the reason
            exit 1
          fi
        else
          warn "shopify-safe: could not resolve store; live-theme check skipped."
          warn "  Pass --store explicitly or run from a directory under a .theme-forge project."
        fi
      fi
    fi
    exec shopify "$@"
    ;;
  delete)
    if target_id=$(extract_flag_value --theme "$@"); then
      if [[ "$target_id" =~ ^[0-9]+$ ]]; then
        if store=$(resolve_store "$@") && [[ -n "$store" ]]; then
          if live_id=$(fetch_live_theme_id "$store"); then
            if [[ -n "$live_id" && "$target_id" == "$live_id" ]]; then
              err "BLOCKED: 'shopify theme delete --theme $target_id' refused by shopify-safe.sh."
              err "  Theme $target_id is currently the LIVE theme on $store. Refusing."
              exit 1
            fi
          else
            exit 1
          fi
        fi
      fi
    fi
    exec shopify "$@"
    ;;
  *)
    exec shopify "$@"
    ;;
esac
