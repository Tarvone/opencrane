import type { RunEvent, RunEventType } from "@opencrane/models/agents";

/** Atomic append request bound to the caller's observed event sequence. */
export interface AppendRunEventCommand
{
	/** Run receiving the immutable event. */
	readonly runId: string;
	/** One-based sequence expected by the caller. */
	readonly sequence: number;
	/** Canonical public event type. */
	readonly type: RunEventType;
	/** Runtime-neutral event payload. */
	readonly payload: Readonly<Record<string, unknown>>;
	/** Canonical event timestamp. */
	readonly occurredAt: string;
}

/** Persistence result from one serialized event append. */
export type AtomicAppendRunEventResult =
	| { readonly status: "appended"; readonly event: RunEvent }
	| { readonly status: "sequence_conflict"; readonly nextSequence: number }
	| { readonly status: "terminal" }
	| { readonly status: "run_not_found" };

/** Persistence boundary that owns event-stream fencing and replay serialization. */
export interface ConversationAuthorityRepository
{
	/** Appends only when the run exists, is non-terminal, and sequence is exactly next. */
	appendRunEventAtomically(command: AppendRunEventCommand): Promise<AtomicAppendRunEventResult>;
}

/** Stable outcome exposed to conversation use cases. */
export type AppendRunEventResult =
	| { readonly outcome: "appended"; readonly event: RunEvent }
	| { readonly outcome: "denied"; readonly reason: "invalid_command" | "sequence_conflict" | "terminal" | "run_not_found"; readonly nextSequence?: number };
