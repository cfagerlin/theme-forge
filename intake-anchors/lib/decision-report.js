// Step 6.5 — Decision report builder.
//
// Pure functions. Takes per-role / per-side outputs from the veto pipeline and
// produces the JSON report schema documented in plans/v0.23-source-binding.md:234.
//
// Per-role tier in the report is a three-valued signal (confirmed/inconclusive/
// rejected) that's derived from the ranker output:
//   ranker.tier === "confirmed"                  → report tier "confirmed"
//   ranker.tier === "inconclusive" + reason "all_rejected" → report tier "rejected"
//   ranker.tier === "inconclusive" (any other reason)       → report tier "inconclusive"
//
// "rejected" at role level is different from "inconclusive": the Liquid locus
// DID resolve to a DOM subtree; the subtree just has no candidates in it.
// That's a stronger signal (usually means role-bindings.json is wrong or the
// theme doesn't have this role), so it gets its own top-level counter.

import { sourceBindingParity } from "./ranker.js";

/**
 * @typedef {import("./ranker.js").RankResult} RankResult
 *
 * @typedef {Object} SideInput
 * @property {RankResult} rank - Output of rankWithVeto for this side.
 * @property {string|null} locusSelector - DOM selector built by dom-locus.locusSelector (null if no stable attrs).
 *
 * @typedef {Object} SideReport
 * @property {string|null} locus_selector
 * @property {"confirmed"|"inconclusive"|"rejected"} tier
 * @property {boolean} winner_in_locus
 * @property {Array<string>} rejected_candidates
 *
 * @typedef {Object} RoleInput
 * @property {SideInput} [live]
 * @property {SideInput} [dev]
 *
 * @typedef {Object} RoleReport
 * @property {SideReport} [live]
 * @property {SideReport} [dev]
 * @property {"both_confirmed"|"partial"|"mismatch"|"both_inconclusive"|null} parity
 */

/**
 * Translate a ranker result to the report's three-tier vocabulary.
 * @param {RankResult} rank
 * @returns {"confirmed"|"inconclusive"|"rejected"}
 */
export function reportTierFromRank(rank) {
  if (rank.tier === "confirmed") return "confirmed";
  if (rank.inconclusiveReason === "all_rejected") return "rejected";
  return "inconclusive";
}

/**
 * Build the per-side report block.
 * @param {SideInput} side
 * @returns {SideReport}
 */
export function buildSideReport(side) {
  const tier = reportTierFromRank(side.rank);
  return {
    locus_selector: side.locusSelector ?? null,
    tier,
    winner_in_locus: tier === "confirmed",
    rejected_candidates: side.rank.rejectedCandidates.map((r) => r.id),
  };
}

/**
 * Build the full decision report.
 *
 * @param {Object} args
 * @param {Object<string, RoleInput>} args.roles - Map of roleName → { live?, dev? }.
 * @returns {{ roles: Object<string, RoleReport>, source_binding_coverage: Object }}
 */
export function buildDecisionReport({ roles }) {
  const roleReports = {};
  const summary = {
    roles_confirmed: 0,
    roles_inconclusive: 0,
    roles_all_rejected: 0,
    parity_mismatches: 0,
    candidates_vetoed: 0,
  };

  for (const [roleName, role] of Object.entries(roles)) {
    const entry = {};
    let liveReport = null;
    let devReport = null;

    if (role.live) {
      liveReport = buildSideReport(role.live);
      entry.live = liveReport;
      summary.candidates_vetoed += role.live.rank.rejectedCandidates.length;
    }
    if (role.dev) {
      devReport = buildSideReport(role.dev);
      entry.dev = devReport;
      summary.candidates_vetoed += role.dev.rank.rejectedCandidates.length;
    }

    entry.parity =
      role.live && role.dev ? sourceBindingParity(role.live.rank, role.dev.rank) : null;

    // Summary counters use worst-of across sides. A role that's confirmed on
    // one side and rejected on the other counts as a parity mismatch, not
    // a confirmed.
    const tiers = [liveReport?.tier, devReport?.tier].filter(Boolean);
    if (tiers.every((t) => t === "confirmed")) summary.roles_confirmed++;
    else if (tiers.some((t) => t === "rejected")) summary.roles_all_rejected++;
    else summary.roles_inconclusive++;

    if (entry.parity === "mismatch") summary.parity_mismatches++;

    roleReports[roleName] = entry;
  }

  return {
    roles: roleReports,
    source_binding_coverage: summary,
  };
}
