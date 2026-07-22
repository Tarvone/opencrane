import { isDeepStrictEqual } from "node:util";

import { Observable, type ConfigurationOptions, type ObservableMiddleware, type RequestContext, type ResponseContext, type V1Job, type V1ObjectMeta, type V1Pod, type V1Secret } from "@kubernetes/client-node";
import { __DeriveAgentRuntimeReleaseDeadlineSeconds } from "@opencrane/backend/agents/runtime/k8s-launcher";
import { ___DoWithTrace } from "@opencrane/observability";

import type { AgentControllerKubernetesStore, AgentControllerKubernetesStoreOptions } from "./agent-controller.types.js";

/** Kubernetes-managed metadata fields excluded from an owned-contract comparison. */
const _SERVER_METADATA_FIELDS = ["creationTimestamp", "generation", "managedFields", "resourceVersion", "selfLink", "uid"] as const;

/** Attach one combined shutdown and deadline signal to the generated Kubernetes request. */
function _KubernetesRequestOptions(shutdownSignal: AbortSignal, timeoutMilliseconds: number): ConfigurationOptions
{
	const signal = AbortSignal.any([shutdownSignal, AbortSignal.timeout(timeoutMilliseconds)]);
	const middleware: ObservableMiddleware = {
		pre(context: RequestContext): Observable<RequestContext>
		{
			context.setSignal(signal);
			return new Observable(Promise.resolve(context));
		},
		post(context: ResponseContext): Observable<ResponseContext>
		{
			return new Observable(Promise.resolve(context));
		},
	};
	return { middleware: [middleware], middlewareMergeStrategy: "append" };
}

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
function _Coordinates(resource: V1Job): { readonly name: string; readonly namespace: string }
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

/** Assert an API result is the complete assigned Job, allowing only its durable release state. */
function _AssertExactAssignedJob(current: V1Job, expected: V1Job, workloadUid: string): void
{
	if (current.metadata?.uid !== workloadUid || (current.spec?.suspend !== true && current.spec?.suspend !== false))
	{
		throw new Error("refusing to adopt a Job outside the exact durable workload assignment");
	}
	const expectedAtCurrentReleaseState = structuredClone(expected);
	if (!expectedAtCurrentReleaseState.spec)
	{
		throw new Error("expected runtime Job is missing its owned specification");
	}
	expectedAtCurrentReleaseState.spec.suspend = current.spec.suspend;
	if (current.spec.suspend === false)
	{
		const currentDeadline = current.spec.activeDeadlineSeconds;
		const maximumDeadline = expected.spec?.activeDeadlineSeconds;
		if (!Number.isSafeInteger(currentDeadline) || currentDeadline! < 1 || !Number.isSafeInteger(maximumDeadline) || currentDeadline! > maximumDeadline!)
		{
			throw new Error("refusing to adopt a released Job outside its bounded assignment deadline");
		}
		expectedAtCurrentReleaseState.spec.activeDeadlineSeconds = currentDeadline;
	}
	if (!isDeepStrictEqual(_NormalizedJob(current), _NormalizedJob(expectedAtCurrentReleaseState)))
	{
		throw new Error("refusing to adopt a Job that differs from the assigned runtime workload");
	}
}

/** Require one conservative release deadline within the immutable profile maximum. */
function _AssertReleaseDeadline(expected: V1Job, activeDeadlineSeconds: number): void
{
	const maximumDeadline = expected.spec?.activeDeadlineSeconds;
	if (!Number.isSafeInteger(activeDeadlineSeconds) || activeDeadlineSeconds < 1 || !Number.isSafeInteger(maximumDeadline) || activeDeadlineSeconds > maximumDeadline!)
	{
		throw new Error("agent-controller release deadline exceeds the assigned runtime profile");
	}
}

