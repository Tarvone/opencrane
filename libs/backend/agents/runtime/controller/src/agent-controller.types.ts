import type { V1Job, V1NetworkPolicy } from "@kubernetes/client-node";
import type { Logger } from "@opencrane/observability";
import type { AgentControllerRunAttemptAssignmentCommand, AgentControllerRunAttemptAssignmentResult, AgentControllerRunAttemptClaim } from "@opencrane/contracts";
import type { AgentRuntimeJobProfile } from "@opencrane/backend/agents/runtime/k8s-launcher";

/** Immutable runtime profiles keyed by the authority-owned profile name. */
export type AgentControllerRuntimeProfiles = Readonly<Record<string, AgentRuntimeJobProfile>>;

/** OpenCrane authority operations available to the outbound-only controller. */
export interface AgentControllerAuthority
{
	/** Claim one durable run-attempt request, or return null when no work is ready. */
	__Claim(signal: AbortSignal): Promise<AgentControllerRunAttemptClaim | null>;
	/** Atomically persist the exact suspended Job UID for the claimed attempt. */
	__CommitAssignment(eventId: string, command: AgentControllerRunAttemptAssignmentCommand, signal: AbortSignal): Promise<AgentControllerRunAttemptAssignmentResult>;
}

/** Kubernetes operations available to one reduced controller reconciliation. */
export interface AgentControllerKubernetesStore
{
	/** Create or exact-adopt the attempt NetworkPolicy without replacing it. */
	__EnsureNetworkPolicy(expected: V1NetworkPolicy): Promise<V1NetworkPolicy>;
	/** Create or exact-adopt the suspended attempt Job without changing it. */
	__EnsureSuspendedJob(expected: V1Job): Promise<V1Job>;
}

/** Dependencies and fixed policy for the controller reconciliation loop. */
export interface AgentControllerOptions
{
	/** Authenticated OpenCrane desired-state and assignment authority. */
	readonly authority: AgentControllerAuthority;
	/** Get/create-only Kubernetes adapter. */
	readonly kubernetes: AgentControllerKubernetesStore;
	/** Profiles selected by the claimed workload-profile name. */
	readonly profiles: AgentControllerRuntimeProfiles;
	/** Sole namespace this per-silo controller may mutate. */
	readonly namespace: string;
	/** Delay after an empty poll or a handled reconciliation failure. */
	readonly pollIntervalMilliseconds: number;
	/** Process-wide structured logger. */
	readonly log: Logger;
}

/** Result of one desired-state poll. */
export type AgentControllerReconcileResult =
	| { readonly outcome: "idle" }
	| { readonly outcome: "assigned" | "idempotent"; readonly eventId: string; readonly runId: string; readonly attempt: number; readonly workloadUid: string };

/** Fetch-compatible function injected into the HTTP adapter. */
export type AgentControllerFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Rotating projected-token reader injected into the HTTP adapter. */
export type AgentControllerTokenReader = () => Promise<string>;

/** Configuration for the projected-token-authenticated OpenCrane adapter. */
export interface AgentControllerHttpAuthorityOptions
{
	/** Internal OpenCrane base URL with no path, query, or credentials. */
	readonly openCraneInternalUrl: string;
	/** Absolute path of the rotating projected controller token. */
	readonly tokenPath: string;
	/** Hard timeout for one HTTP exchange. */
	readonly requestTimeoutMilliseconds: number;
	/** Optional fetch seam used by focused tests. */
	readonly fetch?: AgentControllerFetch;
	/** Optional rotating-token seam used by focused tests. */
	readonly readToken?: AgentControllerTokenReader;
}

/** Narrow Batch API surface used by the get/create-only store. */
export interface AgentControllerBatchApi
{
	/** Create one suspended namespaced Job. */
	createNamespacedJob(request: { readonly namespace: string; readonly body: V1Job }): Promise<V1Job>;
	/** Read one deterministic Job after an AlreadyExists response. */
	readNamespacedJob(request: { readonly namespace: string; readonly name: string }): Promise<V1Job>;
}

/** Narrow Networking API surface used by the get/create-only store. */
export interface AgentControllerNetworkingApi
{
	/** Create one attempt-scoped namespaced NetworkPolicy. */
	createNamespacedNetworkPolicy(request: { readonly namespace: string; readonly body: V1NetworkPolicy }): Promise<V1NetworkPolicy>;
	/** Read one deterministic NetworkPolicy after an AlreadyExists response. */
	readNamespacedNetworkPolicy(request: { readonly namespace: string; readonly name: string }): Promise<V1NetworkPolicy>;
}

/** Clients required by the Kubernetes adapter. */
export interface AgentControllerKubernetesStoreOptions
{
	/** Kubernetes Batch client limited by Role to Jobs. */
	readonly batchApi: AgentControllerBatchApi;
	/** Kubernetes Networking client limited by Role to NetworkPolicies. */
	readonly networkingApi: AgentControllerNetworkingApi;
}
