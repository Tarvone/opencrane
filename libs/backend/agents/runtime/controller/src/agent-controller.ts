import { __BuildSuspendedAgentRuntimeJobResources, type AgentRuntimeJobProfile } from "@opencrane/backend/agents/runtime/k8s-launcher";

import type { AgentControllerOptions, AgentControllerReconcileResult, AgentControllerRuntimeProfiles } from "./agent-controller.types.js";

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
 * @param namespace - Sole silo namespace to which every profile must be bound.
 * @returns A detached, validated runtime-profile map.
 */
export function __ValidateAgentControllerRuntimeProfiles(value: unknown, namespace: string): AgentControllerRuntimeProfiles
{
	if (typeof value !== "object" || value === null || Array.isArray(value) || !_IsNamespace(namespace))
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
		if (profile.serverNamespace !== namespace)
		{
			throw new Error(`agent controller profile '${name}' targets another namespace`);
		}
		__BuildSuspendedAgentRuntimeJobResources({ runId: "profile-validation", attempt: 1, agentServiceId: "profile-validation", agentRevisionId: "profile-validation", siloId: "profile-validation", namespace }, profile);
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
		const timer = setTimeout(function _completeWait() { resolve(); }, milliseconds);
		signal.addEventListener("abort", function _cancelWait()
		{
			clearTimeout(timer);
			resolve();
		}, { once: true });
	});
}

/**
 * Reconcile at most one claimed run attempt into a durable, still-suspended assignment.
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
	if (claim.attempt.namespace !== options.namespace)
	{
		throw new Error("claimed runtime attempt targets a namespace outside this controller silo");
	}
	const profile = _ResolveProfile(options.profiles, claim.attempt.workloadProfile);
	if (!profile || profile.serverNamespace !== options.namespace)
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
	};
	const resources = __BuildSuspendedAgentRuntimeJobResources(assignment, profile);

	// 3. Establish the deny policy before the suspended Job can ever become executable.
	await options.kubernetes.__EnsureNetworkPolicy(resources.networkPolicy);

	// 4. Create or exact-adopt only the deterministic suspended Job and take its API-issued UID.
	const job = await options.kubernetes.__EnsureSuspendedJob(resources.job);
	const workloadUid = _RequireWorkloadUid(job.metadata?.uid);

	// 5. Commit the exact UID through OpenCrane; this slice deliberately stops before unsuspension.
	const committed = await options.authority.__CommitAssignment(claim.lease.eventId, {
		claimedAt: claim.lease.claimedAt,
		deliveryCount: claim.lease.deliveryCount,
		runId: claim.attempt.runId,
		attempt: claim.attempt.attempt,
		expectedWorkloadProfile: claim.attempt.workloadProfile,
		namespace: claim.attempt.namespace,
		serviceAccountName: profile.serviceAccountName,
		workloadUid,
	}, signal);

	options.log.info({ eventId: claim.lease.eventId, runId: claim.attempt.runId, attempt: claim.attempt.attempt, workloadUid, outcome: committed.outcome }, "runtime attempt assigned to suspended Job");
	return { outcome: committed.outcome, eventId: claim.lease.eventId, runId: claim.attempt.runId, attempt: claim.attempt.attempt, workloadUid };
}

/**
 * Poll OpenCrane until shutdown, retrying failed claims without mutating any existing workload.
 * @param options - Fixed controller authority, namespace, profiles, adapters, and logger.
 * @param signal - Process shutdown signal.
 */
export async function __RunAgentController(options: AgentControllerOptions, signal: AbortSignal): Promise<void>
{
	if (!_IsNamespace(options.namespace) || !Number.isSafeInteger(options.pollIntervalMilliseconds) || options.pollIntervalMilliseconds < 100 || options.pollIntervalMilliseconds > 60_000)
	{
		throw new Error("agent controller requires one valid namespace and a 100-60000ms poll interval");
	}
	while (!signal.aborted)
	{
		try
		{
			const result = await __ReconcileNextAgentRuntimeAttempt(options, signal);
			if (result.outcome !== "idle") continue;
		}
		catch (err)
		{
			if (signal.aborted) break;
			options.log.error({ err }, "agent controller reconciliation failed");
		}
		await _Wait(options.pollIntervalMilliseconds, signal);
	}
}
