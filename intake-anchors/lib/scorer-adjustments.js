// v0.22 element-type-rule score clamp. Unchanged in v0.23.
//
// v0.23 originally proposed a second stage here for source-binding (wider
// clamp bounds on top of Stage 1). That design was abandoned: source-binding
// is canonical theme source, not an empirical prior, so it's applied as a
// three-tier veto in lib/ranker.js, not a score delta. See
// plans/v0.23-source-binding.md § "Ranking adjustment — veto, not a score delta".
//
// This module is used within a single veto tier to order candidates by their
// v0.22 score.
//
// Formula:
//   final = clamp(base + element_rule, base − 0.20, base + 0.15)

export const STAGE_1_FLOOR = -0.2;
export const STAGE_1_CEIL = 0.15;

function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/**
 * Compute the post-element-rule score for a single candidate.
 *
 * @param {Object} args
 * @param {number} args.base - base score (typically in [0, 1])
 * @param {number} args.elementRule - delta from element-type-rules.json (may exceed bounds; will be clamped)
 * @returns {{final: number}}
 */
export function applyScoreAdjustments({ base, elementRule = 0 }) {
  const final = clamp(base + elementRule, base + STAGE_1_FLOOR, base + STAGE_1_CEIL);
  return { final };
}
