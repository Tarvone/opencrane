import type { AuthorizationScope } from "./authorization-scope.types.js";
import type { CapabilityReference } from "./capability.types.js";

/** Effect applied by an authorization grant. */
export type AuthorizationGrantEffect = "allow" | "deny";

/** Prioritized capability grant for one subject and scope. */
export interface AuthorizationGrant
{
	/** Stable grant identifier used in audit evidence. */
	grantId: string;
	/** Stable silo identifier in which the grant is valid. */
	siloId: string;
	/** Stable subject identifier receiving the grant. */
	subjectId: string;
	/** Independent resource scope covered by the grant. */
	scope: AuthorizationScope;
	/** Immutable capability catalog reference covered by the grant. */
	capability: CapabilityReference;
	/** Allow or deny effect applied when this grant wins. */
	effect: AuthorizationGrantEffect;
	/** Non-negative integer precedence where a larger number has higher priority. */
	priority: number;
}

/** Authorization request evaluated against grants. */
export interface AuthorizationRequest
{
	/** Stable silo identifier containing the requested action. */
	siloId: string;
	/** Stable identifier of the subject attempting the action. */
	subjectId: string;
	/** Exact independent resource scope targeted by the action. */
	scope: AuthorizationScope;
	/** Immutable capability reference required by the action. */
	capability: CapabilityReference;
}

/** Reason returned by deterministic grant evaluation. */
export type AuthorizationDecisionReason =
	"winning_allow"
	| "winning_deny"
	| "no_matching_grant"
	| "invalid_grant_priority";

/** Fail-closed result of deterministic grant evaluation. */
export interface AuthorizationDecision
{
	/** Final authorization outcome. */
	outcome: "allow" | "deny";
	/** Stable reason explaining the decision. */
	reason: AuthorizationDecisionReason;
	/** Grant identifiers at the winning priority or invalid boundary. */
	grantIds: readonly string[];
	/** Winning priority when valid matching grants exist. */
	winningPriority?: number;
}
