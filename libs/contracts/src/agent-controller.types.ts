/** Sole projected-token audience accepted from the agent controller. */
export const AGENT_CONTROLLER_PROJECTED_TOKEN_AUDIENCE = "opencrane-agent-controller";

/** Exact Kubernetes ServiceAccount allowed to drive agent-workload reconciliation. */
export const AGENT_CONTROLLER_SERVICE_ACCOUNT_NAME = "agent-controller";

/** Database-issued claim generation fencing one controller delivery attempt. */
export interface AgentControllerRunAttemptClaimLease
{
	/** Durable run-outbox event identifier. */
	readonly eventId: string;
	/** Exact database claim instant used as a compare-and-swap token. */
	readonly claimedAt: string;
	/** Monotonic delivery generation paired with the claim instant. */
	readonly deliveryCount: number;
	/** Database-derived instant after which another controller may reclaim the event. */
	readonly expiresAt: string;
}

/** Narrow desired-state projection needed to build one suspended runtime Job. */
export interface AgentControllerRunAttemptProjection
{
	/** Logical run identifier. */
	readonly runId: string;
	/** Positive attempt number within the logical run. */
	readonly attempt: number;
	/** Silo authority containing the run. */
	readonly siloId: string;
	/** Stable AgentService executed by the attempt. */
	readonly agentServiceId: string;
	/** Immutable AgentRevision executed by the attempt. */
	readonly agentRevisionId: string;
	/** Digest of the immutable runtime input; the controller never receives its private body. */
	readonly inputSnapshotDigest: string;
	/** Exact Kubernetes namespace in which the attempt must run. */
	readonly namespace: string;
	/** Named bounded workload profile the controller must resolve. */
	readonly workloadProfile: string;
}

/** One claimed outbox command and its authorised suspended-Job projection. */
export interface AgentControllerRunAttemptClaim
{
	/** Claim generation that must accompany the eventual assignment commit. */
	readonly lease: AgentControllerRunAttemptClaimLease;
	/** Attempt coordinates safe to expose to the Kubernetes mutator. */
	readonly attempt: AgentControllerRunAttemptProjection;
}

/** Exact suspended Job evidence submitted for authoritative assignment. */
export interface AgentControllerRunAttemptAssignmentCommand
{
	/** Exact database claim instant returned by the claim endpoint. */
	readonly claimedAt: string;
	/** Exact delivery generation returned by the claim endpoint. */
	readonly deliveryCount: number;
	/** Logical run expected on the claimed event. */
	readonly runId: string;
	/** Attempt expected on the claimed event. */
	readonly attempt: number;
	/** Named workload profile observed when the event was claimed. */
	readonly expectedWorkloadProfile: string;
	/** Namespace containing the already-created suspended Job. */
	readonly namespace: string;
	/** Bounded runtime-profile ServiceAccount selected for the Job. */
	readonly serviceAccountName: string;
	/** Immutable Kubernetes UID returned for the suspended Job. */
	readonly workloadUid: string;
}

/** Successful or exact-idempotent assignment response. */
export interface AgentControllerRunAttemptAssignmentResult
{
	/** Whether this call committed the assignment or replayed its exact durable value. */
	readonly outcome: "assigned" | "idempotent";
	/** Logical run bound to the Job. */
	readonly runId: string;
	/** Attempt bound to the Job. */
	readonly attempt: number;
	/** Immutable Kubernetes Job UID stored by the run authority. */
	readonly workloadUid: string;
}
