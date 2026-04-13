#!/usr/bin/env bash
# screenshot.sh — Deterministic screenshot capture via Playwright CLI
#
# Usage:
#   scripts/screenshot.sh capture --url <url> --selector <sel> --out <dir>
#   scripts/screenshot.sh eval    --url <url> --js <expression> [--breakpoint desktop|tablet|mobile]
#   scripts/screenshot.sh open    --url <url>
#   scripts/screenshot.sh close
#   scripts/screenshot.sh status
#
# Output (capture): KEY=VALUE on stdout, human messages on stderr.
#   CAPTURE_STATUS=ok|error
#   CAPTURE_DESKTOP=<path>
#   CAPTURE_TABLET=<path>
#   CAPTURE_MOBILE=<path>
#
# All three breakpoints are captured in every call. No partial captures.
# Resolution is hardcoded — agents cannot override it.

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants — hardcoded, not configurable
# ---------------------------------------------------------------------------
DESKTOP_W=2560
DESKTOP_H=1440
TABLET_W=768
TABLET_H=1024
MOBILE_W=375
MOBILE_H=812

MIN_SCREENSHOT_BYTES=10240  # 10KB — anything smaller is blank/broken

# Popup providers to dismiss (live sites only)
DISMISS_JS='
(function() {
  var c = 0;
  document.querySelectorAll("iframe[src*=\"attn.tv\"],iframe[src*=\"attentive\"],iframe[src*=\"klaviyo\"]").forEach(function(el) {
    var p = el.parentElement;
    if (p && p.tagName !== "BODY" && p.tagName !== "HTML") { p.remove(); } else { el.remove(); }
    c++;
  });
  document.querySelectorAll(".klaviyo-form,.klaviyo-close-form,.privy-popup,[data-testid*=popup]").forEach(function(el) {
    el.remove(); c++;
  });
  document.querySelectorAll("script[src*=attentive],script[src*=klaviyo],script[src*=privy]").forEach(function(el) {
    el.remove(); c++;
  });
  document.body.style.overflow = "auto";
  return "dismissed " + c + " elements";
})()
'

# ---------------------------------------------------------------------------
# CLI binary resolution
# ---------------------------------------------------------------------------
PW=""
if command -v playwright-cli &>/dev/null; then
  PW="playwright-cli"
elif npx --no-install playwright-cli --version &>/dev/null 2>&1; then
  PW="npx --no-install playwright-cli"
else
  PW="npx @playwright/cli"
fi

pw() {
  $PW "$@" 2>&1
}

pw_raw() {
  $PW --raw "$@" 2>&1
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info() { echo "$*" >&2; }
err()  { echo "🛑 $*" >&2; }

is_live_url() {
  local url="$1"
  # Dev server URLs — skip popup dismissal
  if [[ "$url" == *"127.0.0.1"* ]] || [[ "$url" == *"localhost"* ]]; then
    return 1
  fi
  return 0
}

# Build the JS to scroll a section into view
scroll_js() {
  local selector="$1"
  if [[ "$selector" =~ ^[0-9]+$ ]]; then
    echo "document.querySelectorAll('.shopify-section')[${selector}].scrollIntoView({block:'start'}); 'scrolled to index ${selector}'"
  else
    # Escape single quotes in selector
    local escaped="${selector//\'/\\\'}"
    echo "document.querySelector('${escaped}').scrollIntoView({block:'start'}); 'scrolled to ${escaped}'"
  fi
}

validate_screenshot() {
  local filepath="$1"
  if [[ ! -f "$filepath" ]]; then
    return 1
  fi
  local size
  size=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null || echo 0)
  if [[ "$size" -lt "$MIN_SCREENSHOT_BYTES" ]]; then
    return 1
  fi
  return 0
}

ensure_browser_open() {
  # Check if a session is already running
  local status
  status=$(pw list 2>&1 || true)
  if echo "$status" | grep -q "default"; then
    return 0
  fi
  return 1
}

open_browser() {
  local url="${1:-}"
  if [[ -n "$url" ]]; then
    pw open "$url" >/dev/null
  else
    pw open >/dev/null
  fi
}

