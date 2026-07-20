import type { AgentControllerRunAttemptAssignmentCommand, AgentControllerRunAttemptAssignmentResult, AgentControllerRunAttemptClaim } from "@opencrane/contracts";

/** Fixed database-owned lease and assignment policy for run dispatch. */
export interface RunDispatchRepositoryConfig
{
	/** Exact namespace containing this silo's OpenCrane server and runtime Jobs. */
	readonly namespace: string;
	/** Time after which an uncommitted outbox claim may be reclaimed. */
	readonly claimLeaseMilliseconds: number;
	/** Hard lifetime persisted on a newly assigned runtime workload. */
	readonly assignmentTtlMilliseconds: number;
}

/** Outcome of claiming the next eligible runtime attempt. */
export type ClaimNextRunAttemptResult =
	| { readonly status: "claimed"; readonly claim: AgentControllerRunAttemptClaim }
	| { readonly status: "none" };

/** Outcome of committing a suspended Job as the current attempt assignment. */
export type CommitRunAttemptAssignmentResult =
	| { readonly status: "committed"; readonly result: AgentControllerRunAttemptAssignmentResult }
	| { readonly status: "conflict"; readonly reason: "claim_not_found" | "stale_claim" | "claim_terminal" | "attempt_conflict" | "authority_conflict" | "assignment_conflict" | "invalid_assignment" };

/** Run-owned persistence port used by the controller-only internal API. */
export interface RunDispatchRepository
{
	/** Claims one eligible RunAttemptRequested event or reports no current work. */
	claimNextAttemptAtomically(): Promise<ClaimNextRunAttemptResult>;
	/** Commits only the exact current claim and suspended Job UID as a PendingPod assignment. */
	commitSuspendedJobAssignmentAtomically(eventId: string, command: AgentControllerRunAttemptAssignmentCommand): Promise<CommitRunAttemptAssignmentResult>;
}

/** TokenReview-confirmed identity of an in-cluster workload. */
export interface ReviewedAgentControllerIdentity
{
	/** Exact Kubernetes username returned by TokenReview. */
	readonly username: string;
	/** Kubernetes namespace returned by the reviewed ServiceAccount subject. */
	readonly namespace: string;
	/** Kubernetes ServiceAccount name returned by TokenReview. */
	readonly serviceAccountName: string;
	/** Audiences accepted by the Kubernetes API server. */
	readonly audiences: readonly string[];
}

/** Projected-token reviewer supplied by the OpenCrane process boundary. */
export interface AgentControllerTokenReviewer
{
	/** Reviews one token against the dedicated agent-controller audience. */
	__Review(token: string): Promise<ReviewedAgentControllerIdentity | null>;
}

/** Minimal structured logger surface required by the dispatch HTTP boundary. */
export interface AgentControllerRunDispatchLogger
{
	/** Records a failed internal operation without serialising credentials or request bodies. */
	error(bindings: { readonly err: unknown; readonly operation: string }, message: string): void;
}

/** Dependencies of the controller-only run-dispatch HTTP adapter. */
export interface AgentControllerRunDispatchRouterDependencies
{
	/** Dedicated projected-token identity reviewer. */
	readonly tokenReviewer: AgentControllerTokenReviewer;
	/** Exact namespace in which the controller ServiceAccount must exist. */
	readonly namespace: string;
	/** Run and outbox authority. */
	readonly repository: RunDispatchRepository;
	/** Shared process logger carrying request and trace context. */
	readonly logger: AgentControllerRunDispatchLogger;
}

/** Non-locking candidate coordinates used only to establish canonical lock order. */
export interface RunOutboxCandidateRow
{
	/** Outbox event identifier. */
	readonly eventId: string;
	/** Logical run identifier. */
	readonly runId: string;
	/** Service authority that must be locked before the run and outbox row. */
	readonly agentServiceId: string;
}