/** Parse the canonical UTC timestamp required at the Kubernetes authority boundary. */
function _CanonicalUtcEpochMilliseconds(value: string): number
{
	const epochMilliseconds = Date.parse(value);
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isSafeInteger(epochMilliseconds) || new Date(epochMilliseconds).toISOString() !== value)
	{
		throw new Error("agent-controller release requires one canonical UTC authority instant");
	}
	return epochMilliseconds;
}

/**
 * Prove a released Job cannot execute beyond the absolute durable assignment expiry.
 * @param current - Exact UID-bound released Job returned by Kubernetes.
 * @param assignmentExpiresAt - Canonical absolute assignment expiry.
 * @param requiredDeadlineSeconds - Exact deadline required from an immediate patch response.
 */
function _AssertReleasedAssignmentDeadline(current: V1Job, assignmentExpiresAt: string, requiredDeadlineSeconds?: number): void
{
	const deadlineSeconds = current.spec?.activeDeadlineSeconds;
	if (!Number.isSafeInteger(deadlineSeconds) || (requiredDeadlineSeconds !== undefined && deadlineSeconds !== requiredDeadlineSeconds))
	{
		throw new Error("Kubernetes released the runtime Job with an unexpected assignment deadline");
	}
	const startTime = current.status?.startTime;
	if (startTime === undefined)
	{
		if (requiredDeadlineSeconds === undefined) throw new Error("released runtime Job is missing the start time required to prove assignment expiry");
		return;
	}
	const startEpochMilliseconds = startTime.getTime();
	const assignmentExpiresAtEpochMilliseconds = _CanonicalUtcEpochMilliseconds(assignmentExpiresAt);
	if (!Number.isSafeInteger(startEpochMilliseconds) || startEpochMilliseconds + (deadlineSeconds! * 1_000) > assignmentExpiresAtEpochMilliseconds)
	{
		throw new Error("released runtime Job can outlive its absolute assignment expiry");
	}
}

/** Require the API-issued identity needed by the conditional release patch. */
function _JobReleaseIdentity(job: V1Job): { readonly name: string; readonly namespace: string; readonly uid: string; readonly resourceVersion: string }
{
	const { name, namespace } = _Coordinates(job);
	const uid = job.metadata?.uid;
	const resourceVersion = job.metadata?.resourceVersion;
	if (!uid || !resourceVersion)
	{
		throw new Error("assigned runtime Job is missing UID or resourceVersion for conditional release");
	}
	return { name, namespace, uid, resourceVersion };
}

/** Build the exact label selector permitted by the controller's Pod-list Role. */
function _RuntimePodSelector(jobName: string, workloadUid: string): string
{
	return `batch.kubernetes.io/controller-uid=${workloadUid},opencrane.ai/runtime-attempt=${jobName}`;
}

/** Return the exact labels Kubernetes must place on the first Pod for this Job. */
function _ExpectedPodLabels(expectedJob: V1Job, workloadUid: string): Record<string, string>
{
	const name = expectedJob.metadata?.name;
	const authored = expectedJob.spec?.template.metadata?.labels;
	if (!name || !authored)
	{
		throw new Error("expected runtime Job is missing deterministic Pod labels");
	}
	return {
		...authored,
		"batch.kubernetes.io/controller-uid": workloadUid,
		"batch.kubernetes.io/job-name": name,
		"controller-uid": workloadUid,
		"job-name": name,
	};
}

