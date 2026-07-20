import type { RunInputSnapshot } from "@opencrane/contracts";
import { __DigestRunInputSnapshot } from "@opencrane/backend/agents/personal/runs";
import { ___CanonicalizeJson } from "@opencrane/util";
import type { JsonValue } from "@opencrane/util";

import type { InitialRunAuthority } from "@opencrane/backend/agents/personal/runs";
import type { ApprovedPersonaInput, AssembleRunInputSnapshotResult, IdentityEnvelopeInput, MemoryScopeInput, SessionAssemblyAuthorities, SessionAssemblyCommand, SessionAssemblyLoad, SessionAssemblyRefusalReason, ThreadContextInput, ToolPolicyInput } from "./session-assembly.types.js";

/** Stable contract version emitted by the first session assembler. */
const _SNAPSHOT_VERSION = 1;

/** Assembles and atomically persists the sole immutable runtime input for one admitted run. */
export async function __AssembleRunInputSnapshot(command: SessionAssemblyCommand, authorities: SessionAssemblyAuthorities): Promise<AssembleRunInputSnapshotResult>
{
	// 1. Reject malformed coordinates before any authority read can accidentally widen its scope.
	if (!_isCommandValid(command)) return { outcome: "denied", reason: "invalid_command" };

	// 2. Resolve a duplicate before compilation, or hold the service lock while every input is revalidated.
	const admitted = await authorities.admission.admit(command, async function _compileWithinAdmission(transaction)
	{
		// 3. Load the admitted run and pinned revision before any dependent authority can be resolved.
		const run = await authorities.runAuthority.load(command, transaction);
		if (run.outcome === "denied") return run;

		// 4. Load the named approved-persona step, which is mandatory for personal runs and null for managed runs.
		const persona = await authorities.approvedPersona.load(command, run.value, transaction);
		if (persona.outcome === "denied") return persona;
		if (run.value.agentKind === "personal" && persona.value.personaRevisionId === null) return { outcome: "denied", reason: "persona_unavailable" } as const;
		if (run.value.agentKind === "managed" && persona.value.personaRevisionId !== null) return { outcome: "denied", reason: "persona_unavailable" } as const;

		// 5. Freeze transcript, preferences, memory, tools, budgets, and signed identity in the same final transaction.
		const thread = await authorities.threadContext.load(command, run.value, transaction);
		if (thread.outcome === "denied") return thread;
		const preferences = await authorities.preferenceFacts.load(command, run.value, transaction);
		if (preferences.outcome === "denied") return preferences;
		const memory = await authorities.memoryScope.load(command, run.value, transaction);
		if (memory.outcome === "denied") return memory;
		const tools = await authorities.toolPolicy.load(command, run.value, transaction);
		if (tools.outcome === "denied") return tools;
		const budget = await authorities.budgetPolicy.load(command, run.value, transaction);
		if (budget.outcome === "denied") return budget;
		const identity = await authorities.identityEnvelope.load(command, run.value, transaction);
		if (identity.outcome === "denied") return identity;
		if (command.threadId === null && thread.value.messageIds.length > 0) return { outcome: "denied", reason: "thread_unavailable" } as const;
		if (!_isIdentityFresh(identity.value, transaction.admittedAt)) return { outcome: "denied", reason: "membership_stale" } as const;

		// 6. Compile the immutable snapshot only after all source authority is revalidated at the durable fence.
		return { outcome: "ready", value: { authority: run.value, snapshot: _compileSnapshot(command, transaction.admittedAt, run.value, persona.value, thread.value, preferences.value, memory.value, tools.value, budget.value.budgetPolicy, identity.value) } } as const;
	});
	if (admitted.outcome === "denied")
	{
		return { outcome: "denied", reason: admitted.reason === "persistence_unavailable" ? "persistence_unavailable" : admitted.reason === "authority_conflict" ? "run_not_admittable" : admitted.reason };
	}
	return { outcome: "assembled", snapshot: admitted.snapshot };
}

/** Returns whether a command contains valid run coordinates and one deterministic compilation instant. */
function _isCommandValid(command: SessionAssemblyCommand): boolean
{
	return command.runId.trim().length > 0
		&& command.siloId.trim().length > 0
		&& (command.threadId === null || command.threadId.trim().length > 0)
		&& command.executionSubjectId.trim().length > 0
		&& command.requestIdempotencyKey.trim().length > 0;
}

/** Returns whether an instant is already the single UTC ISO-8601 representation used in a digest. */
function _isCanonicalUtcInstant(value: string): boolean
{
	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
		&& Number.isFinite(Date.parse(value))
		&& new Date(value).toISOString() === value;
}

/** Verifies that pinned membership evidence is complete and remains trusted at admission time. */
function _isIdentityFresh(identity: IdentityEnvelopeInput, requestedAt: string): boolean
{
	return identity.executionSubjectId.trim().length > 0
		&& identity.fleetMembershipIssuer.trim().length > 0
		&& identity.fleetMembershipIssuerKeyId.trim().length > 0
		&& identity.fleetMembershipAssertionId.trim().length > 0
		&& /^sha256:[0-9a-f]{64}$/.test(identity.fleetMembershipPayloadDigest)
		&& /^sha256:[0-9a-f]{64}$/.test(identity.capabilitySetDigest)
		&& Number.isSafeInteger(identity.fleetMembershipRevision)
		&& identity.fleetMembershipRevision >= 0
		&& _isCanonicalUtcInstant(identity.fleetMembershipTrustedUntil)
		&& Date.parse(identity.fleetMembershipTrustedUntil) > Date.parse(requestedAt);
}

