import { createHash } from "node:crypto";
import type { V1Job, V1NetworkPolicy } from "@kubernetes/client-node";

import { AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE, ___IsAgentRuntimeServiceAccountName } from "@opencrane/contracts";

import type { AgentRuntimeJobAssignment, AgentRuntimeJobProfile, AgentRuntimeJobResources } from "./agent-runtime-job.types.js";

/** Exact component label shared by the runtime Job and its attempt-scoped policy. */
const _COMPONENT_LABEL = "agent-runtime";

/** Exact projected-token path read by the runtime process. */
const _TOKEN_PATH = "/var/run/opencrane/tokens/runtime.token";

/** Hard ceiling for non-authoritative runtime-local scratch. */
const _MAX_SCRATCH_BYTES = 1_073_741_824n;

/** Reject blank or control-character-bearing authority coordinates. */
function _IsBoundedCoordinate(value: string): boolean
{
	return value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Validate a non-empty Kubernetes label value used by an exact selector. */
function _IsKubernetesLabelValue(value: string): boolean
{
	return value.length <= 63 && /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/.test(value);
}

/** Parse a positive binary Kubernetes storage quantity into bytes. */
function _ParseBinaryBytes(value: string): bigint | null
{
	const match = /^([1-9][0-9]*)(Ki|Mi|Gi|Ti|Pi|Ei)$/.exec(value);
	if (!match) return null;
	const exponent = { Ki: 1n, Mi: 2n, Gi: 3n, Ti: 4n, Pi: 5n, Ei: 6n }[match[2] as "Ki" | "Mi" | "Gi" | "Ti" | "Pi" | "Ei"];
	return BigInt(match[1]) * (1024n ** exponent);
}

/** Parse a positive Kubernetes CPU quantity into millicores. */
function _ParseCpuMillis(value: string): number | null
{
	const milli = /^([1-9][0-9]*)m$/.exec(value);
	const cores = /^([0-9]+(?:\.[0-9]+)?)$/.exec(value);
	const parsed = milli ? Number(milli[1]) : cores ? Number(cores[1]) * 1000 : 0;
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Validate the immutable profile before it reaches a Kubernetes API adapter. */
function _AssertProfile(profile: AgentRuntimeJobProfile): void
{
	// 1. Pin the image and stream to the exact in-cluster endpoint the policy will admit.
	const streamUrl = URL.parse(profile.runtimeStreamUrl);
	if (!_IsBoundedCoordinate(profile.image) || !/^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(profile.image) || !streamUrl || streamUrl.protocol !== "http:" || !streamUrl.hostname.endsWith(`.${profile.serverNamespace}.svc.cluster.local`) || Number(streamUrl.port || "80") !== profile.serverPort || streamUrl.pathname !== "/api/internal/agent-runtime" || streamUrl.search !== "" || streamUrl.hash !== "" || streamUrl.username !== "" || streamUrl.password !== "")
	{
		throw new Error("agent runtime profile requires an immutable image and an in-cluster HTTP stream URL");
	}

	// 2. Bind the profile to one same-namespace runtime identity class, never a per-user KSA.
	if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(profile.serverNamespace) || profile.serverNamespace.length > 63 || !___IsAgentRuntimeServiceAccountName(profile.serviceAccountName))
	{
		throw new Error("agent runtime profile requires one valid server namespace and bounded runtime ServiceAccount");
	}

	// 3. Require the release selectors and network/token bounds shared with the server policies.
	if (!_IsKubernetesLabelValue(profile.releaseSelectorLabels["app.kubernetes.io/name"] ?? "") || !_IsKubernetesLabelValue(profile.releaseSelectorLabels["app.kubernetes.io/instance"] ?? ""))
	{
		throw new Error("agent runtime profile requires exact release selector labels");
	}
	if (!Number.isSafeInteger(profile.serverPort) || profile.serverPort < 1 || profile.serverPort > 65535)
	{
		throw new Error("agent runtime profile requires a valid server port");
	}
	if (!Number.isSafeInteger(profile.projectedTokenTtlSeconds) || profile.projectedTokenTtlSeconds < 600 || profile.projectedTokenTtlSeconds > 3600)
	{
		throw new Error("agent runtime projected-token TTL must be between 600 and 3600 seconds");
	}

	// 4. Bound transient storage, lifecycle, CPU, and memory before the manifest reaches an adapter.
	const scratchBytes = _ParseBinaryBytes(profile.scratchSize);
	if (!scratchBytes || scratchBytes > _MAX_SCRATCH_BYTES || !Number.isSafeInteger(profile.activeDeadlineSeconds) || profile.activeDeadlineSeconds < 1 || !Number.isSafeInteger(profile.ttlSecondsAfterFinished) || profile.ttlSecondsAfterFinished < 0)
	{
		throw new Error("agent runtime profile requires bounded scratch and lifecycle settings");
	}
	const requestedCpu = _ParseCpuMillis(String(profile.resources.requests?.cpu ?? ""));
	const limitedCpu = _ParseCpuMillis(String(profile.resources.limits?.cpu ?? ""));
	const requestedMemory = _ParseBinaryBytes(String(profile.resources.requests?.memory ?? ""));
	const limitedMemory = _ParseBinaryBytes(String(profile.resources.limits?.memory ?? ""));
	if (!requestedCpu || !limitedCpu || requestedCpu > limitedCpu || !requestedMemory || !limitedMemory || requestedMemory > limitedMemory)
	{
		throw new Error("agent runtime profile requires valid CPU and memory requests no greater than limits");
	}
}

/** Validate assignment coordinates that cross from durable authority into Kubernetes metadata. */
function _AssertAssignment(assignment: AgentRuntimeJobAssignment): void
{
	if (!Number.isSafeInteger(assignment.attempt) || assignment.attempt < 1)
	{
		throw new Error("agent runtime attempt must be a positive safe integer");
	}
	for (const value of [assignment.runId, assignment.agentServiceId, assignment.agentRevisionId, assignment.siloId, assignment.namespace])
	{
		if (!_IsBoundedCoordinate(value))
		{
			throw new Error("agent runtime assignment contains an invalid authority coordinate");
		}
	}
	if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(assignment.namespace) || assignment.namespace.length > 63)
	{
		throw new Error("agent runtime namespace must be a valid DNS label");
	}
}

