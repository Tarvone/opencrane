import type { AgentRunId } from "@opencrane/models/agents";
import type { JsonValue } from "@opencrane/util";

import type { RunInputSnapshot } from "./run-input-snapshot.types.js";
import type { RuntimeAssignment } from "./runtime-assignment.types.js";

/** The only wire-protocol version accepted by the initial runtime boundary. */
export const AGENT_RUNTIME_PROTOCOL_V1 = "opencrane.agent-runtime/v1";

/** Exact protocol version literal carried by every runtime frame. */
export type AgentRuntimeProtocolVersion = typeof AGENT_RUNTIME_PROTOCOL_V1;

/** Immutable command coordinates shared by every runtime-directed command. */
export interface RuntimeCommandCoordinates
{
	/** Versioned runtime protocol selected by the control plane. */
	readonly protocolVersion: AgentRuntimeProtocolVersion;
	/** Runtime process instance that opened the authenticated command stream. */
	readonly runtimeInstanceId: string;
	/** Opaque idempotency key assigned by the control plane for this frame. */
	readonly commandId: string;
	/** Strictly monotonic command sequence for one runtime instance. */
	readonly sequence: number;
	/** Server-owned lease fence invalidating frames from older attempts. */
	readonly fence: number;
	/** ISO-8601 instant from which this command may be processed. */
	readonly issuedAt: string;
	/** ISO-8601 hard expiry after which this command is invalid. */
	expiresAt: string;
	/** Proof-bound workload assignment allowed to receive this command. */
	readonly assignment: RuntimeAssignment;
}

/** Starts one attempt with an exact immutable input snapshot. */
export interface StartAttemptCommand
{
	/** Canonical snapshot that is the sole runtime input authority. */
	readonly snapshot: RunInputSnapshot;
}

/** Resumes a paused attempt only with control-plane-authorized deferred results. */
export interface ResumeAttemptCommand
{
	/** Monotonic input generation that must still be current at resume. */
	readonly inputGeneration: number;
	/** Opaque canonical result payloads for previously deferred actions. */
	readonly deferredToolResults: JsonValue;
}

/** Stops one attempt without allowing the runtime to choose a terminal state. */
export interface CancelAttemptCommand
{
	/** Stable server-defined cancellation reason. */
	readonly reason: "cancelled" | "deadline_exceeded" | "budget_exhausted" | "capability_revoked";
}

/** Versioned command union issued by the control plane to one runtime instance. */
export type RuntimeCommand =
	| { readonly kind: "start_attempt"; readonly payload: StartAttemptCommand }
	| { readonly kind: "resume_attempt"; readonly payload: ResumeAttemptCommand }
	| { readonly kind: "cancel_attempt"; readonly payload: CancelAttemptCommand };

/** Complete control-plane command frame sent on the runtime-initiated stream. */
export type RuntimeCommandEnvelope = RuntimeCommandCoordinates & RuntimeCommand;

/** Coordinates required on every candidate returned by a runtime. */
export interface RuntimeCandidateCoordinates
{
	/** Versioned runtime protocol spoken by the candidate producer. */
	readonly protocolVersion: AgentRuntimeProtocolVersion;
	/** Runtime process instance returning the candidate. */
	readonly runtimeInstanceId: string;
	/** Command that caused this candidate. */
	readonly commandId: string;
	/** Candidate-local idempotency key. */
	readonly candidateId: string;
	/** Logical run receiving the candidate. */
	readonly runId: AgentRunId;
	/** Attempt whose current fence must accept the candidate. */
	readonly attempt: number;
	/** Server-owned lease fence carried from the accepted command. */
	readonly fence: number;
}

/** Runtime-proposed canonical event, never a direct durable write. */
export interface RuntimeEventCandidate extends RuntimeCandidateCoordinates
{
	/** Candidate category that requires control-plane event admission. */
	readonly kind: "event";
	/** Proposed canonical event type. */
	readonly eventType: string;
	/** Validated, bounded event body for the control-plane authority to inspect. */
	readonly payload: JsonValue;
}

/** Runtime request for an externally authorized action, never a direct tool call. */
export interface RuntimeExternalActionCandidate extends RuntimeCandidateCoordinates
{
	/** Candidate category requiring deferred external-action authorization. */
	readonly kind: "external_action";
	/** Immutable tool revision fixed by the accepted RunInputSnapshot. */
	readonly toolRevisionId: string;
	/** Caller-provided unique invocation identifier. */
	readonly toolInvocationId: string;
	/** Digest of normalized and validated action arguments. */
	readonly argumentsDigest: string;
	/** Protected argument payload or reference for server-side revalidation. */
	readonly arguments: JsonValue;
}

/** Candidate union returned by the runtime to the control-plane authority. */
export type RuntimeCandidate = RuntimeEventCandidate | RuntimeExternalActionCandidate;
