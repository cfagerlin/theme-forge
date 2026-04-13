#!/usr/bin/env bash
# Dev server lifecycle manager for theme-forge.
# Ensures each agent session gets its own port + theme, with parallel session
# isolation via Shopify unpublished themes.
#
# Subcommands:
#   start   — Start or reconnect to this session's dev server
#   stop    — Stop this session's dev server
#   restart — Stop then start (same port + theme)
#   cleanup — Stop server + delete unpublished theme if this session created one
#   status  — Show current session info
#
# Output: Machine-parseable KEY=VALUE lines on stdout.
#         Human-readable messages on stderr.
#
# Usage: scripts/dev-server.sh <start|stop|restart|cleanup|status> [--path <project-root>]
#
# The script determines the project root in this order:
#   1. --path argument (if provided)
#   2. Current working directory (if it contains .theme-forge/config.json)
#   3. Error — must be run from the project root or pass --path

set -euo pipefail

# Parse --path argument if provided
PROJECT_ROOT=""
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --path)
      PROJECT_ROOT="$2"; shift 2 ;;
    *)
      ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

# Resolve project root: --path > cwd > error
if [[ -z "$PROJECT_ROOT" ]]; then
  if [[ -f "$(pwd)/.theme-forge/config.json" ]]; then
    PROJECT_ROOT="$(pwd)"
  else
    echo "🛑 Cannot find .theme-forge/config.json in current directory ($(pwd))." >&2
    echo "   Either run this script from the project root, or pass --path <project-root>." >&2
    echo "   Example: scripts/dev-server.sh start --path /path/to/theme" >&2
    echo "DEV_STATUS=error"
    echo "DEV_ERROR=config_not_found"
    exit 1
  fi
fi

CONFIG_FILE="$PROJECT_ROOT/.theme-forge/config.json"
LOG_DIR="/tmp/theme-forge-dev"
PORT_MIN=9292
PORT_MAX=9299
STARTUP_TIMEOUT=30

# ── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo "  $*" >&2; }
warn()  { echo "⚠ $*" >&2; }
die()   { echo "🛑 $*" >&2; exit 1; }

require_tool() {
  local tool="$1" hint="$2"
  command -v "$tool" &>/dev/null || die "$tool is required but not installed. $hint"
}

# ── Config read/write (via jq) ──────────────────────────────────────────────

read_config() {
  local key="$1"
  jq -r ".$key // empty" "$CONFIG_FILE" 2>/dev/null || echo ""
}

