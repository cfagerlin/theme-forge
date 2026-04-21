// Three-tier veto ranking for v0.23 source-binding disambiguation.
//
// Source-binding is canonical theme source: a candidate outside the role's
// Liquid-declared DOM subtree is wrong by construction, not just low-scoring.
// Veto semantics treat it accordingly — a determinate verdict is a gate, not
// a score nudge.
//
// Tier precedence:
//   confirmed (in role locus) > inconclusive (locus unresolvable) > rejected (outside locus, removed)
//
// Within a tier, rank by v0.22 base score (already Stage-1 element-rule clamped
// by lib/scorer-adjustments.js).
//
// See plans/v0.23-source-binding.md § "Ranking adjustment — veto, not a score delta".

/**
 * @typedef {Object} RankCandidate
 * @property {string} id - Opaque candidate identifier (selector, XPath, index — caller's choice).
 * @property {number} baseScore - v0.22 Stage-1-clamped score, typically in [0, 1].
 * @property {"confirmed"|"inconclusive"|"rejected"} sourceBindingMatch
 * @property {{filepath: string, line: number, column: number}} [locusCitation] - Optional Liquid citation for the vetoing or confirming locus.
 */

/**
 * @typedef {Object} RankResult
 * @property {RankCandidate|null} winner
 * @property {"confirmed"|"inconclusive"} tier - Role-level tier. "rejected" is never returned at role level; all-rejected falls back to inconclusive with a warning.
 * @property {null|"locus_unresolved"|"all_rejected"|"veto_ignored"} inconclusiveReason
 * @property {Array<{id: string, baseScore: number, citation: RankCandidate["locusCitation"]}>} rejectedCandidates
 * @property {Array<{kind: string, message: string}>} warnings
 */

/**
 * Apply three-tier veto ranking to candidates for a single role.
 *
 * @param {Object} args
 * @param {RankCandidate[]} args.candidates
 * @param {boolean} [args.ignoreVeto=false] - Honors --ignore-source-binding <role> / project config opt-out. When true, rejected candidates still compete for top rank; rejected list is recorded for diagnostics.
 * @returns {RankResult}
 */
export function rankWithVeto({ candidates, ignoreVeto = false }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      winner: null,
      tier: "inconclusive",
      inconclusiveReason: "locus_unresolved",
      rejectedCandidates: [],
      warnings: [{ kind: "no_candidates", message: "no DOM candidates supplied to ranker" }],
    };
  }

  const confirmed = [];
  const inconclusive = [];
  const rejected = [];
  for (const c of candidates) {
    if (c.sourceBindingMatch === "confirmed") confirmed.push(c);
    else if (c.sourceBindingMatch === "rejected") rejected.push(c);
    else inconclusive.push(c);
  }

  const rejectedCandidates = rejected.map((c) => ({
    id: c.id,
    baseScore: c.baseScore,
    citation: c.locusCitation ?? null,
  }));

  if (ignoreVeto) {
    const winner = topByBaseScore(candidates);
    return {
      winner,
      tier: "inconclusive",
      inconclusiveReason: "veto_ignored",
      rejectedCandidates,
      warnings: [
        {
          kind: "veto_ignored",
          message: "source-binding veto disabled for this role (--ignore-source-binding or project config)",
        },
      ],
    };
  }

  if (confirmed.length > 0) {
    return {
      winner: topByBaseScore(confirmed),
      tier: "confirmed",
      inconclusiveReason: null,
      rejectedCandidates,
      warnings: [],
    };
  }

  if (inconclusive.length > 0) {
    return {
      winner: topByBaseScore(inconclusive),
      tier: "inconclusive",
      inconclusiveReason: "locus_unresolved",
      rejectedCandidates,
      warnings: [],
    };
  }

  return {
    winner: topByBaseScore(rejected),
    tier: "inconclusive",
    inconclusiveReason: "all_rejected",
    rejectedCandidates,
    warnings: [
      {
        kind: "no_candidate_in_locus",
        message: "role has a resolvable Liquid locus but no DOM candidate sits inside it; falling back to best base-score candidate",
      },
    ],
  };
}

/**
 * Compute cross-side parity from two per-role rank results.
 *
 * @param {RankResult} live
 * @param {RankResult} dev
 * @returns {"both_confirmed"|"partial"|"mismatch"|"both_inconclusive"}
 */
export function sourceBindingParity(live, dev) {
  const liveTier = live.tier;
  const devTier = dev.tier;

  if (liveTier === "confirmed" && devTier === "confirmed") return "both_confirmed";
  if (liveTier === "inconclusive" && devTier === "inconclusive") return "both_inconclusive";

  const oneConfirmed = liveTier === "confirmed" || devTier === "confirmed";
  const otherAllRejected =
    live.inconclusiveReason === "all_rejected" || dev.inconclusiveReason === "all_rejected";
  if (oneConfirmed && otherAllRejected) return "mismatch";

  return "partial";
}

function topByBaseScore(candidates) {
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].baseScore > best.baseScore) best = candidates[i];
  }
  return best;
}
