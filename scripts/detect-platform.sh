#!/usr/bin/env bash
# Detect which AI coding platform we're running on
# Outputs: claude-code | cowork | openclaw | codex | unknown

detect_platform() {
  # Check for Cowork (runs in /sessions/ sandbox)
  if [[ -d "/sessions" ]] && [[ "$PWD" == /sessions/* ]]; then
    echo "cowork"
    return
  fi

  # Check for Claude Code (has ~/.claude/)
  if [[ -d "$HOME/.claude" ]]; then
    echo "claude-code"
    return
  fi

  # Check for Codex (has ~/.codex/)
  if [[ -d "$HOME/.codex" ]]; then
    echo "codex"
    return
  fi

  # Check for OpenClaw
  if [[ -n "$OPENCLAW_HOME" ]] || command -v openclaw &>/dev/null; then
    echo "openclaw"
    return
  fi

  echo "unknown"
}

# Get the skills directory for this platform
get_skills_dir() {
  local platform
  platform=$(detect_platform)

  case "$platform" in
    claude-code) echo "$HOME/.claude/skills" ;;
    cowork)      echo "$HOME/.claude/skills" ;;
    codex)       echo "$HOME/.codex/skills" ;;
    openclaw)    echo "$HOME/.openclaw/skills" ;;
    *)           echo "$HOME/.claude/skills" ;;
  esac
}

# If sourced, export functions. If run directly, print platform.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  detect_platform
fi
