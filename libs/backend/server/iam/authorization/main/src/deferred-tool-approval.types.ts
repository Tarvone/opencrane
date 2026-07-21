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

/** Result of atomically deciding one pending deferred tool request. */
export type DecideDeferredToolRequestResult =
	| { readonly outcome: "approved"; readonly deferredToolResult: JsonValue }
	| { readonly outcome: "denied" }
	| { readonly outcome: "already_decided"; readonly decision: DeferredToolDecision }
	| { readonly outcome: "conflict" };
