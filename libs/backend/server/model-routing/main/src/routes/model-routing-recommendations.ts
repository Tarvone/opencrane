import { Router, type Request } from "express";
import { SkillModelMode, type SavingsRecommendation } from "@opencrane/contracts";
import { RoutingProposalStatus as PrismaRoutingProposalStatus, type PrismaClient, type RoutingMeasurement as PrismaRoutingMeasurement, type RoutingProposal as PrismaRoutingProposal, type Skill as PrismaSkill } from "@prisma/client";

import type { CallerScope } from "./model-routing-recommendations.types.js";
import { _ResolveCallerClusterTenant as _resolveCallerClusterTenant } from "@opencrane/backend/server/cluster-tenants";
import { _IsDevAuthMode } from "@opencrane/server/_infra/auth";

/** The compound-key string identifying one skill's `(name, scope, team)` identity. */
type SkillKey = string;

/** Build the compound key used to join measurements, proposals, and skills. */
function _skillKey(name: string, scope: string, team: string): SkillKey
{
  return `${name}\u0000${scope}\u0000${team}`;
}

/**
 * Resolve the caller's authorization scope for read-time result filtering (AIR.11). Mirrors
 * `cluster-tenant-scope._enforce`: no session is the dev open-auth fallthrough (treat as operator
 * — see all); an operator sees all; a non-operator's own ClusterTenant is resolved fresh from
 * their IdP-verified email (fail-closed, never from a self-asserted claim).
 *
 * @param prisma - Prisma client for the fail-closed email→tenant→clusterTenantRef lookup.
 * @param req    - The incoming request carrying the session.
 * @returns The caller's resolved scope.
 */
async function _resolveCallerScope(prisma: PrismaClient, req: Request): Promise<CallerScope>
{
  const authUser = req.session?.authUser;

  // 1. No session: the dev-mode bypass treats the caller as operator (fresh local install / OPEN
  //    dev backend); a real auth deployment FAILS CLOSED (non-operator, no tenant) so the feed
  //    returns an empty result rather than leaking cross-tenant recommendations (AIR.0b).
  if (!authUser)
  {
    return _IsDevAuthMode() ? { isOperator: true, clusterTenant: null } : { isOperator: false, clusterTenant: null };
  }

  // 2. Platform operators see every skill's recommendation at any scope.
  if (authUser.isPlatformOperator)
  {
    return { isOperator: true, clusterTenant: null };
  }

  // 3. Non-operator: resolve their own ClusterTenant fresh from the verified email so the result
  //    set can be filtered to skills they own. Fail-closed on missing/ambiguous (null → sees none).
  const clusterTenant = await _resolveCallerClusterTenant(prisma, authUser.email);
  return { isOperator: false, clusterTenant };
}

/**
 * Decide whether a skill (owner = its team) is visible to the caller. An operator (and the dev
 * open-auth fallthrough) sees all; a non-operator sees only skills owned by their own resolved
 * ClusterTenant. A non-operator with no resolved ClusterTenant sees nothing (fail-closed); a
 * Global/org skill (empty team) is operator-only.
 *
 * @param scope     - The caller's resolved scope.
 * @param skillTeam - The skill's owning team (empty for org/global).
 */
function _isVisible(scope: CallerScope, skillTeam: string): boolean
{
  if (scope.isOperator)
  {
    return true;
  }
  const owner = typeof skillTeam === "string" ? skillTeam.trim() : "";
  return Boolean(scope.clusterTenant) && owner === scope.clusterTenant;
}

/**
 * Project the latest measurement for a skill (+ optional open proposal + skill row) into the
 * frontend savings-recommendation DTO. The proposal, when present, wins for the current/recommended
 * model fields (it carries the human-reviewed switch); otherwise we fall back to the skill's pin and
 * the measurement's candidate.
 *
 * @param latest   - The skill's latest `RoutingMeasurement` (by `runAt`).
 * @param proposal - An open Pending `RoutingProposal` on the same compound key, if any.
 * @param skill    - The owning `Skill` row, if found (for the `pinnedModel` fallback).
 * @returns The recommendation DTO.
 */
function _toRecommendation(latest: PrismaRoutingMeasurement, proposal: PrismaRoutingProposal | null, skill: PrismaSkill | null): SavingsRecommendation
{
  return {
    skillName: latest.skillName,
    skillScope: latest.skillScope,
    skillTeam: latest.skillTeam,
    modelMode: skill?.modelMode === "Pinned" ? SkillModelMode.Pinned : skill?.modelMode === "Auto" ? SkillModelMode.Auto : null,
    currentModel: proposal?.fromModel ?? skill?.pinnedModel ?? null,
    recommendedModel: proposal?.proposedModel ?? latest.candidateModel ?? null,
    recommendedModelId: proposal?.proposedModelId ?? latest.candidateModelId ?? null,
    skillContentHash: latest.skillContentHash ?? null,
    skillDigest: latest.skillDigest ?? null,
    projectedSavingsPct: latest.projectedSavingsPct,
    ciLowPct: latest.ciLowPct,
    ciHighPct: latest.ciHighPct,
    hasOpenProposal: proposal !== null,
    proposalId: proposal?.id ?? null,
    measurementId: latest.id,
    runAt: latest.runAt.toISOString(),
  };
}