# Navigate, wait, scroll, dismiss popups — full prep for a screenshot
prepare_page() {
  local url="$1"
  local selector="$2"

  pw goto "$url" >/dev/null

  # Wait for page load + lazy images
  pw eval "new Promise(function(r){setTimeout(function(){r('loaded')},3000)})" >/dev/null

  # Scroll to section
  local js
  js=$(scroll_js "$selector")
  pw eval "$js" >/dev/null

  # Wait for scroll-triggered content
  pw eval "new Promise(function(r){setTimeout(function(){r('waited')},2000)})" >/dev/null

  # Dismiss popups on live sites only
  if is_live_url "$url"; then
    pw eval "$DISMISS_JS" >/dev/null
    # Brief wait after dismissal for layout reflow
    pw eval "new Promise(function(r){setTimeout(function(){r('settled')},500)})" >/dev/null
  fi
}

# Take a section screenshot using run-code for element targeting
take_section_screenshot() {
  local selector="$1"
  local outpath="$2"
  local locate_js

  if [[ "$selector" =~ ^[0-9]+$ ]]; then
    locate_js="page.locator('.shopify-section').nth(${selector})"
  else
    local escaped="${selector//\'/\\\'}"
    locate_js="page.locator('${escaped}')"
  fi

  pw run-code "async page => {
    await ${locate_js}.screenshot({
      path: '${outpath}',
      type: 'png'
    });
    return 'saved';
  }" >/dev/null
}

# ---------------------------------------------------------------------------
# Subcommand: capture
# ---------------------------------------------------------------------------
cmd_capture() {
  local url="" selector="" outdir="" reference=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --url)       url="$2"; shift 2 ;;
      --selector)  selector="$2"; shift 2 ;;
      --out)       outdir="$2"; shift 2 ;;
      --reference) reference="$2"; shift 2 ;;
      *) err "Unknown argument: $1"; echo "CAPTURE_STATUS=error"; echo "CAPTURE_ERROR=bad_args"; exit 1 ;;
    esac
  done

  if [[ -z "$url" ]] || [[ -z "$selector" ]]; then
    err "Required: --url and --selector"
    echo "CAPTURE_STATUS=error"
    echo "CAPTURE_ERROR=missing_args"
    exit 1
  fi

  # Default output directory
  if [[ -z "$outdir" ]]; then
    outdir=".theme-forge/tmp/capture"
  fi
  mkdir -p "$outdir"

  # Ensure browser is open
  if ! ensure_browser_open; then
    info "Opening browser..."
    open_browser "$url"
  fi

  local desktop_path="${outdir}/desktop.png"
  local tablet_path="${outdir}/tablet.png"
  local mobile_path="${outdir}/mobile.png"

  # ---- Desktop (2560x1440) ----
  info "📸 Desktop (${DESKTOP_W}x${DESKTOP_H})..."
  pw resize "$DESKTOP_W" "$DESKTOP_H" >/dev/null
  prepare_page "$url" "$selector"
  take_section_screenshot "$selector" "$desktop_path"

  if ! validate_screenshot "$desktop_path"; then
    info "⚠️  Desktop screenshot looks blank, retrying..."
    prepare_page "$url" "$selector"
    take_section_screenshot "$selector" "$desktop_path"
    if ! validate_screenshot "$desktop_path"; then
      err "Desktop screenshot is blank/broken after retry"
      echo "CAPTURE_STATUS=error"
      echo "CAPTURE_ERROR=desktop_blank"
      exit 1
    fi
  fi
  info "✅ Desktop: $(stat -f%z "$desktop_path" 2>/dev/null || stat -c%s "$desktop_path") bytes"

  # ---- Tablet (768x1024) ----
  info "📸 Tablet (${TABLET_W}x${TABLET_H})..."
  pw resize "$TABLET_W" "$TABLET_H" >/dev/null
  prepare_page "$url" "$selector"
  take_section_screenshot "$selector" "$tablet_path"

  if ! validate_screenshot "$tablet_path"; then
    info "⚠️  Tablet screenshot looks blank, retrying..."
    prepare_page "$url" "$selector"
    take_section_screenshot "$selector" "$tablet_path"
  fi
  info "✅ Tablet: $(stat -f%z "$tablet_path" 2>/dev/null || stat -c%s "$tablet_path") bytes"

  # ---- Mobile (375x812) ----
  info "📸 Mobile (${MOBILE_W}x${MOBILE_H})..."
  pw resize "$MOBILE_W" "$MOBILE_H" >/dev/null
  prepare_page "$url" "$selector"
  take_section_screenshot "$selector" "$mobile_path"

  if ! validate_screenshot "$mobile_path"; then
    info "⚠️  Mobile screenshot looks blank, retrying..."
    prepare_page "$url" "$selector"
    take_section_screenshot "$selector" "$mobile_path"
  fi
  info "✅ Mobile: $(stat -f%z "$mobile_path" 2>/dev/null || stat -c%s "$mobile_path") bytes"

  # Restore desktop viewport
  pw resize "$DESKTOP_W" "$DESKTOP_H" >/dev/null

  # ---- Store reference if requested ----
  if [[ -n "$reference" ]]; then
    local refdir=".theme-forge/references/${reference}"
    mkdir -p "$refdir"
    cp "$desktop_path" "$refdir/desktop.png"
    cp "$tablet_path" "$refdir/tablet.png"
    cp "$mobile_path" "$refdir/mobile.png"
    cat > "$refdir/meta.json" <<METAEOF
{
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "url": "$url",
  "selector": "$selector",
  "browser_tool": "playwright-cli",
  "viewports": {
    "desktop": "${DESKTOP_W}x${DESKTOP_H}",
    "tablet": "${TABLET_W}x${TABLET_H}",
    "mobile": "${MOBILE_W}x${MOBILE_H}"
  }
}
METAEOF
    info "📁 Reference stored in $refdir"
  fi

  # Machine-parseable output
  echo "CAPTURE_STATUS=ok"
  echo "CAPTURE_DESKTOP=${desktop_path}"
  echo "CAPTURE_TABLET=${tablet_path}"
  echo "CAPTURE_MOBILE=${mobile_path}"
}

