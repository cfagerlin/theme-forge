// End-to-end driver for one side of one section. Glues:
//   parse → resolveRoleLocus → classifyCandidates → rankWithVeto → locusSelector
//
// Input:  section root .liquid + rendered HTML + candidate list keyed by role
// Output: per-role side-result ready to feed into buildDecisionReport.
//
// Caller is responsible for running this twice (once per side) and passing
// both sides to buildDecisionReport for parity computation.

import { resolveRoleLocus } from "./source-binding.js";
import { classifyCandidates, locusSelector } from "./dom-locus.js";
import { rankWithVeto } from "./ranker.js";

/**
 * @param {Object} args
 * @param {string} args.rootLiquid - Path to the section's root .liquid file.
 * @param {string} args.html - Rendered HTML for this side.
 * @param {Object<string, Array<{id: string, selector: string, baseScore: number}>>} args.candidates - Map of roleName → candidates.
 * @param {Object} args.roleBindings - Parsed role-bindings.json.
 * @param {(snippetName: string) => string|null} args.resolveSnippet
 * @param {Set<string>} [args.ignoreVetoRoles=new Set()] - Roles where --ignore-source-binding was set.
 * @returns {Object<string, {rank: import("./ranker.js").RankResult, locusSelector: string|null, locusReason: string|null, loci: Array}>}
 */
export function runSourceBindingForSide({
  rootLiquid,
  html,
  candidates,
  roleBindings,
  resolveSnippet,
  ignoreVetoRoles = new Set(),
}) {
  const sideResults = {};

  for (const [role, roleCandidates] of Object.entries(candidates)) {
    const locusResult = resolveRoleLocus(role, rootLiquid, roleBindings, { resolveSnippet });
    const { classified, locusReason } = classifyCandidates({
      html,
      loci: locusResult.loci,
      candidates: roleCandidates,
    });
    const rank = rankWithVeto({
      candidates: classified,
      ignoreVeto: ignoreVetoRoles.has(role),
    });

    // Pick the locus selector from the shallowest locus (already sorted by
    // resolveRoleLocus). Falls back to null if no stable-attr locus exists.
    const primarySelector =
      locusResult.loci.length > 0 ? locusSelector(locusResult.loci[0].enclosingElement) : null;

    sideResults[role] = {
      rank,
      locusSelector: primarySelector,
      locusReason,
      loci: locusResult.loci,
    };
  }

  return sideResults;
}