/** Assert one listed Pod is the exact first Pod owned by the assigned Job. */
function _AssertExactRuntimePod(pod: V1Pod, expectedJob: V1Job, workloadUid: string, serviceAccountName: string): string
{
	const jobName = expectedJob.metadata?.name;
	const namespace = expectedJob.metadata?.namespace;
	const podUid = pod.metadata?.uid;
	const ownerReferences = pod.metadata?.ownerReferences ?? [];
	const controllerOwner = ownerReferences.filter(function _controllerOwner(reference) { return reference.controller === true; });
	if (!jobName || !namespace || !podUid || pod.metadata?.namespace !== namespace || pod.spec?.serviceAccountName !== serviceAccountName || (pod.spec.serviceAccount !== undefined && pod.spec.serviceAccount !== serviceAccountName) || !isDeepStrictEqual(pod.metadata?.labels, _ExpectedPodLabels(expectedJob, workloadUid)) || ownerReferences.length !== 1 || controllerOwner.length !== 1)
	{
		throw new Error("refusing to register a Pod that differs from the assigned runtime workload");
	}
	const owner = controllerOwner[0];
	if (owner.apiVersion !== "batch/v1" || owner.kind !== "Job" || owner.name !== jobName || owner.uid !== workloadUid)
	{
		throw new Error("refusing to register a Pod without the exact assigned Job owner");
	}
	return podUid;
}

/**
 * Create the only Kubernetes adapter used by the reduced agent-controller slice.
 *
 * Creation and the fenced `suspend=false` transition are the only mutations. An AlreadyExists
 * response becomes an exact owned-contract check, so a colliding or externally changed object stops
 * reconciliation instead of being silently adopted as the authorised run attempt.
 * @param options - Batch and Core clients constrained by namespaced least privilege.
 * @returns Exact adoption, conditional release, and first-Pod discovery operations.
 */
