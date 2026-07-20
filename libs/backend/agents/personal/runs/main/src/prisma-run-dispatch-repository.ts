import { AgentRunState, AgentRunTerminalReason, AgentServiceKind, AgentServiceState, Prisma, RunOutboxEventKind, WorkloadAssignmentState, WorkloadKind, type PrismaClient } from "@prisma/client";

import { AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE, ___IsAgentRuntimeServiceAccountName, type AgentControllerRunAttemptAssignmentCommand } from "@opencrane/contracts";

import type { ClaimNextRunAttemptResult, CommitRunAttemptAssignmentResult, RunDispatchRepository, RunDispatchRepositoryConfig, RunOutboxCandidateRow } from "./run-dispatch.types.js";

/** Snapshot identity fields required at the dispatch authority boundary. */
interface SnapshotExecutionIdentity
{
	/** User or delegated subject whose authority the runtime exercises. */
	readonly subjectId: string;
	/** Last instant at which the signed fleet-membership evidence remains trusted. */
	readonly fleetMembershipTrustedUntilEpochMilliseconds: number;
}

/**
 * Prisma-backed authority for handing one accepted personal run to the Kubernetes controller.
 *
 * Claims use database time plus a monotonically increasing delivery generation, so a controller
 * whose lease expired cannot publish an assignment after a newer replica reclaimed the event. Every
 * commit locks service, run, and outbox authority before creating the immutable PendingPod binding.
 */
export class PrismaRunDispatchRepository implements RunDispatchRepository
{
	/** Canonical OpenCrane product-authority database client. */
	private readonly prisma: PrismaClient;
	/** Fixed namespace and database-owned lifetime policy. */
	private readonly config: RunDispatchRepositoryConfig;

	/** Creates a dispatch adapter over canonical Postgres. */
	constructor(prisma: PrismaClient, config: RunDispatchRepositoryConfig)
	{
		if (!_ConfigIsValid(config)) throw new Error("run dispatch repository requires bounded namespace and lifetimes");
		this.prisma = prisma;
		this.config = config;
	}

