/** Fixed, server-owned policy for minting and expiring runtime command frames. */
export interface RuntimeDispatchAuthorityConfig
{
	/** Dedicated namespace containing this silo's untrusted runtime Pods and no server workload. */
	readonly namespace: string;
	/** Hard lifetime stamped on each minted command frame, bounded by the durable assignment lease. */
	readonly commandTtlMilliseconds: number;
}

/** Verified workload identity handed to the dispatch authority by the app-owned transport. */
export interface RuntimeStreamWorkloadIdentity
{
	/** Kubernetes ServiceAccount subject returned by TokenReview. */
	readonly subject: string;
	/** Kubernetes namespace parsed from the authenticated subject. */
	readonly namespace: string;
	/** Kubernetes ServiceAccount name parsed from the authenticated subject. */
	readonly serviceAccountName: string;
	/** Kubernetes Pod UID asserted by TokenReview for this projected token. */
	readonly podUid: string;
}

/** Stable result returned after a candidate reaches the authoritative run boundary. */
export interface RuntimeCandidateDispatchResult
{
	/** Whether the authority accepted this candidate or its idempotent replay. */
	readonly accepted: boolean;
	/** Machine-readable reason when the candidate was rejected. */
	readonly reason?: string;
}
