import { __BuildSuspendedAgentRuntimeJob, __DeriveAgentRuntimeReleaseDeadlineSeconds, type AgentRuntimeJobProfile } from "@opencrane/backend/agents/runtime/k8s-launcher";
import { ___DoWithTrace } from "@opencrane/observability";

import type { AgentControllerOptions, AgentControllerReconcileResult, AgentControllerRuntimeProfiles, AgentControllerRuntimeReleaseReconcileResult } from "./agent-controller.types.js";

/** Validate a DNS-label namespace before it becomes a Kubernetes authority boundary. */
function _IsNamespace(value: string): boolean
{
	return value.length <= 63 && /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value);
}

/** Resolve one exact configured profile without accepting prototype properties. */
function _ResolveProfile(profiles: AgentControllerRuntimeProfiles, name: string): AgentRuntimeJobProfile | undefined
{
	if (!Object.prototype.hasOwnProperty.call(profiles, name))
	{
		throw new Error(`agent controller has no configured runtime profile '${name}'`);
	}
	return profiles[name];
}

/**
 * Validate every deployment-supplied runtime profile through the canonical manifest builder.
 * @param value - Parsed JSON map whose values are candidate immutable runtime profiles.
 * @param runtimeNamespace - Dedicated runtime namespace, distinct from every profile's server namespace.
 * @returns A detached, validated runtime-profile map.
 */
export function __ValidateAgentControllerRuntimeProfiles(value: unknown, runtimeNamespace: string): AgentControllerRuntimeProfiles
{
	if (typeof value !== "object" || value === null || Array.isArray(value) || !_IsNamespace(runtimeNamespace))
	{
		throw new Error("agent controller profiles must be one object bound to a valid namespace");
	}
	const entries = Object.entries(value);
	if (entries.length === 0 || entries.length > 32)
	{
		throw new Error("agent controller requires between 1 and 32 bounded runtime profiles");
	}
	const profiles: Record<string, AgentRuntimeJobProfile> = Object.create(null) as Record<string, AgentRuntimeJobProfile>;
	for (const [name, candidate] of entries)
	{
		if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name) || name.length > 63 || typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
		{
			throw new Error("agent controller profile names and bodies must be bounded objects");
		}
		const profile = structuredClone(candidate) as AgentRuntimeJobProfile;
		if (profile.serverNamespace === runtimeNamespace)
		{
			throw new Error(`agent controller profile '${name}' must keep runtime and server namespaces separate`);
		}
		__BuildSuspendedAgentRuntimeJob({ runId: "profile-validation", attempt: 1, agentServiceId: "profile-validation", agentRevisionId: "profile-validation", siloId: "profile-validation", namespace: runtimeNamespace, bootstrapReference: "profile-validation" }, profile);
		profiles[name] = profile;
	}
	return profiles;
}

/** Require an immutable UID returned by the Kubernetes API rather than a locally derived value. */
function _RequireWorkloadUid(uid: string | undefined): string
{
	if (!uid || uid.trim().length === 0)
	{
		throw new Error("Kubernetes did not return an immutable UID for the suspended runtime Job");
	}
	return uid;
}

/** Wait for the next poll without keeping shutdown blocked behind a full timer. */
async function _Wait(milliseconds: number, signal: AbortSignal): Promise<void>
{
	if (signal.aborted) return;
	await new Promise<void>(function _wait(resolve)
	{
		/** Complete the delay once and release the listener retained by the process signal. */
		function _CompleteWait(): void
		{
			clearTimeout(timer);
			signal.removeEventListener("abort", _CompleteWait);
			resolve();
		}
		const timer = setTimeout(_CompleteWait, milliseconds);
		signal.addEventListener("abort", _CompleteWait, { once: true });
	});
}

/**
 * Reconcile at most one claimed run attempt into a durable, still-suspended assignment.
 *
 * Kubernetes is deliberately changed before the database commit only because the rendered Job is
 * suspended. A crash anywhere before the final commit therefore leaves an inert deterministic object
 * that a later reconciliation may exact-adopt; it cannot leave unrecorded agent code executing.
 * @param options - Fixed controller authority, namespace, profiles, and adapters.
 * @param signal - Process shutdown signal propagated to OpenCrane HTTP calls.
 * @returns Idle or the exact durable assignment outcome.
 */