	/** Claims one eligible event and loads its immutable desired-state projection atomically. */
	async claimNextAttemptAtomically(): Promise<ClaimNextRunAttemptResult>
	{
		const config = this.config;
		return this.prisma.$transaction(async function _claim(transaction: Prisma.TransactionClient): Promise<ClaimNextRunAttemptResult>
		{
			// 1. Discover without locking, then establish the global service -> run -> outbox order.
			const candidates = await transaction.$queryRaw<RunOutboxCandidateRow[]>(Prisma.sql`
				SELECT event."id" AS "eventId", event."run_id" AS "runId", run."agent_service_id" AS "agentServiceId"
				FROM "run_outbox_events" event
				JOIN "agent_runs" run ON run."id" = event."run_id" AND run."attempt" = event."attempt"
				JOIN "agent_services" service ON service."id" = run."agent_service_id"
				WHERE event."kind" = 'run.attempt_requested'::"RunOutboxEventKind"
				  AND event."published_at" IS NULL AND event."failed_at" IS NULL
				  AND event."available_at" <= clock_timestamp()
				  AND (event."claimed_at" IS NULL OR event."claimed_at" <= clock_timestamp() - (${config.claimLeaseMilliseconds} * interval '1 millisecond'))
				  AND run."state" IN ('accepted'::"AgentRunState", 'queued'::"AgentRunState")
				  AND service."kind" = 'personal'::"AgentServiceKind"
				  AND service."state" = 'active'::"AgentServiceState" AND service."active_revision_id" = run."agent_revision_id"
				  AND NOT EXISTS (SELECT 1 FROM "workload_assignments" assignment WHERE assignment."run_id" = run."id" AND assignment."attempt" = run."attempt")
				ORDER BY event."available_at", event."created_at", event."id"
				LIMIT 1
			`);
			const candidate = candidates[0];
			if (!candidate) return { status: "none" };

			await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "agent_services" WHERE "id" = ${candidate.agentServiceId} FOR UPDATE`);
			// ConversationRunEvent appends take this advisory lock before the run row. Preserve the
			// global service -> run-advisory -> run -> outbox order before terminal event creation.
			await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.runId}, 0))`);
			await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${candidate.runId} FOR UPDATE`);
			await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "run_outbox_events" WHERE "id" = ${candidate.eventId} FOR UPDATE`);

			// 2. Reload and revalidate every authority coordinate after all canonical locks are held.
			const service = await transaction.agentService.findUnique({ where: { id: candidate.agentServiceId } });
			const run = await transaction.agentRun.findUnique({ where: { id: candidate.runId } });
			const event = await transaction.outboxEvent.findUnique({ where: { id: candidate.eventId } });
			if (service === null || run === null || event === null) return { status: "none" };
			const databaseTime = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp()::timestamp(3) AS "now"`);
			const now = databaseTime[0]?.now;
			if (!now || !_ClaimAuthorityIsCurrent(service, run, event, candidate, now, config.claimLeaseMilliseconds)) return { status: "none" };
			const existing = await transaction.workloadAssignment.findUnique({ where: { runId_attempt: { runId: run.id, attempt: run.attempt } } });
			if (existing !== null)
			{
				await _TerminalizeUndispatchableAttempt(transaction, event, run, now, "RUN_DISPATCH_ASSIGNMENT_PREEXISTS", AgentRunTerminalReason.RuntimeFailure);
				return { status: "none" };
			}
			const snapshot = await transaction.runInputSnapshot.findUnique({ where: { runId_digest: { runId: run.id, digest: run.inputSnapshotDigest } } });
			const identity = _SnapshotExecutionIdentity(snapshot?.identitySnapshot);
			if (snapshot === null || identity === null || !_SnapshotMatchesRun(snapshot, run))
			{
				await _TerminalizeUndispatchableAttempt(transaction, event, run, now, "RUN_DISPATCH_SNAPSHOT_INVALID", AgentRunTerminalReason.InvalidInput);
				return { status: "none" };
			}
			if (identity.fleetMembershipTrustedUntilEpochMilliseconds <= now.getTime())
			{
				await _TerminalizeUndispatchableAttempt(transaction, event, run, now, "RUN_DISPATCH_MEMBERSHIP_EXPIRED", AgentRunTerminalReason.PolicyDenied);
				return { status: "none" };
			}

			// 3. Advance both claim coordinates. The exact pair fences stale controller replicas.
			const claimedAt = new Date(Math.max(now.getTime(), (event.claimedAt?.getTime() ?? -1) + 1));
			const deliveryCount = event.deliveryCount + 1;
			const claimed = await transaction.outboxEvent.updateMany({ where: { id: event.id, claimedAt: event.claimedAt, deliveryCount: event.deliveryCount, publishedAt: null, failedAt: null }, data: { claimedAt, deliveryCount } });
			if (claimed.count !== 1) throw new Error("run dispatch claim lost its event fence");
			if (run.state === AgentRunState.Accepted)
			{
				const queued = await transaction.agentRun.updateMany({ where: { id: run.id, attempt: run.attempt, state: AgentRunState.Accepted }, data: { state: AgentRunState.Queued } });
				if (queued.count !== 1) throw new Error("claimed run could not enter queued state");
			}

			return {
				status: "claimed",
				claim: {
					lease: { eventId: event.id, claimedAt: claimedAt.toISOString(), deliveryCount, expiresAt: new Date(claimedAt.getTime() + config.claimLeaseMilliseconds).toISOString() },
					attempt: { runId: run.id, attempt: run.attempt, siloId: run.siloId, agentServiceId: run.agentServiceId, agentRevisionId: run.agentRevisionId, inputSnapshotDigest: run.inputSnapshotDigest, namespace: config.namespace, workloadProfile: service.workloadProfile },
				},
			};
		});
	}

	/** Commits an exact live claim, immutable Job UID, assignment, run state, and outbox publication. */
	async commitSuspendedJobAssignmentAtomically(eventId: string, command: AgentControllerRunAttemptAssignmentCommand): Promise<CommitRunAttemptAssignmentResult>
	{
		const config = this.config;
		if (!_AssignmentCommandIsValid(eventId, command, config.namespace)) return { status: "conflict", reason: "invalid_assignment" };
		return this.prisma.$transaction(async function _commit(transaction: Prisma.TransactionClient): Promise<CommitRunAttemptAssignmentResult>
		{
			// 1. Pre-read only to discover lock keys. Every value is reloaded after canonical locking.
			const discoveredEvent = await transaction.outboxEvent.findUnique({ where: { id: eventId } });
			if (discoveredEvent === null) return { status: "conflict", reason: "claim_not_found" };
			const discoveredRun = await transaction.agentRun.findUnique({ where: { id: discoveredEvent.runId } });
			if (discoveredRun === null) return { status: "conflict", reason: "attempt_conflict" };
			await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "agent_services" WHERE "id" = ${discoveredRun.agentServiceId} FOR UPDATE`);
			await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${discoveredRun.id} FOR UPDATE`);
			await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "run_outbox_events" WHERE "id" = ${eventId} FOR UPDATE`);

			// 2. Reload all rows, database time, and the immutable snapshot under the held locks.
			const service = await transaction.agentService.findUnique({ where: { id: discoveredRun.agentServiceId } });
			const run = await transaction.agentRun.findUnique({ where: { id: discoveredRun.id } });
			const event = await transaction.outboxEvent.findUnique({ where: { id: eventId } });
			if (service === null || run === null || event === null || event.kind !== RunOutboxEventKind.RunAttemptRequested || event.runId !== command.runId || event.attempt !== command.attempt || run.id !== command.runId || run.attempt !== command.attempt)
			{
				return { status: "conflict", reason: "attempt_conflict" };
			}
			const databaseTime = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp()::timestamp(3) AS "now"`);
			const now = databaseTime[0]?.now;
			const snapshot = await transaction.runInputSnapshot.findUnique({ where: { runId_digest: { runId: run.id, digest: run.inputSnapshotDigest } } });
			const identity = _SnapshotExecutionIdentity(snapshot?.identitySnapshot);
			if (!now || snapshot === null || identity === null || identity.fleetMembershipTrustedUntilEpochMilliseconds <= now.getTime() || !_SnapshotMatchesRun(snapshot, run) || service.id !== run.agentServiceId || service.kind !== AgentServiceKind.Personal || service.state !== AgentServiceState.Active || service.siloId !== run.siloId || service.activeRevisionId !== run.agentRevisionId || service.workloadProfile !== command.expectedWorkloadProfile)
			{
				return { status: "conflict", reason: "authority_conflict" };
			}

			// 3. Accept a replay only when the claim generation and every durable assignment field agree.
			const leaseMatches = event.claimedAt !== null && event.claimedAt.getTime() === Date.parse(command.claimedAt) && event.deliveryCount === command.deliveryCount;
			const existing = await transaction.workloadAssignment.findUnique({ where: { runId_attempt: { runId: run.id, attempt: run.attempt } } });
			if (existing !== null)
			{
				if (leaseMatches && event.publishedAt !== null && run.state === AgentRunState.Assigned && _AssignmentMatches(existing, command, run, identity.subjectId))
				{
					return { status: "committed", result: { outcome: "idempotent", runId: run.id, attempt: run.attempt, workloadUid: existing.workloadUid } };
				}
				return { status: "conflict", reason: "assignment_conflict" };
			}

			// 4. Require the exact unexpired database claim generation before authoritative writes begin.
			if (event.publishedAt !== null || event.failedAt !== null) return { status: "conflict", reason: "claim_terminal" };
			if (!leaseMatches || now.getTime() >= event.claimedAt!.getTime() + config.claimLeaseMilliseconds) return { status: "conflict", reason: "stale_claim" };
			if (run.state !== AgentRunState.Queued) return { status: "conflict", reason: "attempt_conflict" };

			// 5. Insert PendingPod, advance the run, and publish the outbox event in one transaction.
			await transaction.workloadAssignment.create({ data: {
				runId: run.id,
				attempt: run.attempt,
				agentServiceId: run.agentServiceId,
				agentRevisionId: run.agentRevisionId,
				siloId: run.siloId,
				subjectId: identity.subjectId,
				audience: AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE,
				serviceAccountName: command.serviceAccountName,
				namespace: command.namespace,
				workloadKind: WorkloadKind.Job,
				workloadUid: command.workloadUid,
				state: WorkloadAssignmentState.PendingPod,
				expiresAt: new Date(now.getTime() + config.assignmentTtlMilliseconds),
			} });
			const assigned = await transaction.agentRun.updateMany({ where: { id: run.id, attempt: run.attempt, state: AgentRunState.Queued }, data: { state: AgentRunState.Assigned } });
			const published = await transaction.outboxEvent.updateMany({ where: { id: event.id, claimedAt: event.claimedAt, deliveryCount: event.deliveryCount, publishedAt: null, failedAt: null }, data: { publishedAt: now } });
			if (assigned.count !== 1 || published.count !== 1) throw new Error("run assignment commit lost its claim fence");
			return { status: "committed", result: { outcome: "assigned", runId: run.id, attempt: run.attempt, workloadUid: command.workloadUid } };
		});
	}
}

/** Terminalise one poisoned dispatch row so it cannot starve every later valid attempt. */
async function _TerminalizeUndispatchableAttempt(transaction: Prisma.TransactionClient, event: { id: string; claimedAt: Date | null; deliveryCount: number }, run: { id: string; attempt: number; threadId: string | null }, now: Date, failureCode: string, terminalReason: AgentRunTerminalReason): Promise<void>
{
	// 1. Fence and terminalise the poisoned outbox command without violating delivery coherence.
	const claimedAt = new Date(Math.max(now.getTime(), (event.claimedAt?.getTime() ?? -1) + 1));
	const failedEvent = await transaction.outboxEvent.updateMany({ where: { id: event.id, claimedAt: event.claimedAt, deliveryCount: event.deliveryCount, publishedAt: null, failedAt: null }, data: { claimedAt, deliveryCount: event.deliveryCount + 1, failedAt: claimedAt, failureCode } });
	const failedRun = await transaction.agentRun.updateMany({ where: { id: run.id, attempt: run.attempt, state: { in: [AgentRunState.Accepted, AgentRunState.Queued] } }, data: { state: AgentRunState.Failed, terminalReason, finishedAt: now } });
	if (failedEvent.count !== 1 || failedRun.count !== 1) throw new Error("undispatchable run attempt lost its terminal failure fence");

	// 2. Conversation-bound runs require their contiguous canonical terminal event in this transaction.
	if (run.threadId !== null)
	{
		const maximum = await transaction.conversationRunEvent.aggregate({ where: { runId: run.id }, _max: { sequence: true } });
		await transaction.conversationRunEvent.create({ data: { runId: run.id, sequence: (maximum._max.sequence ?? 0) + 1, type: "run.failed", payload: { terminalReason: _TerminalReasonPayload(terminalReason), failureCode }, occurredAt: now } });
	}
}

/** Map one Prisma terminal enum to the canonical conversation-event payload value. */
function _TerminalReasonPayload(value: AgentRunTerminalReason): string
{
	if (value === AgentRunTerminalReason.PolicyDenied) return "policy_denied";
	if (value === AgentRunTerminalReason.RuntimeFailure) return "runtime_failure";
	if (value === AgentRunTerminalReason.InvalidInput) return "invalid_input";
	throw new Error("run dispatch emitted an unsupported terminal reason");
}

/** Validate fixed repository policy before any database transaction begins. */
function _ConfigIsValid(config: RunDispatchRepositoryConfig): boolean
{
	return /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(config.namespace)
		&& config.namespace.length <= 63
		&& Number.isSafeInteger(config.claimLeaseMilliseconds) && config.claimLeaseMilliseconds >= 1_000 && config.claimLeaseMilliseconds <= 300_000
		&& Number.isSafeInteger(config.assignmentTtlMilliseconds) && config.assignmentTtlMilliseconds >= 60_000 && config.assignmentTtlMilliseconds <= 86_400_000;
}

/** Revalidate one discovered claim candidate after all authority locks are held. */
function _ClaimAuthorityIsCurrent(service: { id: string; kind: AgentServiceKind; state: AgentServiceState; siloId: string; activeRevisionId: string | null }, run: { id: string; attempt: number; state: AgentRunState; siloId: string; agentServiceId: string; agentRevisionId: string }, event: { id: string; runId: string; attempt: number; kind: RunOutboxEventKind; availableAt: Date; claimedAt: Date | null; publishedAt: Date | null; failedAt: Date | null }, candidate: RunOutboxCandidateRow, now: Date, claimLeaseMilliseconds: number): boolean
{
	return service.id === candidate.agentServiceId && run.id === candidate.runId && event.id === candidate.eventId
		&& run.agentServiceId === service.id && run.siloId === service.siloId
		&& event.runId === run.id && event.attempt === run.attempt && event.kind === RunOutboxEventKind.RunAttemptRequested
		&& event.publishedAt === null && event.failedAt === null && event.availableAt.getTime() <= now.getTime()
		&& (event.claimedAt === null || event.claimedAt.getTime() <= now.getTime() - claimLeaseMilliseconds)
		&& (run.state === AgentRunState.Accepted || run.state === AgentRunState.Queued)
		&& service.kind === AgentServiceKind.Personal && service.state === AgentServiceState.Active && service.activeRevisionId === run.agentRevisionId;
}

/** Validate untrusted assignment evidence before it reaches Prisma or SQL. */
function _AssignmentCommandIsValid(eventId: string, command: AgentControllerRunAttemptAssignmentCommand, namespace: string): boolean
{
	return eventId.trim().length > 0 && eventId.length <= 256
		&& command.runId.trim().length > 0 && command.runId.length <= 256
		&& Number.isSafeInteger(command.attempt) && command.attempt > 0
		&& Number.isSafeInteger(command.deliveryCount) && command.deliveryCount > 0
		&& _CanonicalUtcInstantEpochMilliseconds(command.claimedAt) !== null
		&& command.expectedWorkloadProfile.trim().length > 0 && command.expectedWorkloadProfile.length <= 128
		&& command.namespace === namespace
		&& ___IsAgentRuntimeServiceAccountName(command.serviceAccountName)
		&& /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(command.workloadUid);
}

/** Parse the trusted subject and signed-membership lifetime from immutable snapshot JSON. */
function _SnapshotExecutionIdentity(value: unknown): SnapshotExecutionIdentity | null
{
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const identity = value as Record<string, unknown>;
	const subjectId = identity["executionSubjectId"];
	const trustedUntil = identity["fleetMembershipTrustedUntil"];
	if (typeof subjectId !== "string" || subjectId.trim().length === 0 || subjectId.length > 256 || typeof trustedUntil !== "string") return null;
	const fleetMembershipTrustedUntilEpochMilliseconds = _CanonicalUtcInstantEpochMilliseconds(trustedUntil);
	return fleetMembershipTrustedUntilEpochMilliseconds === null ? null : { subjectId, fleetMembershipTrustedUntilEpochMilliseconds };
}

/** Parse the sole canonical UTC ISO-8601 representation used by snapshot and lease contracts. */
function _CanonicalUtcInstantEpochMilliseconds(value: string): number | null
{
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
	const epochMilliseconds = Date.parse(value);
	return Number.isFinite(epochMilliseconds) && new Date(epochMilliseconds).toISOString() === value ? epochMilliseconds : null;
}

/** Require the persisted snapshot to repeat every immutable run authority coordinate exactly. */
function _SnapshotMatchesRun(snapshot: { runId: string; siloId: string; agentServiceId: string; agentRevisionId: string; effectiveContractDigest: string; digest: string; threadId: string | null }, run: { id: string; siloId: string; agentServiceId: string; agentRevisionId: string; effectiveContractDigest: string; inputSnapshotDigest: string; threadId: string | null }): boolean
{
	return snapshot.runId === run.id && snapshot.siloId === run.siloId && snapshot.agentServiceId === run.agentServiceId && snapshot.agentRevisionId === run.agentRevisionId && snapshot.effectiveContractDigest === run.effectiveContractDigest && snapshot.digest === run.inputSnapshotDigest && snapshot.threadId === run.threadId;
}

/** Compare an existing immutable assignment with the complete canonical command and run authority. */
function _AssignmentMatches(existing: { runId: string; attempt: number; agentServiceId: string; agentRevisionId: string; siloId: string; subjectId: string; audience: string; serviceAccountName: string; namespace: string; workloadKind: WorkloadKind; workloadUid: string; podUid: string | null; state: WorkloadAssignmentState }, command: AgentControllerRunAttemptAssignmentCommand, run: { id: string; attempt: number; agentServiceId: string; agentRevisionId: string; siloId: string }, subjectId: string): boolean
{
	return existing.runId === run.id && existing.attempt === run.attempt && existing.agentServiceId === run.agentServiceId && existing.agentRevisionId === run.agentRevisionId && existing.siloId === run.siloId && existing.subjectId === subjectId && existing.audience === AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE && existing.serviceAccountName === command.serviceAccountName && existing.namespace === command.namespace && existing.workloadKind === WorkloadKind.Job && existing.workloadUid === command.workloadUid && existing.podUid === null && existing.state === WorkloadAssignmentState.PendingPod;
}