write_config() {
  # Usage: write_config key1 val1 key2 val2 ...
  # Numeric values (ports, theme IDs) are detected automatically.
  # Boolean values: "true"/"false" are written as JSON booleans.
  local filter=""
  while [[ $# -ge 2 ]]; do
    local key="$1" val="$2"; shift 2
    if [[ "$val" == "true" || "$val" == "false" ]]; then
      filter+=" | .$key = $val"
    elif [[ "$val" =~ ^[0-9]+$ ]]; then
      filter+=" | .$key = $val"
    else
      filter+=" | .$key = \"$val\""
    fi
  done
  # Remove leading " | "
  filter="${filter# | }"
  local tmp="${CONFIG_FILE}.tmp"
  jq "$filter" "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE"
}

clear_dev_fields() {
  local tmp="${CONFIG_FILE}.tmp"
  jq 'del(.dev_port, .dev_pid, .dev_theme_id, .dev_theme_created, .dev_url, .dev_preview_url, .dev_editor_url)' \
    "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE"
}

# ── Process helpers ──────────────────────────────────────────────────────────

find_dev_process() {
  # Find a shopify theme dev process matching port + theme ID.
  # Returns PID or empty string.
  local port="$1" theme_id="$2"
  ps aux \
    | grep "shopify theme dev" \
    | grep -- "--port $port" \
    | grep -- "--theme $theme_id" \
    | grep -v grep \
    | awk '{print $2}' \
    | head -1 || echo ""
}

find_store_processes() {
  # Find all shopify theme dev processes for a given store.
  # Returns PIDs (one per line) or empty.
  local store="$1"
  ps aux \
    | grep "shopify theme dev" \
    | grep -- "--store $store" \
    | grep -v grep \
    | awk '{print $2}' || true
}

find_port_process() {
  # Find any shopify theme dev process on a specific port.
  # Returns the --theme value or empty.
  local port="$1"
  ps aux \
    | grep "shopify theme dev" \
    | grep -- "--port $port" \
    | grep -v grep \
    | sed -n 's/.*--theme \([0-9]*\).*/\1/p' \
    | head -1 || echo ""
}

kill_dev_process() {
  local port="$1" theme_id="$2"
  local pid
  pid=$(find_dev_process "$port" "$theme_id")
  if [[ -n "$pid" ]]; then
    info "Stopping dev server (PID $pid) on port $port..."
    kill "$pid" 2>/dev/null || true
    sleep 2
    # Force kill if still alive
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    return 0
  fi
  return 1
}

# ── Port helpers ─────────────────────────────────────────────────────────────

find_open_port() {
  for port in $(seq $PORT_MIN $PORT_MAX); do
    if ! lsof -i :"$port" -sTCP:LISTEN &>/dev/null; then
      echo "$port"
      return 0
    fi
  done
  warn "All ports $PORT_MIN-$PORT_MAX are occupied:"
  for port in $(seq $PORT_MIN $PORT_MAX); do
    local occupant
    occupant=$(lsof -i :"$port" -sTCP:LISTEN -t 2>/dev/null | head -1 || echo "unknown")
    warn "  Port $port: PID $occupant"
  done
  die "No available port found. Stop an existing dev server first."
}

# ── Safety checks ────────────────────────────────────────────────────────────

verify_theme_safe() {
  local theme_id="$1" store="$2"
  local role
  role=$(shopify theme info --theme "$theme_id" --store "$store" --json 2>/dev/null \
    | jq -r '.role // empty' 2>/dev/null || echo "")

  if [[ "$role" == "live" || "$role" == "demo" ]]; then
    die "SAFETY BLOCK: Theme $theme_id has role '$role'.
Dev server would sync local files to a $role theme.
Aborting. Fix target_theme_id in .theme-forge/config.json."
  fi

  echo "$role"
}

# ── Start server ─────────────────────────────────────────────────────────────

start_server() {
  # Starts the actual shopify theme dev process and waits for URLs.
  # Args: store, theme_id, port
  local store="$1" theme_id="$2" port="$3"

  mkdir -p "$LOG_DIR"
  local logfile="$LOG_DIR/port-${port}.log"
  > "$logfile"

  info "Starting dev server: theme=$theme_id port=$port store=$store"
  shopify theme dev \
    --store "$store" \
    --theme "$theme_id" \
    --port "$port" \
    --path "$PROJECT_ROOT" \
    > "$logfile" 2>&1 &
  local server_pid=$!

  # Wait for preview URL to appear in output
  local elapsed=0
  while [[ $elapsed -lt $STARTUP_TIMEOUT ]]; do
    if grep -q "http://127.0.0.1:$port" "$logfile" 2>/dev/null; then
      break
    fi
    # Check if process died
    if ! kill -0 "$server_pid" 2>/dev/null; then
      warn "Dev server exited unexpectedly. Log output:"
      cat "$logfile" >&2
      die "Dev server failed to start. Check the log above."
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  if [[ $elapsed -ge $STARTUP_TIMEOUT ]]; then
    kill "$server_pid" 2>/dev/null || true
    warn "Dev server did not print preview URL within ${STARTUP_TIMEOUT}s. Log:"
    cat "$logfile" >&2
    die "Dev server startup timed out."
  fi

  # Parse URLs from log
  local preview_url editor_url
  preview_url=$(grep -oE "http://127\.0\.0\.1:$port[^ ]*" "$logfile" | head -1 || echo "http://127.0.0.1:$port")
  editor_url=$(grep -oE "https://[^ ]*admin/themes/$theme_id/editor[^ ]*" "$logfile" | head -1 || echo "")

  # If editor URL not in output, construct it
  if [[ -z "$editor_url" ]]; then
    editor_url="https://$store/admin/themes/$theme_id/editor"
  fi

  # Return values via globals (subshell-safe)
  _PREVIEW_URL="$preview_url"
  _EDITOR_URL="$editor_url"
  _SERVER_PID="$server_pid"
}

# ── Subcommands ──────────────────────────────────────────────────────────────

cmd_start() {
  info "=== theme-forge dev server: start ==="

  # Read config
  local dev_store target_theme_id live_theme_id
  dev_store=$(read_config "dev_store")
  target_theme_id=$(read_config "target_theme_id")
  live_theme_id=$(read_config "live_theme_id")

  [[ -n "$dev_store" ]] || die "dev_store not set in config. Run /theme-forge onboard first."
  [[ -n "$target_theme_id" ]] || die "target_theme_id not set in config. Run /theme-forge onboard first."

  # Check for existing session
  local existing_port existing_theme_id
  existing_port=$(read_config "dev_port")
  existing_theme_id=$(read_config "dev_theme_id")

  if [[ -n "$existing_port" && -n "$existing_theme_id" ]]; then
    local stored_pid
    stored_pid=$(read_config "dev_pid")

    # Check if the stored PID is still alive AND is a shopify process, fall back to ps-grep
    local pid=""
    if [[ -n "$stored_pid" ]] && kill -0 "$stored_pid" 2>/dev/null \
       && ps -p "$stored_pid" -o args= 2>/dev/null | grep -q "shopify theme dev"; then
      pid="$stored_pid"
    else
      # PID gone or not stored — try ps-grep as fallback
      pid=$(find_dev_process "$existing_port" "$existing_theme_id")
    fi

    if [[ -n "$pid" ]]; then
      info "Dev server already running (PID $pid)"
      # Update stored PID if it changed (found via ps-grep)
      [[ "$pid" != "$stored_pid" ]] && write_config dev_pid "$pid"

      local preview_url editor_url dev_created
      preview_url=$(read_config "dev_preview_url")
      editor_url=$(read_config "dev_editor_url")
      dev_created=$(read_config "dev_theme_created")
      local mode="primary"
      [[ "$dev_created" == "true" ]] && mode="parallel"

      # Output machine-parseable values
      echo "DEV_PORT=$existing_port"
      echo "DEV_THEME_ID=$existing_theme_id"
      echo "DEV_THEME_CREATED=${dev_created:-false}"
      echo "DEV_URL=http://127.0.0.1:$existing_port"
      echo "DEV_PREVIEW_URL=${preview_url:-http://127.0.0.1:$existing_port}"
      echo "DEV_EDITOR_URL=${editor_url}"
      echo "DEV_MODE=$mode"
      echo "DEV_PID=$pid"
      echo "DEV_STATUS=reconnected"
      return 0
    else
      info "Stale session config (PID ${stored_pid:-unknown} no longer running). Starting fresh."
      clear_dev_fields
    fi
  fi

  # Pre-flight safety: never target the live theme
  if [[ -n "$live_theme_id" && "$target_theme_id" == "$live_theme_id" ]]; then
    die "SAFETY BLOCK: target_theme_id ($target_theme_id) equals live_theme_id.
Dev server would sync local files to the LIVE production theme. Aborting."
  fi

  info "Verifying theme $target_theme_id is safe..."
  local target_role
  target_role=$(verify_theme_safe "$target_theme_id" "$dev_store")
  info "Theme role: ${target_role:-unknown}"

  # Detect parallel sessions
  local dev_theme_id dev_theme_created="false" mode="primary"
  local other_pids
  other_pids=$(find_store_processes "$dev_store")

  if [[ -z "$other_pids" ]]; then
    info "No other dev servers for this store. Using development theme."
    dev_theme_id="$target_theme_id"
  else
    info "Parallel session detected (existing PIDs: $(echo "$other_pids" | tr '\n' ' '))"
    info "Creating unpublished theme for isolation..."

    # Name: [TF] <repo> / <branch>
    # e.g. "[TF] gldn-hrzn4 / pull-megamenus"
    local branch_name repo_name
    branch_name=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")
    repo_name=$(git -C "$PROJECT_ROOT" remote get-url origin 2>/dev/null \
      | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|;s|.*[:/]\([^/]*/[^/]*\)$|\1|' \
      | sed 's|.*/||' || echo "unknown")
    local tf_name="[TF] ${repo_name} / ${branch_name}"

    # --theme accepts a name string (not just ID) when combined with --unpublished
    # Capture stderr separately so progress bars don't corrupt JSON on stdout
    local push_stderr_file
    push_stderr_file=$(mktemp /tmp/tf-push-XXXXXX)
    local push_output
    push_output=$(shopify theme push --unpublished --theme "$tf_name" --store "$dev_store" --path "$PROJECT_ROOT" --json 2>"$push_stderr_file") || {
      warn "Theme push stderr: $(cat "$push_stderr_file")"
      warn "Theme push stdout: $push_output"
      rm -f "$push_stderr_file"
      die "Failed to create unpublished theme. See output above."
    }
    rm -f "$push_stderr_file"

    dev_theme_id=$(echo "$push_output" | jq -r '.theme.id // empty' 2>/dev/null || echo "")
    if [[ -z "$dev_theme_id" ]]; then
      warn "Push output: $push_output"
      die "Could not parse theme ID from push output. Check Shopify CLI version and auth."
    fi

    # Verify the new theme is safe
    local new_role
    new_role=$(verify_theme_safe "$dev_theme_id" "$dev_store")
    info "New unpublished theme: $dev_theme_id (role: $new_role)"

    dev_theme_created="true"
    mode="parallel"
  fi

  # Find open port
  info "Scanning for open port..."
  local dev_port
  dev_port=$(find_open_port)
  info "Using port $dev_port"

  # Start the server
  _PREVIEW_URL=""
  _EDITOR_URL=""
  _SERVER_PID=""
  start_server "$dev_store" "$dev_theme_id" "$dev_port"

  # Write to config (including PID for lifecycle tracking)
  write_config \
    dev_port "$dev_port" \
    dev_pid "$_SERVER_PID" \
    dev_theme_id "$dev_theme_id" \
    dev_theme_created "$dev_theme_created" \
    dev_url "http://127.0.0.1:$dev_port" \
    dev_preview_url "$_PREVIEW_URL" \
    dev_editor_url "$_EDITOR_URL"

  # Present to user on stderr
  info ""
  info "══════════════════════════════════════════════════"
  info "  DEV SERVER READY"
  info "══════════════════════════════════════════════════"
  info "  Port:     $dev_port"
  info "  Theme:    $dev_theme_id ($target_role)"
  info "  Preview:  $_PREVIEW_URL"
  info "  Editor:   $_EDITOR_URL"
  [[ "$mode" == "parallel" ]] && \
    info "  Mode:     parallel (unpublished — deleted on cleanup)"
  info "══════════════════════════════════════════════════"
  info ""

  # Output machine-parseable values
  echo "DEV_PORT=$dev_port"
  echo "DEV_PID=$_SERVER_PID"
  echo "DEV_THEME_ID=$dev_theme_id"
  echo "DEV_THEME_CREATED=$dev_theme_created"
  echo "DEV_URL=http://127.0.0.1:$dev_port"
  echo "DEV_PREVIEW_URL=$_PREVIEW_URL"
  echo "DEV_EDITOR_URL=$_EDITOR_URL"
  echo "DEV_MODE=$mode"
  echo "DEV_STATUS=started"
}

cmd_stop() {
  info "=== theme-forge dev server: stop ==="

  local dev_port dev_theme_id stored_pid
  dev_port=$(read_config "dev_port")
  dev_theme_id=$(read_config "dev_theme_id")
  stored_pid=$(read_config "dev_pid")

  if [[ -z "$dev_port" || -z "$dev_theme_id" ]]; then
    info "No dev server configured for this session."
    echo "DEV_STATUS=not_configured"
    return 0
  fi

  # Try stored PID first, then fall back to ps-grep
  local stopped="false"
  if [[ -n "$stored_pid" ]] && kill -0 "$stored_pid" 2>/dev/null; then
    info "Stopping dev server (PID $stored_pid) on port $dev_port..."
    kill "$stored_pid" 2>/dev/null || true
    sleep 2
    kill -0 "$stored_pid" 2>/dev/null && kill -9 "$stored_pid" 2>/dev/null || true
    stopped="true"
  fi

  if [[ "$stopped" == "false" ]]; then
    if kill_dev_process "$dev_port" "$dev_theme_id"; then
      stopped="true"
    fi
  fi

  if [[ "$stopped" == "true" ]]; then
    info "Dev server stopped."
  else
    info "No matching process found (may have already stopped)."
  fi

  clear_dev_fields
  echo "DEV_STATUS=stopped"
}

cmd_restart() {
  info "=== theme-forge dev server: restart ==="

  local dev_port dev_theme_id dev_store dev_theme_created
  dev_port=$(read_config "dev_port")
  dev_theme_id=$(read_config "dev_theme_id")
  dev_store=$(read_config "dev_store")
  dev_theme_created=$(read_config "dev_theme_created")

  if [[ -z "$dev_port" || -z "$dev_theme_id" ]]; then
    info "No existing session. Running start instead."
    cmd_start
    return
  fi

  # Kill existing process
  kill_dev_process "$dev_port" "$dev_theme_id" || true

  # Check the port is actually free now
  if lsof -i :"$dev_port" -sTCP:LISTEN &>/dev/null; then
    local occupant
    occupant=$(find_port_process "$dev_port")
    if [[ -n "$occupant" && "$occupant" != "$dev_theme_id" ]]; then
      die "Port $dev_port is now occupied by theme $occupant (not ours: $dev_theme_id).
Another session took it. Run 'dev-server.sh start' to find a new port."
    fi
    # Wait a moment for port release
    sleep 2
  fi

  # Restart with same port + theme
  _PREVIEW_URL=""
  _EDITOR_URL=""
  _SERVER_PID=""
  start_server "$dev_store" "$dev_theme_id" "$dev_port"

  local mode="primary"
  [[ "$dev_theme_created" == "true" ]] && mode="parallel"

  # Update URLs + PID in config
  write_config \
    dev_pid "$_SERVER_PID" \
    dev_preview_url "$_PREVIEW_URL" \
    dev_editor_url "$_EDITOR_URL"

  info ""
  info "Dev server restarted on port $dev_port"
  info "  Preview:  $_PREVIEW_URL"
  info "  Editor:   $_EDITOR_URL"
  info ""

  echo "DEV_PORT=$dev_port"
  echo "DEV_PID=$_SERVER_PID"
  echo "DEV_THEME_ID=$dev_theme_id"
  echo "DEV_THEME_CREATED=${dev_theme_created:-false}"
  echo "DEV_URL=http://127.0.0.1:$dev_port"
  echo "DEV_PREVIEW_URL=$_PREVIEW_URL"
  echo "DEV_EDITOR_URL=$_EDITOR_URL"
  echo "DEV_MODE=$mode"
  echo "DEV_STATUS=restarted"
}

cmd_cleanup() {
  info "=== theme-forge dev server: cleanup ==="

  local dev_port dev_theme_id dev_store dev_theme_created
  dev_port=$(read_config "dev_port")
  dev_theme_id=$(read_config "dev_theme_id")
  dev_store=$(read_config "dev_store")
  dev_theme_created=$(read_config "dev_theme_created")

  # Stop the server
  if [[ -n "$dev_port" && -n "$dev_theme_id" ]]; then
    kill_dev_process "$dev_port" "$dev_theme_id" || true
  fi

  # Delete unpublished theme if we created it
  if [[ "$dev_theme_created" == "true" && -n "$dev_theme_id" && -n "$dev_store" ]]; then
    info "Deleting unpublished theme $dev_theme_id..."
    if shopify theme delete --theme "$dev_theme_id" --store "$dev_store" --force 2>/dev/null; then
      info "Theme $dev_theme_id deleted."
    else
      warn "Could not delete theme $dev_theme_id."
      warn "Clean it up manually: Shopify Admin > Themes > [TF] ... > Delete"
    fi
  fi

  clear_dev_fields

  # Orphan scan: find [TF] themes with no active dev server
  if [[ -n "$dev_store" ]]; then
    info "Scanning for orphaned [TF] themes..."
    local theme_list
    theme_list=$(shopify theme list --store "$dev_store" --json 2>/dev/null || echo "[]")

    local orphan_ids
    orphan_ids=$(echo "$theme_list" \
      | jq -r '.[] | select(.name | startswith("[TF]")) | select(.role == "unpublished") | .id' 2>/dev/null || echo "")

    local orphan_count=0
    for oid in $orphan_ids; do
      # Check if a dev server is running with this theme
      local running
      running=$(ps aux | grep "shopify theme dev" | grep -- "--theme $oid" | grep -v grep || true)
      if [[ -z "$running" ]]; then
        info "  Orphan found: theme $oid — deleting..."
        if shopify theme delete --theme "$oid" --store "$dev_store" --force 2>/dev/null; then
          info "  Deleted."
          orphan_count=$((orphan_count + 1))
        else
          warn "  Could not delete orphan theme $oid"
        fi
      fi
    done

    if [[ $orphan_count -eq 0 ]]; then
      info "  No orphans found."
    else
      info "  Cleaned up $orphan_count orphaned theme(s)."
    fi
  fi

  echo "DEV_STATUS=cleaned"
}

cmd_status() {
  local dev_port dev_theme_id dev_theme_created dev_preview_url dev_editor_url
  dev_port=$(read_config "dev_port")
  dev_theme_id=$(read_config "dev_theme_id")
  dev_theme_created=$(read_config "dev_theme_created")
  dev_preview_url=$(read_config "dev_preview_url")
  dev_editor_url=$(read_config "dev_editor_url")

  if [[ -z "$dev_port" ]]; then
    info "No dev server configured for this session."
    echo "DEV_STATUS=not_configured"
    return 0
  fi

  local stored_pid
  stored_pid=$(read_config "dev_pid")

  local running="false"
  local pid=""

  # Check stored PID first (verify it's actually shopify), then fall back to ps-grep
  if [[ -n "$stored_pid" ]] && kill -0 "$stored_pid" 2>/dev/null \
     && ps -p "$stored_pid" -o args= 2>/dev/null | grep -q "shopify theme dev"; then
    pid="$stored_pid"
    running="true"
  else
    pid=$(find_dev_process "$dev_port" "$dev_theme_id")
    if [[ -n "$pid" ]]; then
      running="true"
      # Update stored PID
      write_config dev_pid "$pid"
    fi
  fi

  local mode="primary"
  [[ "$dev_theme_created" == "true" ]] && mode="parallel"

  echo "DEV_PORT=$dev_port"
  echo "DEV_THEME_ID=$dev_theme_id"
  echo "DEV_THEME_CREATED=${dev_theme_created:-false}"
  echo "DEV_RUNNING=$running"
  echo "DEV_URL=http://127.0.0.1:$dev_port"
  echo "DEV_PREVIEW_URL=${dev_preview_url:-http://127.0.0.1:$dev_port}"
  echo "DEV_EDITOR_URL=${dev_editor_url}"
  echo "DEV_MODE=$mode"
  echo "DEV_PID=${pid:-}"
}

# ── Main ─────────────────────────────────────────────────────────────────────

usage() {
  cat >&2 <<EOF
Usage: $(basename "$0") <command>

Commands:
  start     Start or reconnect to this session's dev server
  stop      Stop this session's dev server
  restart   Stop then start (same port + theme)
  cleanup   Stop server + delete unpublished theme + remove orphans
  status    Show current session info

Output: KEY=VALUE lines on stdout (machine-parseable)
        Status messages on stderr (human-readable)

Examples:
  eval "\$(scripts/dev-server.sh start)"    # start + load vars
  scripts/dev-server.sh status              # check if running
  scripts/dev-server.sh cleanup             # teardown + delete theme
EOF
}

# Pre-flight
require_tool jq "Install: brew install jq (macOS) or apt install jq (Linux)"
require_tool shopify "Install Shopify CLI: https://shopify.dev/docs/themes/tools/cli"

[[ -f "$CONFIG_FILE" ]] || die "No .theme-forge/config.json found. Run /theme-forge onboard first."

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  cleanup) cmd_cleanup ;;
  status)  cmd_status ;;
  -h|--help) usage ;;
  *)
    [[ -n "${1:-}" ]] && warn "Unknown command: $1"
    usage
    exit 1
    ;;
esac