/** Require the Job and its selected server route to occupy the same NetworkPolicy namespace. */
function _AssertSameNamespace(assignment: AgentRuntimeJobAssignment, profile: AgentRuntimeJobProfile): void
{
	if (assignment.namespace !== profile.serverNamespace)
	{
		throw new Error("agent runtime Job and server must share one namespace");
	}
}

/** Derive the stable Kubernetes name shared by one run attempt's resources. */
function _AttemptResourceName(assignment: AgentRuntimeJobAssignment): string
{
	const digest = createHash("sha256").update(`${assignment.siloId}\u0000${assignment.runId}\u0000${assignment.attempt}`).digest("hex").slice(0, 24);
	return `agent-runtime-a${assignment.attempt}-${digest}`;
}

/** Build full authority annotations without forcing arbitrary identifiers into label grammar. */
function _AuthorityAnnotations(assignment: AgentRuntimeJobAssignment): Record<string, string>
{
	return {
		"opencrane.ai/run-id": assignment.runId,
		"opencrane.ai/run-attempt": String(assignment.attempt),
		"opencrane.ai/agent-service-id": assignment.agentServiceId,
		"opencrane.ai/agent-revision-id": assignment.agentRevisionId,
		"opencrane.ai/silo-id": assignment.siloId,
	};
}

/** Build selector-safe labels unique to the exact attempt. */
function _AttemptLabels(name: string, profile: AgentRuntimeJobProfile): Record<string, string>
{
	return {
		"app.kubernetes.io/name": profile.releaseSelectorLabels["app.kubernetes.io/name"],
		"app.kubernetes.io/instance": profile.releaseSelectorLabels["app.kubernetes.io/instance"],
		"app.kubernetes.io/component": _COMPONENT_LABEL,
		"opencrane.ai/runtime-attempt": name,
	};
}