export async function __ReconcileNextAgentRuntimeAttempt(options: AgentControllerOptions, signal: AbortSignal): Promise<AgentControllerReconcileResult>
{
	// 1. Claim desired state from Postgres through OpenCrane so Kubernetes never becomes business authority.
	const claim = await options.authority.__Claim(signal);
	if (!claim) return { outcome: "idle" };

	// 2. Bind the claim to this one silo and one immutable, preconfigured runtime profile.
	if (claim.attempt.namespace !== options.runtimeNamespace)
	{
		throw new Error("claimed runtime attempt targets a namespace outside this controller silo");
	}
	const profile = _ResolveProfile(options.profiles, claim.attempt.workloadProfile);
	if (!profile || profile.serverNamespace === options.runtimeNamespace)
	{
		throw new Error("claimed runtime profile is not bound to this controller silo");
	}
	const assignment = {
		runId: claim.attempt.runId,
		attempt: claim.attempt.attempt,
		agentServiceId: claim.attempt.agentServiceId,
		agentRevisionId: claim.attempt.agentRevisionId,
		siloId: claim.attempt.siloId,
		namespace: claim.attempt.namespace,
		bootstrapReference: claim.attempt.bootstrapReference,
	};
	const job = __BuildSuspendedAgentRuntimeJob(assignment, profile);

	// 3. Create or exact-adopt only the deterministic suspended Job and take its API-issued UID.
	const persistedJob = await options.kubernetes.__EnsureSuspendedJob(job);
	const workloadUid = _RequireWorkloadUid(persistedJob.metadata?.uid);

	// 4. Commit the exact UID; the separate durable release reconciliation may now unsuspend it.
	const committed = await options.authority.__CommitAssignment(claim.lease.eventId, {
		claimedAt: claim.lease.claimedAt,
		deliveryCount: claim.lease.deliveryCount,
		runId: claim.attempt.runId,
		attempt: claim.attempt.attempt,
		expectedWorkloadProfile: claim.attempt.workloadProfile,
		bootstrapReference: claim.attempt.bootstrapReference,
		namespace: claim.attempt.namespace,
		serviceAccountName: profile.serviceAccountName,
		workloadUid,
	}, signal);

	options.log.info({ eventId: claim.lease.eventId, runId: claim.attempt.runId, attempt: claim.attempt.attempt, workloadUid, outcome: committed.outcome }, "runtime attempt assigned to suspended Job");
	return { outcome: committed.outcome, eventId: claim.lease.eventId, runId: claim.attempt.runId, attempt: claim.attempt.attempt, workloadUid };
}

/** Require an immutable Pod UID observed through the Kubernetes API. */
function _RequirePodUid(uid: string | undefined): string
{
	if (!uid || uid.trim().length === 0)
	{
		throw new Error("Kubernetes did not return an immutable UID for the first runtime Pod");
	}
	return uid;
}

/**
 * Reconcile at most one durable workload release through exact Job and first-Pod evidence.
 *
 * The assigned Job is rebuilt from durable coordinates rather than trusted as mutable desired
 * state. The Kubernetes adapter may only release that exact Job through a compare-and-swap patch;
 * Pod registration then closes the bootstrap identity fence in OpenCrane before runtime exchange.
 * @param options - Fixed controller authority, namespace, profiles, and adapters.
 * @param signal - Process shutdown signal propagated to OpenCrane HTTP calls.
 * @returns Idle, waiting for Kubernetes to create the first Pod, or the registration outcome.
 */