/**
 * Reduce all measurements to the single latest row (by `runAt`) per skill compound key.
 * @param rows - All measurements matching the query filter, any order.
 * @returns A map from compound key to that skill's latest measurement.
 */
function _latestPerSkill(rows: PrismaRoutingMeasurement[]): Map<SkillKey, PrismaRoutingMeasurement>
{
  const latest = new Map<SkillKey, PrismaRoutingMeasurement>();
  for (const row of rows)
  {
    const key = _skillKey(row.skillName, row.skillScope, row.skillTeam);
    const current = latest.get(key);
    if (!current || row.runAt.getTime() > current.runAt.getTime())
    {
      latest.set(key, row);
    }
  }
  return latest;
}

/**
 * Read-only router for the AIR.11 savings-recommendation feed. Mounted under
 * `/api/v1/model-routing/recommendations`. Pure DB read — for each skill with at least one
 * measurement it takes the latest and joins any open Pending proposal on the same `(name, scope,
 * team)` key, returning a `SavingsRecommendation[]` sorted by `projectedSavingsPct` desc.
 *
 * Reads are not 403-gated; instead the result set is *filtered* to the caller's scope (AIR.0b): an
 * operator (and the dev open-auth fallthrough) sees all, a non-operator sees only skills owned by
 * their own resolved ClusterTenant.
 *
 * @param prisma - Prisma client used for the read.
 * @returns Configured Express router.
 */
export function modelRoutingRecommendationsRouter(prisma: PrismaClient): Router
{
  const router = Router();

  /** List savings recommendations, optionally filtered by clusterTenant / skillScope / onlyOpen. */
  router.get("/", async function _list(req, res, next)
  {
    try
    {
      const clusterTenant = typeof req.query.clusterTenant === "string" ? req.query.clusterTenant : undefined;
      const skillScope = typeof req.query.skillScope === "string" ? req.query.skillScope : undefined;
      const onlyOpen = req.query.onlyOpen === "true";

      // 1. Resolve the caller's scope up front so the result set can be filtered to what they own.
      const scope = await _resolveCallerScope(prisma, req);

      // 2. A non-operator with no resolved ClusterTenant owns nothing — short-circuit to an empty
      //    feed (fail-closed) before touching the measurement/proposal tables.
      if (!scope.isOperator && !scope.clusterTenant)
      {
        res.json([]);
        return;
      }

      // 3. Load measurements (optionally narrowed by the requested clusterTenant/scope) and reduce
      //    to the single latest row per skill — a skill is recommended off its freshest measurement.
      //    `clusterTenant` maps to the skill's owning team for the read.
      const measurements = await prisma.routingMeasurement.findMany({
        where: {
          ...(clusterTenant ? { skillTeam: clusterTenant } : {}),
          ...(skillScope ? { skillScope } : {}),
        },
      });
      const latest = _latestPerSkill(measurements);

      // 4. Load all open Pending proposals once and index them by compound key for the join.
      const proposals = await prisma.routingProposal.findMany({ where: { status: PrismaRoutingProposalStatus.Pending } });
      const openByKey = new Map<SkillKey, PrismaRoutingProposal>();
      for (const proposal of proposals)
      {
        openByKey.set(_skillKey(proposal.skillName, proposal.skillScope, proposal.skillTeam), proposal);
      }

      // 5. Load the owning skills once for the pinnedModel fallback (compound-key lookups).
      const skills = await prisma.skill.findMany();
      const skillByKey = new Map<SkillKey, PrismaSkill>();
      for (const skill of skills)
      {
        skillByKey.set(_skillKey(skill.name, skill.scope, skill.team), skill);
      }

      // 6. Build, scope-filter, onlyOpen-filter, and sort the recommendations.
      const out: SavingsRecommendation[] = [];
      for (const [key, measurement] of latest)
      {
        if (!_isVisible(scope, measurement.skillTeam))
        {
          continue;
        }
        const proposal = openByKey.get(key) ?? null;
        if (onlyOpen && !proposal)
        {
          continue;
        }
        out.push(_toRecommendation(measurement, proposal, skillByKey.get(key) ?? null));
      }
      out.sort((a, b) => b.projectedSavingsPct - a.projectedSavingsPct);

      res.json(out);
    }
    catch (err) { next(err); }
  });

  return router;
}
