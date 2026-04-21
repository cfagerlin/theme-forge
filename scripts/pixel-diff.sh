#!/usr/bin/env bash
# pixel-diff.sh — Pixel-perfect PNG diff with text-output for agents.
#
# Why: the model's image-input pipeline downscales screenshots to a few
# hundred pixels wide. A 1px border averages out and disappears. Agents
# must verify visual correctness by reading numbers, not pixels.
#
# Usage:
#   scripts/pixel-diff.sh --a <png-a> --b <png-b> --out <dir> [--threshold 0.1]
#
# Output (KEY=VALUE on stdout, JSON on disk):
#   DIFF_STATUS=ok|size_mismatch|error
#   DIFF_WIDTH=<int>
#   DIFF_HEIGHT=<int>
#   DIFF_TOTAL_PIXELS=<int>
#   DIFF_MISMATCHED=<int>
#   DIFF_RATIO=<float, 6 decimals>
#   DIFF_REGION_COUNT=<int>           # number of clustered diff regions
#   DIFF_LARGEST_REGION=<x,y,w,h,N>   # top region by pixel count
#   DIFF_JSON=<path>                   # full diff report (regions, sha256s)
#   DIFF_PNG=<path>                    # rendered diff visualization
#
# Defaults: threshold=0.05, alpha=0.1, antialias detection on.
# Pixelmatch's stock threshold (0.1) misses 1px #e8e8e8 hairlines on
# #fcfcfc backgrounds because YIQ delta is squared into the budget. 0.05
# catches the bamako breadcrumb-border case while still ignoring
# jpeg-style noise. Lower = more sensitive.

set -euo pipefail

A=""
B=""
OUT=""
THRESHOLD="0.05"
ALPHA="0.1"
INCLUDE_AA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --a)         A="$2"; shift 2 ;;
    --b)         B="$2"; shift 2 ;;
    --out)       OUT="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --alpha)     ALPHA="$2"; shift 2 ;;
    --include-aa) INCLUDE_AA="--include-aa"; shift ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# *//'
      exit 0 ;;
    *) echo "🛑 unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$A" || -z "$B" ]]; then
  echo "🛑 --a and --b are required" >&2
  echo "DIFF_STATUS=error"
  exit 1
fi

for f in "$A" "$B"; do
  if [[ ! -f "$f" ]]; then
    echo "🛑 not found: $f" >&2
    echo "DIFF_STATUS=error"
    exit 1
  fi
done

OUT="${OUT:-.theme-forge/tmp/pixel-diff}"
mkdir -p "$OUT"
STAMP="$(date +%s)"
JSON_OUT="$OUT/diff-$STAMP.json"
PNG_OUT="$OUT/diff-$STAMP.png"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$REPO_ROOT/scripts/lib/pixel-diff.mjs"

if ! bun run "$LIB" \
    --a "$A" --b "$B" \
    --out-json "$JSON_OUT" --out-png "$PNG_OUT" \
    --threshold "$THRESHOLD" --alpha "$ALPHA" $INCLUDE_AA \
    >/tmp/pixel-diff-$$.out 2>/tmp/pixel-diff-$$.err
then
  rc=$?
  if [[ $rc -eq 2 ]]; then
    echo "DIFF_STATUS=size_mismatch"
    echo "DIFF_JSON=$JSON_OUT"
    cat /tmp/pixel-diff-$$.err >&2
    rm -f /tmp/pixel-diff-$$.out /tmp/pixel-diff-$$.err
    exit 0
  fi
  echo "DIFF_STATUS=error"
  cat /tmp/pixel-diff-$$.err >&2
  rm -f /tmp/pixel-diff-$$.out /tmp/pixel-diff-$$.err
  exit 1
fi

# Parse summary fields out of the emitted JSON via bun (no jq dependency).
read -r WIDTH HEIGHT TOTAL MISMATCHED RATIO REGIONS LARGEST <<<"$(bun -e '
  const j = JSON.parse(require("fs").readFileSync("'"$JSON_OUT"'", "utf8"));
  const top = j.regions[0];
  const largest = top ? `${top.x},${top.y},${top.w},${top.h},${top.pixels}` : "none";
  console.log([j.width, j.height, j.totalPixels, j.mismatchedPixels, j.ratio.toFixed(6), j.regions.length, largest].join(" "));
')"

echo "DIFF_STATUS=ok"
echo "DIFF_WIDTH=$WIDTH"
echo "DIFF_HEIGHT=$HEIGHT"
echo "DIFF_TOTAL_PIXELS=$TOTAL"
echo "DIFF_MISMATCHED=$MISMATCHED"
echo "DIFF_RATIO=$RATIO"
echo "DIFF_REGION_COUNT=$REGIONS"
echo "DIFF_LARGEST_REGION=$LARGEST"
echo "DIFF_JSON=$JSON_OUT"
echo "DIFF_PNG=$PNG_OUT"

rm -f /tmp/pixel-diff-$$.out /tmp/pixel-diff-$$.err
