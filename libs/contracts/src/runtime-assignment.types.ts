import type { AgentRevisionId, AgentRunId, AgentServiceId, PersonaRevisionId, SiloId, UserId } from "@opencrane/models/agents";

/** Immutable proof-bound assignment consumed by an agent runtime Pod. */
export interface RuntimeAssignment
{
	/** Run authorized for this assignment. */
	readonly runId: AgentRunId;
	/** Positive run attempt authorized for this exact workload assignment. */
	readonly attempt: number;
	/** AgentService authorized for this assignment. */
	readonly agentServiceId: AgentServiceId;
	/** Immutable AgentRevision authorized for this assignment. */
	readonly agentRevisionId: AgentRevisionId;
	/** Approved persona revision compiled for the run, when personal. */
	readonly personaRevisionId?: PersonaRevisionId;
	/** Silo in which the assignment is valid. */
	readonly siloId: SiloId;
	/** User whose membership and grants authorized the run. */
	readonly subjectUserId: UserId;
	/** Highest verified fleet-membership revision used for authorization. */
	readonly fleetMembershipRevision: number;
	/** Digest of the effective proof-bound capability set. */
	readonly capabilitySetDigest: string;
	/** Expected Kubernetes service account name. */
	readonly serviceAccountName: string;
	/** Expected runtime Pod UID. */
	readonly podUid: string;
	/** Digest of canonical assignment claims. */
	readonly assignmentDigest: string;
	/** ISO-8601 issuance time. */
	readonly issuedAt: string;
	/** ISO-8601 hard expiry time. */
	readonly expiresAt: string;
}