export function __CreateKubernetesAgentControllerStore(options: AgentControllerKubernetesStoreOptions): AgentControllerKubernetesStore
{
	if (!Number.isSafeInteger(options.requestTimeoutMilliseconds) || options.requestTimeoutMilliseconds < 1_000 || options.requestTimeoutMilliseconds > 60_000)
	{
		throw new Error("agent controller Kubernetes store requires a 1-60s request timeout");
	}
	return {
		async __EnsureSuspendedJob(expected: V1Job): Promise<V1Job>
		{
			const { name, namespace } = _Coordinates(expected);
			return ___DoWithTrace("agent_controller.job.ensure", { name, namespace }, async function _ensureSuspendedJob()
			{
				try
				{
					const created = await options.batchApi.createNamespacedJob({ namespace, body: expected }, _KubernetesRequestOptions(options.shutdownSignal, options.requestTimeoutMilliseconds));
					_AssertExactSuspendedJob(created, expected);
					return created;
				}
				catch (err)
				{
					if (_StatusCode(err) !== 409) throw err;
					const current = await options.batchApi.readNamespacedJob({ namespace, name }, _KubernetesRequestOptions(options.shutdownSignal, options.requestTimeoutMilliseconds));
					_AssertExactSuspendedJob(current, expected);
					return current;
				}
			});
		},
		async __EnsureAttemptKeySecret(expected: V1Secret): Promise<void>
			{
				const name = expected.metadata?.name;
				const namespace = expected.metadata?.namespace;
				if (!name || !namespace)
				{
					throw new Error("agent-controller attempt-key Secret requires deterministic namespaced metadata");
				}
				await ___DoWithTrace("agent_controller.secret.ensure", { name, namespace }, async function _ensureAttemptKeySecret(): Promise<void>
				{
					try
					{
						await options.coreApi.createNamespacedSecret({ namespace, body: expected }, _KubernetesRequestOptions(options.shutdownSignal, options.requestTimeoutMilliseconds));
					}
					catch (err)
					{
						// Create-only Role: an AlreadyExists response is the idempotent replay of this exact
						// attempt's prior Secret creation. The name is attempt-deterministic and this
						// controller is the sole principal with `secrets: create` in the isolated runtime
						// namespace, so a colliding foreign Secret cannot exist; 409 is accepted without a read
						// because the Role grants no `get`/`list`.
						if (_StatusCode(err) !== 409) throw err;
					}
				});
			},
		async __EnsureRuntimeJobReleased(expected: V1Job, workloadUid: string, assignmentExpiresAt: string, releaseLeaseExpiresAt: string): Promise<V1Job>
		{
			const { name, namespace } = _Coordinates(expected);
			const assignmentExpiresAtEpochMilliseconds = _CanonicalUtcEpochMilliseconds(assignmentExpiresAt);
			const releaseLeaseExpiresAtEpochMilliseconds = _CanonicalUtcEpochMilliseconds(releaseLeaseExpiresAt);
			return ___DoWithTrace("agent_controller.job.release", { name, namespace, workloadUid, assignmentExpiresAt }, async function _releaseRuntimeJob()
			{
				// 1. Read and exact-adopt the durable assignment before considering any mutation.
				const current = await options.batchApi.readNamespacedJob({ namespace, name }, _KubernetesRequestOptions(options.shutdownSignal, options.requestTimeoutMilliseconds));
				_AssertExactAssignedJob(current, expected, workloadUid);
				if (current.spec?.suspend === false)
				{
					_AssertReleasedAssignmentDeadline(current, assignmentExpiresAt);
					return current;
				}
				const previousDeadline = current.spec?.activeDeadlineSeconds;
				if (!Number.isSafeInteger(previousDeadline)) throw new Error("assigned runtime Job is missing its profile deadline");
				const releaseUpperBoundEpochMilliseconds = Math.max(Date.now(), releaseLeaseExpiresAtEpochMilliseconds) + options.requestTimeoutMilliseconds;
				const activeDeadlineSeconds = __DeriveAgentRuntimeReleaseDeadlineSeconds(assignmentExpiresAt, releaseUpperBoundEpochMilliseconds, previousDeadline!);
				_AssertReleaseDeadline(expected, activeDeadlineSeconds);

				// 2. Compare-and-swap every identity fence so stale replicas cannot release changed work.
				const identity = _JobReleaseIdentity(current);
				const released = await options.batchApi.patchNamespacedJob({
					name: identity.name,
					namespace: identity.namespace,
					body: [
						{ op: "test", path: "/metadata/uid", value: identity.uid },
						{ op: "test", path: "/metadata/resourceVersion", value: identity.resourceVersion },
						{ op: "test", path: "/spec/suspend", value: true },
						{ op: "test", path: "/spec/activeDeadlineSeconds", value: previousDeadline! },
						{ op: "replace", path: "/spec/activeDeadlineSeconds", value: activeDeadlineSeconds },
						{ op: "replace", path: "/spec/suspend", value: false },
					],
				}, _KubernetesRequestOptions(options.shutdownSignal, options.requestTimeoutMilliseconds));

				// 3. Revalidate the API result so a surprising patch response never advances authority.
				_AssertExactAssignedJob(released, expected, workloadUid);
				if (released.spec?.suspend !== false)
				{
					throw new Error("Kubernetes did not release the exact assigned runtime Job");
				}
				_AssertReleasedAssignmentDeadline(released, new Date(assignmentExpiresAtEpochMilliseconds).toISOString(), activeDeadlineSeconds);
				return released;
			});
		},
		async __FindFirstRuntimePod(expectedJob: V1Job, workloadUid: string, serviceAccountName: string): Promise<V1Pod | null>
		{
			const { name, namespace } = _Coordinates(expectedJob);
			return ___DoWithTrace("agent_controller.pod.find_first", { name, namespace, workloadUid }, async function _findFirstRuntimePod()
			{
				const listed = await options.coreApi.listNamespacedPod({ namespace, labelSelector: _RuntimePodSelector(name, workloadUid) }, _KubernetesRequestOptions(options.shutdownSignal, options.requestTimeoutMilliseconds));
				if (listed.items.length === 0) return null;
				if (listed.items.length !== 1)
				{
					throw new Error("refusing to choose among multiple Pods for one assigned runtime Job");
				}
				_AssertExactRuntimePod(listed.items[0], expectedJob, workloadUid, serviceAccountName);
				return listed.items[0];
			});
		},
	};
}
