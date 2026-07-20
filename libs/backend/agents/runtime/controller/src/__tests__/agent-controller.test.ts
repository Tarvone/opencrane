import type { V1Job, V1NetworkPolicy } from "@kubernetes/client-node";
import type { Logger } from "@opencrane/observability";
import type { AgentControllerRunAttemptAssignmentCommand, AgentControllerRunAttemptClaim } from "@opencrane/contracts";
import { describe, expect, it } from "vitest";

import { __ReconcileNextAgentRuntimeAttempt } from "../agent-controller.js";
import type { AgentControllerAuthority, AgentControllerKubernetesStore, AgentControllerOptions, AgentControllerRuntimeProfiles } from "../agent-controller.types.js";

/** Silent structured logger used by orchestration tests. */
const _log = { info: function _info() {}, error: function _error() {} } as unknown as Logger;

/** Return one exact configured runtime profile. */
function _Profiles(): AgentControllerRuntimeProfiles
{
	return {
		"personal-default": {
			image: "ghcr.io/italanta/opencrane-agent-runtime@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			imagePullPolicy: "IfNotPresent",
			runtimeStreamUrl: "http://opencrane-server.silo-a.svc.cluster.local:3001/api/internal/agent-runtime",
			serverNamespace: "silo-a",
			serviceAccountName: "agent-runtime-default",
			releaseSelectorLabels: { "app.kubernetes.io/name": "opencrane-silo", "app.kubernetes.io/instance": "opencrane" },
			serverPort: 3001,
			projectedTokenTtlSeconds: 600,
			scratchSize: "64Mi",
			activeDeadlineSeconds: 900,
			ttlSecondsAfterFinished: 300,
			resources: { requests: { cpu: "25m", memory: "64Mi" }, limits: { cpu: "250m", memory: "128Mi" } },
		},
	};
}

/** Return one durable authority claim. */
function _Claim(): AgentControllerRunAttemptClaim
{
	return {
		lease: { eventId: "event-1", claimedAt: "2026-07-20T00:00:00.000Z", deliveryCount: 2, expiresAt: "2026-07-20T00:01:00.000Z" },
		attempt: { runId: "run-1", attempt: 3, siloId: "silo-1", agentServiceId: "service-1", agentRevisionId: "revision-1", inputSnapshotDigest: "sha256:snapshot", namespace: "silo-a", workloadProfile: "personal-default" },
	};
}

/** Compose controller options from focused fake ports. */
function _Options(authority: AgentControllerAuthority, kubernetes: AgentControllerKubernetesStore): AgentControllerOptions
{
	return { authority, kubernetes, profiles: _Profiles(), namespace: "silo-a", pollIntervalMilliseconds: 1_000, log: _log };
}

describe("agent-controller orchestration", function _Suite()
{
	it("creates policy before suspended Job and commits only the API-issued UID", async function _AssignsSuspendedJob()
	{
		const calls: string[] = [];
		let committed: AgentControllerRunAttemptAssignmentCommand | null = null;
		const authority: AgentControllerAuthority = {
			async __Claim() { calls.push("claim"); return _Claim(); },
			async __CommitAssignment(_eventId, command) { calls.push("commit"); committed = command; return { outcome: "assigned", runId: command.runId, attempt: command.attempt, workloadUid: command.workloadUid }; },
		};
		const kubernetes: AgentControllerKubernetesStore = {
			async __EnsureNetworkPolicy(expected: V1NetworkPolicy) { calls.push("network-policy"); return expected; },
			async __EnsureSuspendedJob(expected: V1Job) { calls.push("job"); return { ...expected, metadata: { ...expected.metadata, uid: "job-uid-1" } }; },
		};

		const result = await __ReconcileNextAgentRuntimeAttempt(_Options(authority, kubernetes), new AbortController().signal);

		expect(calls).toEqual(["claim", "network-policy", "job", "commit"]);
		expect(committed).toMatchObject({ claimedAt: _Claim().lease.claimedAt, deliveryCount: 2, runId: "run-1", attempt: 3, expectedWorkloadProfile: "personal-default", namespace: "silo-a", serviceAccountName: "agent-runtime-default", workloadUid: "job-uid-1" });
		expect(result).toEqual({ outcome: "assigned", eventId: "event-1", runId: "run-1", attempt: 3, workloadUid: "job-uid-1" });
	});

	it("does no Kubernetes work when OpenCrane has no desired attempt", async function _Idle()
	{
		const authority: AgentControllerAuthority = { async __Claim() { return null; }, async __CommitAssignment() { throw new Error("unexpected commit"); } };
		const kubernetes: AgentControllerKubernetesStore = { async __EnsureNetworkPolicy() { throw new Error("unexpected policy"); }, async __EnsureSuspendedJob() { throw new Error("unexpected job"); } };
		expect(await __ReconcileNextAgentRuntimeAttempt(_Options(authority, kubernetes), new AbortController().signal)).toEqual({ outcome: "idle" });
	});

	it("fails closed before resource creation for another namespace or an unknown profile", async function _RejectsUnownedClaim()
	{
		let resourceCalls = 0;
		const kubernetes: AgentControllerKubernetesStore = { async __EnsureNetworkPolicy(expected) { resourceCalls += 1; return expected; }, async __EnsureSuspendedJob(expected) { resourceCalls += 1; return expected; } };
		const otherNamespace: AgentControllerAuthority = { async __Claim() { return { ..._Claim(), attempt: { ..._Claim().attempt, namespace: "silo-b" } }; }, async __CommitAssignment() { throw new Error("unexpected commit"); } };
		const unknownProfile: AgentControllerAuthority = { async __Claim() { return { ..._Claim(), attempt: { ..._Claim().attempt, workloadProfile: "unknown" } }; }, async __CommitAssignment() { throw new Error("unexpected commit"); } };

		await expect(__ReconcileNextAgentRuntimeAttempt(_Options(otherNamespace, kubernetes), new AbortController().signal)).rejects.toThrow(/outside this controller silo/);
		await expect(__ReconcileNextAgentRuntimeAttempt(_Options(unknownProfile, kubernetes), new AbortController().signal)).rejects.toThrow(/no configured runtime profile/);
		expect(resourceCalls).toBe(0);
	});

	it("never commits when policy, Job, or API-issued UID is missing", async function _StopsBeforeCommit()
	{
		let commits = 0;
		const authority: AgentControllerAuthority = { async __Claim() { return _Claim(); }, async __CommitAssignment() { commits += 1; throw new Error("unexpected commit"); } };
		const policyFailure: AgentControllerKubernetesStore = { async __EnsureNetworkPolicy() { throw new Error("policy denied"); }, async __EnsureSuspendedJob(expected) { return expected; } };
		const missingUid: AgentControllerKubernetesStore = { async __EnsureNetworkPolicy(expected) { return expected; }, async __EnsureSuspendedJob(expected) { return expected; } };

		await expect(__ReconcileNextAgentRuntimeAttempt(_Options(authority, policyFailure), new AbortController().signal)).rejects.toThrow(/policy denied/);
		await expect(__ReconcileNextAgentRuntimeAttempt(_Options(authority, missingUid), new AbortController().signal)).rejects.toThrow(/immutable UID/);
		expect(commits).toBe(0);
	});
});
