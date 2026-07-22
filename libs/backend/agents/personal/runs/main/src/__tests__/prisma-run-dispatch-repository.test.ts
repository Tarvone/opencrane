import { AgentRunState, AgentServiceKind, AgentServiceState, RunOutboxEventKind, WorkloadAssignmentState, WorkloadKind, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { PrismaRunDispatchRepository } from "../prisma-run-dispatch-repository.js";

/** Creates one dispatchable personal-agent run. */
function _Run()
{
	return { id: "run-1", attempt: 1, state: AgentRunState.Accepted, siloId: "silo-1", agentServiceId: "service-1", agentRevisionId: "revision-1", inputSnapshotDigest: "sha256:snapshot", effectiveContractDigest: "sha256:contract", threadId: "thread-1" };
}

/** Creates the active service authority pinned by the run. */
function _Service()
{
	return { id: "service-1", siloId: "silo-1", kind: AgentServiceKind.Personal, state: AgentServiceState.Active, activeRevisionId: "revision-1", workloadProfile: "personal-small" };
}

/** Creates the pending dispatch event. */
function _Event(overrides: Record<string, unknown> = {})
{
	return { id: "event-1", runId: "run-1", attempt: 1, kind: RunOutboxEventKind.RunAttemptRequested, availableAt: new Date("2026-07-20T00:00:00.000Z"), claimedAt: null, publishedAt: null, failedAt: null, deliveryCount: 0, ...overrides };
}

/** Creates the immutable input snapshot and its time-bounded signed membership identity. */
function _Snapshot(trustedUntil = "2026-07-20T01:00:00.000Z")
{
	return { runId: "run-1", siloId: "silo-1", agentServiceId: "service-1", agentRevisionId: "revision-1", effectiveContractDigest: "sha256:contract", digest: "sha256:snapshot", threadId: "thread-1", identitySnapshot: { executionSubjectId: "user-1", fleetMembershipTrustedUntil: trustedUntil } };
}

/** Creates the exact suspended-Job assignment command returned after a claim. */
function _Command()
{
	return { runId: "run-1", attempt: 1, claimedAt: "2026-07-20T00:00:00.000Z", deliveryCount: 1, expectedWorkloadProfile: "personal-small", namespace: "silo-a", serviceAccountName: "agent-runtime-small", workloadUid: "job-uid-1" } as const;
}

/** Read the SQL text carried by a Prisma tagged query. */
function _SqlText(value: unknown): string
{
	return ((value as { strings?: readonly string[] }).strings ?? []).join(" ");
}

describe("PrismaRunDispatchRepository", function _DescribeDispatchRepository()
{
	it("claims under service-run-outbox lock order and returns only the narrow projection", async function _Claim()
	{
		const run = _Run();
		const event = _Event();
		const queryRaw = vi.fn()
			.mockResolvedValueOnce([{ eventId: event.id, runId: run.id, agentServiceId: run.agentServiceId }])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ now: new Date("2026-07-20T00:00:00.000Z") }]);
		const transaction = {
			$queryRaw: queryRaw,
			agentService: { findUnique: vi.fn().mockResolvedValue(_Service()) },
			agentRun: { findUnique: vi.fn().mockResolvedValue(run), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			outboxEvent: { findUnique: vi.fn().mockResolvedValue(event), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			workloadAssignment: { findUnique: vi.fn().mockResolvedValue(null) },
			runInputSnapshot: { findUnique: vi.fn().mockResolvedValue(_Snapshot()) },
		};
		const prisma = { $transaction: vi.fn(async function _Transaction(callback: (client: typeof transaction) => Promise<unknown>) { return callback(transaction); }) } as unknown as PrismaClient;
		const repository = new PrismaRunDispatchRepository(prisma, { namespace: "silo-a", claimLeaseMilliseconds: 30_000, assignmentTtlMilliseconds: 3_600_000 });

		const result = await repository.claimNextAttemptAtomically();
		expect(result).toEqual({
			status: "claimed",
			claim: {
				lease: { eventId: "event-1", claimedAt: "2026-07-20T00:00:00.000Z", deliveryCount: 1, expiresAt: "2026-07-20T00:00:30.000Z" },
				attempt: { runId: "run-1", attempt: 1, siloId: "silo-1", agentServiceId: "service-1", agentRevisionId: "revision-1", inputSnapshotDigest: "sha256:snapshot", namespace: "silo-a", workloadProfile: "personal-small" },
			},
		});
		expect(_SqlText(queryRaw.mock.calls[1]?.[0])).toContain("agent_services");
		expect(_SqlText(queryRaw.mock.calls[2]?.[0])).toContain("pg_advisory_xact_lock");
		expect(_SqlText(queryRaw.mock.calls[3]?.[0])).toContain("agent_runs");
		expect(_SqlText(queryRaw.mock.calls[4]?.[0])).toContain("run_outbox_events");
		expect(transaction.outboxEvent.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "event-1", deliveryCount: 0 }), data: { claimedAt: new Date("2026-07-20T00:00:00.000Z"), deliveryCount: 1 } });
		expect(transaction.agentRun.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ state: AgentRunState.Accepted }), data: { state: AgentRunState.Queued } });
		expect(JSON.stringify(result)).not.toContain("executionSubjectId");
	});

	it("terminalises an expired first event so the next valid attempt can be claimed", async function _SkipsPoisonedHead()
	{
		const firstRun = _Run();
		const firstEvent = _Event();
		const firstTransaction = {
			$queryRaw: vi.fn().mockResolvedValueOnce([{ eventId: firstEvent.id, runId: firstRun.id, agentServiceId: firstRun.agentServiceId }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: new Date("2026-07-20T00:00:00.000Z") }]),
			agentService: { findUnique: vi.fn().mockResolvedValue(_Service()) },
			agentRun: { findUnique: vi.fn().mockResolvedValue(firstRun), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			outboxEvent: { findUnique: vi.fn().mockResolvedValue(firstEvent), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			conversationRunEvent: { aggregate: vi.fn().mockResolvedValue({ _max: { sequence: 4 } }), create: vi.fn().mockResolvedValue({}) },
			workloadAssignment: { findUnique: vi.fn().mockResolvedValue(null) },
			runInputSnapshot: { findUnique: vi.fn().mockResolvedValue(_Snapshot("2026-07-20T00:00:00.000Z")) },
		};
		const secondRun = { ..._Run(), id: "run-2", agentServiceId: "service-2", agentRevisionId: "revision-2", inputSnapshotDigest: "sha256:snapshot-2" };
		const secondService = { ..._Service(), id: "service-2", activeRevisionId: "revision-2" };
		const secondEvent = _Event({ id: "event-2", runId: "run-2" });
		const secondSnapshot = { ..._Snapshot(), runId: "run-2", agentServiceId: "service-2", agentRevisionId: "revision-2", digest: "sha256:snapshot-2" };
		const secondTransaction = {
			$queryRaw: vi.fn().mockResolvedValueOnce([{ eventId: secondEvent.id, runId: secondRun.id, agentServiceId: secondRun.agentServiceId }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: new Date("2026-07-20T00:00:01.000Z") }]),
			agentService: { findUnique: vi.fn().mockResolvedValue(secondService) },
			agentRun: { findUnique: vi.fn().mockResolvedValue(secondRun), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			outboxEvent: { findUnique: vi.fn().mockResolvedValue(secondEvent), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			conversationRunEvent: { aggregate: vi.fn(), create: vi.fn() },
			workloadAssignment: { findUnique: vi.fn().mockResolvedValue(null) },
			runInputSnapshot: { findUnique: vi.fn().mockResolvedValue(secondSnapshot) },
		};
		const transactions = [firstTransaction, secondTransaction];
		const prisma = { $transaction: vi.fn(async function _Transaction(callback: (client: typeof firstTransaction) => Promise<unknown>) { return callback(transactions.shift()!); }) } as unknown as PrismaClient;
		const repository = new PrismaRunDispatchRepository(prisma, { namespace: "silo-a", claimLeaseMilliseconds: 30_000, assignmentTtlMilliseconds: 3_600_000 });

		await expect(repository.claimNextAttemptAtomically()).resolves.toEqual({ status: "none" });
		expect(firstTransaction.outboxEvent.updateMany).toHaveBeenCalledWith({ where: { id: "event-1", claimedAt: null, deliveryCount: 0, publishedAt: null, failedAt: null }, data: { claimedAt: new Date("2026-07-20T00:00:00.000Z"), deliveryCount: 1, failedAt: new Date("2026-07-20T00:00:00.000Z"), failureCode: "RUN_DISPATCH_MEMBERSHIP_EXPIRED" } });
		expect(firstTransaction.agentRun.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "run-1" }), data: expect.objectContaining({ state: AgentRunState.Failed }) });
		expect(firstTransaction.conversationRunEvent.create).toHaveBeenCalledWith({ data: { runId: "run-1", sequence: 5, type: "run.failed", payload: { terminalReason: "policy_denied", failureCode: "RUN_DISPATCH_MEMBERSHIP_EXPIRED" }, occurredAt: new Date("2026-07-20T00:00:00.000Z") } });
		await expect(repository.claimNextAttemptAtomically()).resolves.toMatchObject({ status: "claimed", claim: { lease: { eventId: "event-2" }, attempt: { runId: "run-2" } } });
	});

	it("rejects a stale claimant before writing an assignment", async function _RejectStaleClaim()
	{
		const run = { ..._Run(), state: AgentRunState.Queued };
		const event = _Event({ claimedAt: new Date("2026-07-20T00:00:00.000Z"), deliveryCount: 1 });
		const queryRaw = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: new Date("2026-07-20T00:00:30.000Z") }]);
		const transaction = {
			$queryRaw: queryRaw,
			agentService: { findUnique: vi.fn().mockResolvedValue(_Service()) },
			agentRun: { findUnique: vi.fn().mockResolvedValue(run), updateMany: vi.fn() },
			outboxEvent: { findUnique: vi.fn().mockResolvedValue(event), updateMany: vi.fn() },
			runInputSnapshot: { findUnique: vi.fn().mockResolvedValue(_Snapshot()) },
			workloadAssignment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
		};
		const prisma = { $transaction: vi.fn(async function _Transaction(callback: (client: typeof transaction) => Promise<unknown>) { return callback(transaction); }) } as unknown as PrismaClient;
		const repository = new PrismaRunDispatchRepository(prisma, { namespace: "silo-a", claimLeaseMilliseconds: 30_000, assignmentTtlMilliseconds: 3_600_000 });

		await expect(repository.commitSuspendedJobAssignmentAtomically("event-1", _Command())).resolves.toEqual({ status: "conflict", reason: "stale_claim" });
		expect(transaction.workloadAssignment.create).not.toHaveBeenCalled();
		expect(transaction.agentRun.updateMany).not.toHaveBeenCalled();
		expect(transaction.outboxEvent.updateMany).not.toHaveBeenCalled();
	});

	it("persists PendingPod, advances Assigned, and publishes the exact claim atomically", async function _CommitAssignment()
	{
		const run = { ..._Run(), state: AgentRunState.Queued };
		const event = _Event({ claimedAt: new Date("2026-07-20T00:00:00.000Z"), deliveryCount: 1 });
		const transaction = {
			$queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: new Date("2026-07-20T00:00:10.000Z") }]),
			agentService: { findUnique: vi.fn().mockResolvedValue(_Service()) },
			agentRun: { findUnique: vi.fn().mockResolvedValue(run), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			outboxEvent: { findUnique: vi.fn().mockResolvedValue(event), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			runInputSnapshot: { findUnique: vi.fn().mockResolvedValue(_Snapshot()) },
			workloadAssignment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
		};
		const prisma = { $transaction: vi.fn(async function _Transaction(callback: (client: typeof transaction) => Promise<unknown>) { return callback(transaction); }) } as unknown as PrismaClient;
		const repository = new PrismaRunDispatchRepository(prisma, { namespace: "silo-a", claimLeaseMilliseconds: 30_000, assignmentTtlMilliseconds: 3_600_000 });

		await expect(repository.commitSuspendedJobAssignmentAtomically("event-1", _Command())).resolves.toEqual({ status: "committed", result: { outcome: "assigned", runId: "run-1", attempt: 1, workloadUid: "job-uid-1" } });
		expect(transaction.workloadAssignment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ workloadKind: WorkloadKind.Job, workloadUid: "job-uid-1", state: WorkloadAssignmentState.PendingPod, expiresAt: new Date("2026-07-20T01:00:10.000Z") }) });
		expect(transaction.agentRun.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ state: AgentRunState.Queued }), data: { state: AgentRunState.Assigned } });
		expect(transaction.outboxEvent.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ claimedAt: new Date("2026-07-20T00:00:00.000Z"), deliveryCount: 1 }), data: { publishedAt: new Date("2026-07-20T00:00:10.000Z") } });
	});

	it("rejects an expired signed fleet-membership snapshot at commit", async function _RejectExpiredMembership()
	{
		const run = { ..._Run(), state: AgentRunState.Queued };
		const event = _Event({ claimedAt: new Date("2026-07-20T00:00:00.000Z"), deliveryCount: 1 });
		const transaction = {
			$queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: new Date("2026-07-20T00:00:10.000Z") }]),
			agentService: { findUnique: vi.fn().mockResolvedValue(_Service()) },
			agentRun: { findUnique: vi.fn().mockResolvedValue(run), updateMany: vi.fn() },
			outboxEvent: { findUnique: vi.fn().mockResolvedValue(event), updateMany: vi.fn() },
			runInputSnapshot: { findUnique: vi.fn().mockResolvedValue(_Snapshot("2026-07-20T00:00:10.000Z")) },
			workloadAssignment: { findUnique: vi.fn(), create: vi.fn() },
		};
		const prisma = { $transaction: vi.fn(async function _Transaction(callback: (client: typeof transaction) => Promise<unknown>) { return callback(transaction); }) } as unknown as PrismaClient;
		const repository = new PrismaRunDispatchRepository(prisma, { namespace: "silo-a", claimLeaseMilliseconds: 30_000, assignmentTtlMilliseconds: 3_600_000 });

		await expect(repository.commitSuspendedJobAssignmentAtomically("event-1", _Command())).resolves.toEqual({ status: "conflict", reason: "authority_conflict" });
		expect(transaction.workloadAssignment.create).not.toHaveBeenCalled();
	});
});