# ---------------------------------------------------------------------------
# Subcommand: eval — run JS at a specific breakpoint
# ---------------------------------------------------------------------------
cmd_eval() {
  local url="" js="" breakpoint="desktop"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --url)        url="$2"; shift 2 ;;
      --js)         js="$2"; shift 2 ;;
      --breakpoint) breakpoint="$2"; shift 2 ;;
      *) err "Unknown argument: $1"; echo "EVAL_STATUS=error"; exit 1 ;;
    esac
  done

  if [[ -z "$url" ]] || [[ -z "$js" ]]; then
    err "Required: --url and --js"
    echo "EVAL_STATUS=error"
    exit 1
  fi

  if ! ensure_browser_open; then
    open_browser "$url"
  fi

  # Set viewport for breakpoint
  case "$breakpoint" in
    desktop) pw resize "$DESKTOP_W" "$DESKTOP_H" >/dev/null ;;
    tablet)  pw resize "$TABLET_W" "$TABLET_H" >/dev/null ;;
    mobile)  pw resize "$MOBILE_W" "$MOBILE_H" >/dev/null ;;
    *) err "Invalid breakpoint: $breakpoint (use desktop|tablet|mobile)"; echo "EVAL_STATUS=error"; exit 1 ;;
  esac

  pw goto "$url" >/dev/null
  pw eval "new Promise(function(r){setTimeout(function(){r('loaded')},3000)})" >/dev/null

  # Run the JS and return result
  pw_raw eval "$js"
}

# ---------------------------------------------------------------------------
# Subcommand: open
# ---------------------------------------------------------------------------
cmd_open() {
  local url=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --url) url="$2"; shift 2 ;;
      *)     url="$1"; shift ;;
    esac
  done

  if ensure_browser_open; then
    info "Browser already open"
    if [[ -n "$url" ]]; then
      pw goto "$url" >/dev/null
      info "Navigated to $url"
    fi
  else
    info "Opening browser..."
    open_browser "$url"
    info "Browser ready"
  fi
  echo "BROWSER_STATUS=open"
}

# ---------------------------------------------------------------------------
# Subcommand: close
# ---------------------------------------------------------------------------
cmd_close() {
  pw close >/dev/null 2>&1 || true
  info "Browser closed"
  echo "BROWSER_STATUS=closed"
}

# ---------------------------------------------------------------------------
# Subcommand: status
# ---------------------------------------------------------------------------
cmd_status() {
  if ensure_browser_open; then
    echo "BROWSER_STATUS=open"
  else
    echo "BROWSER_STATUS=closed"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  echo "Usage: screenshot.sh <capture|eval|open|close|status> [options]" >&2
  echo "CAPTURE_STATUS=error"
  echo "CAPTURE_ERROR=no_command"
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  capture) cmd_capture "$@" ;;
  eval)    cmd_eval "$@" ;;
  open)    cmd_open "$@" ;;
  close)   cmd_close "$@" ;;
  status)  cmd_status "$@" ;;
  *)
    err "Unknown command: $COMMAND"
    echo "CAPTURE_STATUS=error"
    echo "CAPTURE_ERROR=unknown_command"
    exit 1
    ;;
esac
