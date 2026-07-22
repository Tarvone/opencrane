import type { V1Job, V1NetworkPolicy, V1ResourceRequirements } from "@kubernetes/client-node";

/** Image pull behavior supported by Kubernetes containers. */
export type AgentRuntimeImagePullPolicy = "Always" | "IfNotPresent" | "Never";

/** Exact Helm release labels required by the server's runtime ingress selector. */
export interface AgentRuntimeReleaseSelectorLabels
{
	/** Shared OpenCrane chart name selected by the server NetworkPolicy. */
	readonly "app.kubernetes.io/name": string;
	/** Exact silo release name selected by the server NetworkPolicy. */
	readonly "app.kubernetes.io/instance": string;
}

/** Immutable release profile applied to every personal-runtime attempt Job. */
export interface AgentRuntimeJobProfile
{
	/** Immutable runtime image reference pinned by a SHA-256 digest. */
	readonly image: string;
	/** Kubernetes image pull behavior. */
	readonly imagePullPolicy: AgentRuntimeImagePullPolicy;
	/** Internal OpenCrane runtime-stream endpoint. */
	readonly runtimeStreamUrl: string;
	/** Namespace containing both the runtime Job and its OpenCrane server. */
	readonly serverNamespace: string;
	/** Bounded runtime-profile ServiceAccount selected by the controller. */
	readonly serviceAccountName: string;
	/** Release selector labels required by the server's runtime ingress policy. */
	readonly releaseSelectorLabels: AgentRuntimeReleaseSelectorLabels;
	/** Internal server port admitted by the attempt NetworkPolicy. */
	readonly serverPort: number;
	/** Projected ServiceAccount token lifetime in seconds. */
	readonly projectedTokenTtlSeconds: number;
	/** Non-durable binary scratch quantity, capped at 1 GiB. */
	readonly scratchSize: string;
	/** Maximum wall-clock lifetime of one attempt. */
	readonly activeDeadlineSeconds: number;
	/** Cleanup delay after the attempt reaches a terminal Job state. */
	readonly ttlSecondsAfterFinished: number;
	/** Runtime container requests and limits. */
	readonly resources: V1ResourceRequirements;
}

/** Durable assignment coordinates used to derive one deterministic attempt workload. */
export interface AgentRuntimeJobAssignment
{
	/** Logical run identifier. */
	readonly runId: string;
	/** Positive attempt number within the logical run. */
	readonly attempt: number;
	/** Stable AgentService identifier executed by this attempt. */
	readonly agentServiceId: string;
	/** Immutable AgentRevision identifier executed by this attempt. */
	readonly agentRevisionId: string;
	/** Silo authority containing the run. */
	readonly siloId: string;
	/** Kubernetes namespace selected for the attempt. */
	readonly namespace: string;
}

/** Resources created together before a runtime attempt can be unsuspended. */
export interface AgentRuntimeJobResources
{
	/** Per-attempt deny-ingress and bounded-egress NetworkPolicy. */
	readonly networkPolicy: V1NetworkPolicy;
	/** Suspended, single-Pod Job representing exactly one run attempt. */
	readonly job: V1Job;
}