export async function __ReconcileNextRuntimeRelease(options: AgentControllerOptions, signal: AbortSignal): Promise<AgentControllerRuntimeReleaseReconcileResult>
{
	return ___DoWithTrace("agent_controller.workload_release.reconcile", { namespace: options.runtimeNamespace }, async function _reconcileWorkloadRelease(): Promise<AgentControllerRuntimeReleaseReconcileResult>
	{
		// 1. Claim a durable release generation so stale controller replicas cannot register a Pod.
		const claim = await options.authority.__ClaimWorkloadRelease(signal);
		if (!claim) return { outcome: "idle" };

		// 2. Rebuild the exact assigned Job from authority coordinates and the fixed release profile.
		if (claim.workload.namespace !== options.runtimeNamespace)
		{
			throw new Error("claimed runtime release targets a namespace outside this controller silo");
		}
		const profile = _ResolveProfile(options.profiles, claim.workload.workloadProfile);
		if (!profile || profile.serverNamespace === options.runtimeNamespace || profile.serviceAccountName !== claim.workload.serviceAccountName)
		{
			throw new Error("claimed runtime release does not match this silo's bounded workload profile");
		}
		const job = __BuildSuspendedAgentRuntimeJob({
			runId: claim.workload.runId,
			attempt: claim.workload.attempt,
			agentServiceId: claim.workload.agentServiceId,
			agentRevisionId: claim.workload.agentRevisionId,
			siloId: claim.workload.siloId,
			namespace: claim.workload.namespace,
			bootstrapReference: claim.workload.bootstrapReference,
		}, profile);

		// 3. Reject already-expired authority, then let the Kubernetes adapter reserve its I/O budget.
		const authorityUpperBoundEpochMilliseconds = Math.max(Date.now(), Date.parse(claim.lease.expiresAt));
		__DeriveAgentRuntimeReleaseDeadlineSeconds(claim.workload.assignmentExpiresAt, authorityUpperBoundEpochMilliseconds, profile.activeDeadlineSeconds);
		await options.kubernetes.__EnsureRuntimeJobReleased(job, claim.workload.workloadUid, claim.workload.assignmentExpiresAt, claim.lease.expiresAt);

		// 4. Wait for one uniquely owned first Pod without choosing among ambiguous candidates.
		const pod = await options.kubernetes.__FindFirstRuntimePod(job, claim.workload.workloadUid, claim.workload.serviceAccountName);
		if (!pod)
		{
			return { outcome: "pending-pod", eventId: claim.lease.eventId, runId: claim.workload.runId, attempt: claim.workload.attempt, workloadUid: claim.workload.workloadUid };
		}
		const podUid = _RequirePodUid(pod.metadata?.uid);

		// 5. Register the exact Pod through Postgres authority before runtime may exchange bootstrap.
		const registered = await options.authority.__RegisterFirstPod(claim.lease.eventId, {
			claimedAt: claim.lease.claimedAt,
			deliveryCount: claim.lease.deliveryCount,
			runId: claim.workload.runId,
			attempt: claim.workload.attempt,
			siloId: claim.workload.siloId,
			agentServiceId: claim.workload.agentServiceId,
			agentRevisionId: claim.workload.agentRevisionId,
			namespace: claim.workload.namespace,
			serviceAccountName: claim.workload.serviceAccountName,
			workloadUid: claim.workload.workloadUid,
			workloadProfile: claim.workload.workloadProfile,
			bootstrapReference: claim.workload.bootstrapReference,
			podUid,
		}, signal);

		options.log.info({ eventId: claim.lease.eventId, runId: claim.workload.runId, attempt: claim.workload.attempt, workloadUid: claim.workload.workloadUid, podUid, outcome: registered.outcome }, "runtime workload released and first Pod registered");
		return { outcome: registered.outcome, eventId: claim.lease.eventId, runId: claim.workload.runId, attempt: claim.workload.attempt, workloadUid: claim.workload.workloadUid, podUid };
	});
}

/**
 * Poll OpenCrane until shutdown, advancing assignment and release as separate durable claims.
 *
 * Reconciliation failures are isolated to one poll and logged structurally. The loop never repairs,
 * replaces, or deletes a mismatching Kubernetes object because doing so would hide authority drift.
 * @param options - Fixed controller authority, namespace, profiles, adapters, and logger.
 * @param signal - Process shutdown signal.
 */
export async function __RunAgentController(options: AgentControllerOptions, signal: AbortSignal): Promise<void>
{
	const outboxPruneIntervalMilliseconds = options.outboxPruneIntervalMilliseconds ?? 3_600_000;
	if (!_IsNamespace(options.runtimeNamespace) || !Number.isSafeInteger(options.pollIntervalMilliseconds) || options.pollIntervalMilliseconds < 100 || options.pollIntervalMilliseconds > 60_000 || !Number.isSafeInteger(outboxPruneIntervalMilliseconds) || outboxPruneIntervalMilliseconds < 60_000 || outboxPruneIntervalMilliseconds > 86_400_000)
	{
		throw new Error("agent controller requires a valid namespace, 100-60000ms poll interval, and 60s-24h outbox prune interval");
	}
	let nextOutboxPruneAt = Date.now();
	while (!signal.aborted)
	{
		let didWork = false;
		try
		{
			const result = await __ReconcileNextAgentRuntimeAttempt(options, signal);
			didWork = result.outcome !== "idle";
		}
		catch (err)
		{
			if (signal.aborted) break;
			options.log.error({ err }, "agent controller attempt reconciliation failed");
		}
		try
		{
			const release = await __ReconcileNextRuntimeRelease(options, signal);
			didWork = didWork || (release.outcome !== "idle" && release.outcome !== "pending-pod");
		}
		catch (err)
		{
			if (signal.aborted) break;
			options.log.error({ err }, "agent controller workload-release reconciliation failed");
		}
		if (options.authority.__PrunePublishedOutbox && Date.now() >= nextOutboxPruneAt)
		{
			try
			{
				const deletedCount = await options.authority.__PrunePublishedOutbox(signal);
				if (deletedCount > 0) options.log.info({ deletedCount }, "retention-expired runtime outbox records pruned");
			}
			catch (err)
			{
				if (signal.aborted) break;
				options.log.error({ err }, "agent controller outbox retention failed");
			}
			nextOutboxPruneAt = Date.now() + outboxPruneIntervalMilliseconds;
		}
		// 4. Do not arm one more idle-delay listener after shutdown interrupted controller-only maintenance.
		if (signal.aborted) break;
		if (didWork) continue;
		await _Wait(options.pollIntervalMilliseconds, signal);
	}
}
