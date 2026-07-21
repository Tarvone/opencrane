import type { JsonValue } from "@opencrane/util";

/** Terminal decision a reviewer may record for a deferred tool request. */
export type DeferredToolDecision = "approved" | "denied";

/** Exact pending deferred-tool request being decided, with the trusted decision instant. */
export interface DecideDeferredToolRequestCommand
{
	/** Approval row that gates the deferred tool invocation. */
	readonly approvalRequestId: string;
	/** Logical run the deferred request belongs to. */
	readonly runId: string;
	/** Current positive attempt the deferred request belongs to. */
	readonly attempt: number;
	/** Reviewer's terminal decision. */
	readonly decision: DeferredToolDecision;
	/** Subject who recorded the decision. */
	readonly decidedBy: string;
	/** Trusted decision instant. */
	readonly now: Date;
	/** Hash of the single-use resume token, set only on approval so exactly one resume can proceed. */
	readonly resumeTokenHash?: string;
	/** Canonical authorized deferred tool result fed back on resume, set only on approval. */
	readonly deferredToolResult?: JsonValue;
}

/** Exact reserved tool invocation to pause behind a new pending deferred-tool approval. */
export interface DeferToolRequestCommand
{
	/** Logical run proposing the external action. */
	readonly runId: string;
	/** Current positive run attempt. */
	readonly attempt: number;
	/** Reserved ToolInvocation row id the approval gates. */
	readonly toolInvocationRowId: string;
	/** Immutable tool revision being invoked, recorded as the approval's resource id. */
	readonly toolRevisionId: string;
	/** Digest of the normalised action arguments. */
	readonly argumentsDigest: string;
	/** Deterministic per-invocation digest; the unique run/attempt key makes deferral idempotent. */
	readonly actionDigest: string;
	/** Digest of the effective policy the approval is evaluated against. */
	readonly effectivePolicyDigest: string;
	/** Stable identifier of the approver policy revision that required the pause. */
	readonly approverPolicyRevision: string;
	/** Trusted creation instant. */
	readonly now: Date;
	/** Hard expiry after which the pending approval is no longer actionable. */
	readonly expiresAt: Date;
}

/** Result of creating (or idempotently replaying) one pending deferred-tool approval. */
export type DeferToolRequestResult =
	| { readonly outcome: "deferred"; readonly approvalRequestId: string }
	| { readonly outcome: "already_deferred"; readonly approvalRequestId: string }
	| { readonly outcome: "unavailable" };

/** Result of atomically deciding one pending deferred tool request. */
export type DecideDeferredToolRequestResult =
	| { readonly outcome: "approved"; readonly deferredToolResult: JsonValue }
	| { readonly outcome: "denied" }
	| { readonly outcome: "already_decided"; readonly decision: DeferredToolDecision }
	| { readonly outcome: "conflict" };
