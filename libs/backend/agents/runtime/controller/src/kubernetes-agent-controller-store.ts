import { isDeepStrictEqual } from "node:util";

import type { V1Job, V1NetworkPolicy, V1ObjectMeta } from "@kubernetes/client-node";
import { ___DoWithTrace } from "@opencrane/observability";

import type { AgentControllerKubernetesStore, AgentControllerKubernetesStoreOptions } from "./agent-controller.types.js";

/** Kubernetes-managed metadata fields excluded from an owned-contract comparison. */
const _SERVER_METADATA_FIELDS = ["creationTimestamp", "generation", "managedFields", "resourceVersion", "selfLink", "uid"] as const;

/** Read a Kubernetes HTTP status from the client library's supported error shapes. */
function _StatusCode(err: unknown): number | undefined
{
	if (typeof err !== "object" || err === null) return undefined;
	const record = err as Record<string, unknown>;
	if (typeof record.statusCode === "number") return record.statusCode;
	if (typeof record.code === "number") return record.code;
	const body = typeof record.body === "object" && record.body !== null ? record.body as Record<string, unknown> : null;
	return typeof body?.code === "number" ? body.code : undefined;
}

/** Require deterministic namespaced metadata before making a Kubernetes call. */
function _Coordinates(resource: V1Job | V1NetworkPolicy): { readonly name: string; readonly namespace: string }
{
	const name = resource.metadata?.name;
	const namespace = resource.metadata?.namespace;
	if (!name || !namespace)
	{
		throw new Error("agent-controller resources require deterministic namespaced metadata");
	}
	return { name, namespace };
}

/** Remove API-server bookkeeping while retaining every controller-owned metadata field. */
function _OwnedMetadata(metadata: V1ObjectMeta | undefined): V1ObjectMeta
{
	const owned = structuredClone(metadata ?? {});
	for (const field of _SERVER_METADATA_FIELDS)
	{
		delete (owned as Record<string, unknown>)[field];
	}
	return owned;
}

/** Assert an API result still equals the entire controller-authored NetworkPolicy. */
function _AssertExactNetworkPolicy(current: V1NetworkPolicy, expected: V1NetworkPolicy): void
{
	const currentContract = { apiVersion: current.apiVersion, kind: current.kind, metadata: _OwnedMetadata(current.metadata), spec: current.spec };
	const expectedContract = { apiVersion: expected.apiVersion, kind: expected.kind, metadata: _OwnedMetadata(expected.metadata), spec: expected.spec };
	if (!isDeepStrictEqual(currentContract, expectedContract))
	{
		throw new Error("refusing to adopt a NetworkPolicy that differs from the claimed runtime attempt");
	}
}

/** Remove one known API default only when it carries the canonical default value. */
function _DeleteDefault(record: Record<string, unknown>, key: string, expected: unknown): void
{
	if (key in record && isDeepStrictEqual(record[key], expected)) delete record[key];
}

/** Validate and remove selector labels Kubernetes derives from the immutable Job UID and name. */
function _RemoveGeneratedJobSelectors(job: Record<string, unknown>): void
{
	const metadata = job.metadata as Record<string, unknown> | undefined;
	const spec = job.spec as Record<string, unknown> | undefined;
	const template = spec?.template as Record<string, unknown> | undefined;
	const templateMetadata = template?.metadata as Record<string, unknown> | undefined;
	const labels = templateMetadata?.labels as Record<string, unknown> | undefined;
	const selector = spec?.selector as Record<string, unknown> | undefined;
	const matchLabels = selector?.matchLabels as Record<string, unknown> | undefined;
	const uid = metadata?.uid;
	const name = metadata?.name;
	if (!selector) return;
	if (!spec || !labels || !matchLabels || typeof uid !== "string" || typeof name !== "string")
	{
		throw new Error("refusing to adopt a Job with incomplete Kubernetes ownership selectors");
	}
	const expectedLabels = { "batch.kubernetes.io/controller-uid": uid, "batch.kubernetes.io/job-name": name, "controller-uid": uid, "job-name": name };
	for (const [key, value] of Object.entries(expectedLabels))
	{
		if (matchLabels?.[key] !== value || labels?.[key] !== value)
		{
			throw new Error("refusing to adopt a Job with mismatched Kubernetes ownership selectors");
		}
		delete labels[key];
	}
	if (!isDeepStrictEqual(matchLabels, expectedLabels))
	{
		throw new Error("refusing to adopt a Job with unexpected Kubernetes ownership selectors");
	}
	delete spec.selector;
}