/** Maps a loader refusal into the public all-or-nothing assembly result. */
function _denied(value: SessionAssemblyLoad<unknown>): AssembleRunInputSnapshotResult
{
	return value.outcome === "denied" ? { outcome: "denied", reason: value.reason } : { outcome: "denied", reason: "run_not_admittable" };
}

/** Compiles sorted source outputs into the one canonical shape and digests it without self-reference. */
function _compileSnapshot(command: SessionAssemblyCommand, admittedAt: string, run: InitialRunAuthority, persona: ApprovedPersonaInput, thread: ThreadContextInput, preferences: readonly { readonly id: string }[], memory: MemoryScopeInput, tools: ToolPolicyInput, budgetPolicy: JsonValue, identity: IdentityEnvelopeInput): RunInputSnapshot
{
	const withoutDigest = {
		runId: command.runId,
		siloId: command.siloId,
		agentServiceId: run.agentServiceId,
		agentRevisionId: run.agentRevisionId,
		snapshotVersion: _SNAPSHOT_VERSION,
		threadId: command.threadId,
		messageIds: [...thread.messageIds],
		personaRevisionId: persona.personaRevisionId,
		preferenceFactIds: _sortStrings(preferences.map(function _preferenceId(preference): string { return preference.id; })),
		artifactRevisionIds: _sortStrings(tools.artifactRevisionIds),
		skillRevisionIds: _sortStrings(tools.skillRevisionIds),
		memoryFacts: _canonicalMemoryFacts(memory.memoryFacts),
		memoryQueryPolicy: _cloneJson(memory.memoryQueryPolicy),
		toolGrantIds: _sortStrings(tools.toolGrantIds),
		modelRoute: _cloneJson(tools.modelRoute),
		budgetPolicy: _cloneJson(budgetPolicy),
		identitySnapshot: {
			executionSubjectId: identity.executionSubjectId,
			fleetMembershipRevision: identity.fleetMembershipRevision,
			fleetMembershipIssuer: identity.fleetMembershipIssuer,
			fleetMembershipIssuerKeyId: identity.fleetMembershipIssuerKeyId,
			fleetMembershipAssertionId: identity.fleetMembershipAssertionId,
			fleetMembershipPayloadDigest: identity.fleetMembershipPayloadDigest,
			fleetMembershipTrustedUntil: identity.fleetMembershipTrustedUntil,
		},
		capabilitySetDigest: identity.capabilitySetDigest,
		effectiveContractDigest: run.effectiveContractDigest,
		promptCompilerVersion: run.promptCompilerVersion,
		compiledAt: admittedAt,
	};
	const digest = __DigestRunInputSnapshot(withoutDigest);
	return { ...withoutDigest, digest };
}

/** Sorts copied identifiers without mutating source-owned arrays. */
function _sortStrings(values: readonly string[]): readonly string[]
{
	return [...values].sort(function _compare(left: string, right: string): number { return left.localeCompare(right); });
}

/** Sorts fact and provenance coordinates without retaining mutable authority-owned arrays. */
function _canonicalMemoryFacts(values: RunInputSnapshot["memoryFacts"]): RunInputSnapshot["memoryFacts"]
{
	return [...values].sort(function _compare(left, right): number
	{
		return `${left.datasetId}\u0000${left.factId}\u0000${left.contentDigest}`.localeCompare(`${right.datasetId}\u0000${right.factId}\u0000${right.contentDigest}`);
	}).map(function _canonicalFact(fact)
	{
		return {
			...fact,
			provenance: [...fact.provenance].sort(_compareProvenance).map(function _copyProvenance(provenance)
			{
				return { ...provenance };
			}),
		};
	});
}

/** Copies JSON through RFC 8785 canonical form so later caller mutation cannot change the stored value. */
function _cloneJson(value: JsonValue): JsonValue
{
	return JSON.parse(___CanonicalizeJson(value)) as JsonValue;
}

/** Orders provenance by every stable source coordinate before it contributes to the canonical digest. */
function _compareProvenance(left: RunInputSnapshot["memoryFacts"][number]["provenance"][number], right: RunInputSnapshot["memoryFacts"][number]["provenance"][number]): number
{
	const leftKey = `${left.sourceKind}\u0000${left.sourceId}\u0000${left.artifactRevisionId ?? ""}\u0000${left.sourceUserId ?? ""}\u0000${left.capturedAt}`;
	const rightKey = `${right.sourceKind}\u0000${right.sourceId}\u0000${right.artifactRevisionId ?? ""}\u0000${right.sourceUserId ?? ""}\u0000${right.capturedAt}`;
	return leftKey.localeCompare(rightKey);
}