/** Build a policy that denies ingress and permits only the server stream plus DNS egress. */
function _BuildNetworkPolicy(assignment: AgentRuntimeJobAssignment, profile: AgentRuntimeJobProfile, name: string, labels: Record<string, string>): V1NetworkPolicy
{
	return {
		apiVersion: "networking.k8s.io/v1",
		kind: "NetworkPolicy",
		metadata: { name, namespace: assignment.namespace, labels: { ...labels }, annotations: _AuthorityAnnotations(assignment) },
		spec: {
			podSelector: { matchLabels: { "opencrane.ai/runtime-attempt": name } },
			policyTypes: ["Ingress", "Egress"],
			ingress: [],
			egress: [
				{ to: [{ podSelector: { matchLabels: { "app.kubernetes.io/name": profile.releaseSelectorLabels["app.kubernetes.io/name"], "app.kubernetes.io/instance": profile.releaseSelectorLabels["app.kubernetes.io/instance"], "app.kubernetes.io/component": "opencrane-server" } } }], ports: [{ protocol: "TCP", port: profile.serverPort }] },
				{ to: [{ namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "kube-system" } }, podSelector: { matchLabels: { "k8s-app": "kube-dns" } } }], ports: [{ protocol: "UDP", port: 53 }, { protocol: "TCP", port: 53 }] },
			],
		},
	};
}

/** Build the suspended, one-Pod Job that cannot run before durable assignment commits. */
function _BuildJob(assignment: AgentRuntimeJobAssignment, profile: AgentRuntimeJobProfile, name: string, labels: Record<string, string>): V1Job
{
	return {
		apiVersion: "batch/v1",
		kind: "Job",
		metadata: { name, namespace: assignment.namespace, labels: { ...labels }, annotations: _AuthorityAnnotations(assignment) },
		spec: {
			suspend: true,
			parallelism: 1,
			completions: 1,
			backoffLimit: 0,
			activeDeadlineSeconds: profile.activeDeadlineSeconds,
			ttlSecondsAfterFinished: profile.ttlSecondsAfterFinished,
			template: {
				metadata: { labels: { ...labels }, annotations: _AuthorityAnnotations(assignment) },
					spec: {
					serviceAccountName: profile.serviceAccountName,
					automountServiceAccountToken: false,
					enableServiceLinks: false,
					restartPolicy: "Never",
					securityContext: { runAsNonRoot: true, runAsUser: 65532, runAsGroup: 65532, fsGroup: 65532, fsGroupChangePolicy: "OnRootMismatch", seccompProfile: { type: "RuntimeDefault" } },
					containers: [{
						name: _COMPONENT_LABEL,
						image: profile.image,
						imagePullPolicy: profile.imagePullPolicy,
						securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] }, readOnlyRootFilesystem: true },
						env: [
							{ name: "OPENCRANE_RUNTIME_STREAM_URL", value: profile.runtimeStreamUrl },
							{ name: "OPENCRANE_RUNTIME_TOKEN_PATH", value: _TOKEN_PATH },
							{ name: "POD_UID", valueFrom: { fieldRef: { fieldPath: "metadata.uid" } } },
						],
						volumeMounts: [
							{ name: "runtime-token", mountPath: "/var/run/opencrane/tokens", readOnly: true },
							{ name: "scratch", mountPath: "/tmp" },
						],
						resources: structuredClone(profile.resources),
					}],
					volumes: [
						{ name: "runtime-token", projected: { defaultMode: 0o440, sources: [{ serviceAccountToken: { path: "runtime.token", audience: AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE, expirationSeconds: profile.projectedTokenTtlSeconds } }] } },
						{ name: "scratch", emptyDir: { sizeLimit: profile.scratchSize } },
					],
				},
			},
		},
	};
}

/**
 * Build the exact Kubernetes resource set for one personal-runtime attempt. The returned Job is
 * always suspended; the controller may unsuspend it only after persisting the Job UID together
 * with the PendingPod assignment and one-time bootstrap in the same authority transition.
 */
export function __BuildSuspendedAgentRuntimeJobResources(assignment: AgentRuntimeJobAssignment, profile: AgentRuntimeJobProfile): AgentRuntimeJobResources
{
	// 1. Reject malformed authority and release inputs before any adapter can send them to Kubernetes.
	_AssertAssignment(assignment);
	_AssertProfile(profile);
	_AssertSameNamespace(assignment, profile);

	// 2. Derive one collision-resistant identity reused across the Job and policy selectors.
	const name = _AttemptResourceName(assignment);
	const labels = _AttemptLabels(name, profile);

	// 3. Return an inseparable zero-RBAC, bounded-network, suspended attempt resource set.
	return {
		networkPolicy: _BuildNetworkPolicy(assignment, profile, name, labels),
		job: _BuildJob(assignment, profile, name, labels),
	};
}