/** Normalize only documented Kubernetes defaults before exact Job-contract comparison. */
function _NormalizedJob(job: V1Job): Record<string, unknown>
{
	const normalized = structuredClone(job) as unknown as Record<string, unknown>;
	delete normalized.status;
	_RemoveGeneratedJobSelectors(normalized);
	normalized.metadata = _OwnedMetadata(job.metadata) as unknown as Record<string, unknown>;
	const spec = normalized.spec as Record<string, unknown>;
	_DeleteDefault(spec, "manualSelector", false);
	_DeleteDefault(spec, "completionMode", "NonIndexed");
	_DeleteDefault(spec, "podReplacementPolicy", "TerminatingOrFailed");
	const template = spec.template as Record<string, unknown>;
	const podSpec = template.spec as Record<string, unknown>;
	_DeleteDefault(podSpec, "serviceAccount", podSpec.serviceAccountName);
	_DeleteDefault(podSpec, "dnsPolicy", "ClusterFirst");
	_DeleteDefault(podSpec, "schedulerName", "default-scheduler");
	_DeleteDefault(podSpec, "terminationGracePeriodSeconds", 30);
	const containers = podSpec.containers as Array<Record<string, unknown>>;
	for (const container of containers)
	{
		_DeleteDefault(container, "terminationMessagePath", "/dev/termination-log");
		_DeleteDefault(container, "terminationMessagePolicy", "File");
	}
	return normalized;
}

/** Assert an API result is the complete suspended Job authored for this claim. */
function _AssertExactSuspendedJob(current: V1Job, expected: V1Job): void
{
	if (current.spec?.suspend !== true || !isDeepStrictEqual(_NormalizedJob(current), _NormalizedJob(expected)))
	{
		throw new Error("refusing to adopt a Job that differs from the claimed suspended runtime attempt");
	}
}

/**
 * Create the only Kubernetes adapter used by the reduced agent-controller slice.
 *
 * Creation is the sole mutation. An AlreadyExists response becomes an exact owned-contract check,
 * never a patch or replacement, so a colliding or externally changed object stops reconciliation
 * instead of being silently adopted as the authorised run attempt.
 * @param options - Batch and Networking clients constrained by namespaced get/create RBAC.
 * @returns Exact-adoption operations for attempt policies and suspended Jobs.
 */
export function __CreateKubernetesAgentControllerStore(options: AgentControllerKubernetesStoreOptions): AgentControllerKubernetesStore
{
	return {
		async __EnsureNetworkPolicy(expected: V1NetworkPolicy): Promise<V1NetworkPolicy>
		{
			const { name, namespace } = _Coordinates(expected);
			return ___DoWithTrace("agent_controller.network_policy.ensure", { name, namespace }, async function _ensureNetworkPolicy()
			{
				try
				{
					const created = await options.networkingApi.createNamespacedNetworkPolicy({ namespace, body: expected });
					_AssertExactNetworkPolicy(created, expected);
					return created;
				}
				catch (err)
				{
					if (_StatusCode(err) !== 409) throw err;
					const current = await options.networkingApi.readNamespacedNetworkPolicy({ namespace, name });
					_AssertExactNetworkPolicy(current, expected);
					return current;
				}
			});
		},
		async __EnsureSuspendedJob(expected: V1Job): Promise<V1Job>
		{
			const { name, namespace } = _Coordinates(expected);
			return ___DoWithTrace("agent_controller.job.ensure", { name, namespace }, async function _ensureSuspendedJob()
			{
				try
				{
					const created = await options.batchApi.createNamespacedJob({ namespace, body: expected });
					_AssertExactSuspendedJob(created, expected);
					return created;
				}
				catch (err)
				{
					if (_StatusCode(err) !== 409) throw err;
					const current = await options.batchApi.readNamespacedJob({ namespace, name });
					_AssertExactSuspendedJob(current, expected);
					return current;
				}
			});
		},
	};
}
