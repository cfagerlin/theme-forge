#!/usr/bin/env bash
# computed-style-probe.sh — Read computed CSS off a live page as text.
#
# The text-first verification path for hairline properties: borders,
# outlines, line-height, font-weight, opacity, box-shadow, letter-spacing.
# Use this instead of screenshot diffing when you need to confirm a
# property value, because the model cannot see 1px detail in downscaled
# screenshots.
#
# Usage:
#   scripts/computed-style-probe.sh \
#     --url <url> --selector <css> --properties <p1,p2,...> \
#     [--breakpoint desktop|tablet|mobile] [--out <dir>] [--all-matching]
#
# Output (KEY=VALUE on stdout, JSON on disk):
#   PROBE_STATUS=ok|no_match|error
#   PROBE_MATCH_COUNT=<int>
#   PROBE_FIRST_MATCH=<one-line summary>
#   PROBE_JSON=<path>           # full result with all matches + pseudo elements

set -euo pipefail

URL=""
SELECTOR=""
PROPERTIES=""
BREAKPOINT="desktop"
OUT=""
ALL_MATCHING=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)         URL="$2"; shift 2 ;;
    --selector)    SELECTOR="$2"; shift 2 ;;
    --properties)  PROPERTIES="$2"; shift 2 ;;
    --breakpoint)  BREAKPOINT="$2"; shift 2 ;;
    --out)         OUT="$2"; shift 2 ;;
    --all-matching) ALL_MATCHING="--all-matching"; shift ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# *//'
      exit 0 ;;
    *) echo "🛑 unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$URL" || -z "$SELECTOR" || -z "$PROPERTIES" ]]; then
  echo "🛑 --url, --selector, --properties are required" >&2
  echo "PROBE_STATUS=error"
  exit 1
fi

OUT="${OUT:-.theme-forge/tmp/computed-style-probe}"
mkdir -p "$OUT"
STAMP="$(date +%s)"
JSON_OUT="$OUT/probe-$STAMP.json"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$REPO_ROOT/scripts/lib/computed-style-probe.mjs"

set +e
bun run "$LIB" \
  --url "$URL" --selector "$SELECTOR" --properties "$PROPERTIES" \
  --breakpoint "$BREAKPOINT" --out-json "$JSON_OUT" $ALL_MATCHING \
  >/tmp/probe-$$.out 2>/tmp/probe-$$.err
RC=$?
set -e

if [[ $RC -eq 1 ]]; then
  echo "PROBE_STATUS=error"
  cat /tmp/probe-$$.err >&2
  rm -f /tmp/probe-$$.out /tmp/probe-$$.err
  exit 1
fi

if [[ ! -f "$JSON_OUT" ]]; then
  echo "PROBE_STATUS=error"
  echo "🛑 probe ran but produced no JSON" >&2
  cat /tmp/probe-$$.err >&2
  rm -f /tmp/probe-$$.out /tmp/probe-$$.err
  exit 1
fi

read -r STATUS COUNT FIRST <<<"$(bun -e '
  const j = JSON.parse(require("fs").readFileSync("'"$JSON_OUT"'", "utf8"));
  const m0 = j.matches[0];
  const first = m0
    ? `${m0.tag}${m0.id ? "#" + m0.id : ""}${m0.classes.length ? "." + m0.classes.slice(0, 2).join(".") : ""}`
    : "none";
  console.log([j.status, j.matches.length, first].join(" "));
')"

echo "PROBE_STATUS=$STATUS"
echo "PROBE_MATCH_COUNT=$COUNT"
echo "PROBE_FIRST_MATCH=$FIRST"
echo "PROBE_JSON=$JSON_OUT"

rm -f /tmp/probe-$$.out /tmp/probe-$$.err
