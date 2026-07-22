import type { Prisma } from "@prisma/client";

import type { CompiledRunInput, RunInputSnapshot } from "@opencrane/contracts";

/**
 * Injected control-plane compiler that hydrates an immutable snapshot into the literal compiled
 * input carried on `start_attempt`.
 *
 * The dispatch authority calls it inside the same locked transaction that loads the snapshot, so it
 * reads only immutable records and must return byte-identical output for a given snapshot on every
 * mint and idempotent redelivery. The runtime treats the returned payload as opaque.
 */
export type RunInputCompiler = (snapshot: RunInputSnapshot, transaction: Prisma.TransactionClient) => Promise<CompiledRunInput>;

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
