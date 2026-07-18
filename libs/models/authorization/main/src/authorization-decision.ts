import type { CapabilityReference } from "./capability.types.js";
import type { AuthorizationDecision, AuthorizationGrant, AuthorizationRequest } from "./grant.types.js";
import { __AuthorizationScopeCovers } from "./scope-matching.js";

/**
 * Compares immutable capability references.
 * @param firstCapability - First capability reference.
 * @param secondCapability - Second capability reference.
 * @returns Whether both references identify the exact catalog capability.
 */
function _capabilitiesEqual(
	firstCapability: CapabilityReference,
	secondCapability: CapabilityReference,
): boolean
{
	return firstCapability.capabilityId === secondCapability.capabilityId
		&& firstCapability.catalog.catalogId === secondCapability.catalog.catalogId
		&& firstCapability.catalog.revision === secondCapability.catalog.revision
		&& firstCapability.catalog.digest === secondCapability.catalog.digest;
}

/**
 * Determines whether a grant applies structurally to a request before priority evaluation.
 * @param grant - Candidate authorization grant.
 * @param request - Authorization request being evaluated.
 * @returns Whether the grant applies to the request.
 */
function _grantApplies(grant: AuthorizationGrant, request: AuthorizationRequest): boolean
{
	return grant.siloId === request.siloId
		&& grant.subjectId === request.subjectId
		&& _capabilitiesEqual(grant.capability, request.capability)
		&& __AuthorizationScopeCovers(grant.scope, request.scope);
}

/**
 * Produces a deterministic fail-closed authorization decision.
 * Higher priorities replace lower priorities and deny wins whenever effects
 * conflict at the same highest priority.
 * @param request - Authorization request being evaluated.
 * @param grants - Candidate grants available to the evaluator.
 * @returns Deterministic authorization decision with winning evidence.
 */
export function __DecideAuthorization(
	request: AuthorizationRequest,
	grants: readonly AuthorizationGrant[],
): AuthorizationDecision
{
	// 1. Structural matching excludes grants from other trust and scope boundaries.
	const matchingGrants = grants.filter(grant => _grantApplies(grant, request));

	// 2. An absent grant always denies because authorization is fail closed.
	if (matchingGrants.length === 0)
	{
		return { outcome: "deny", reason: "no_matching_grant", grantIds: [] };
	}

	// 3. Invalid precedence cannot safely participate in ordering, so reject the request.
	const invalidGrants = matchingGrants.filter(grant => !Number.isSafeInteger(grant.priority));
	if (invalidGrants.length > 0)
	{
		return {
			outcome: "deny",
			reason: "invalid_grant_priority",
			grantIds: invalidGrants.map(grant => grant.grantId),
		};
	}

	// 4. Only grants at the highest priority may determine the final effect.
	const winningPriority = Math.max(...matchingGrants.map(grant => grant.priority));
	const winningGrants = matchingGrants.filter(grant => grant.priority === winningPriority);
	const denyWins = winningGrants.some(grant => grant.effect === "deny");

	return {
		outcome: denyWins ? "deny" : "allow",
		reason: denyWins ? "winning_deny" : "winning_allow",
		grantIds: winningGrants.map(grant => grant.grantId),
		winningPriority,
	};
}
