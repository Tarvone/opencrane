import type { AppendRunEventCommand, AppendRunEventResult, ConversationAuthorityRepository } from "./conversation-authority.types.js";

/** Appends one canonical RunEvent through the serialized conversation authority. */
export async function __AppendRunEvent(repository: ConversationAuthorityRepository, command: AppendRunEventCommand): Promise<AppendRunEventResult>
{
	// 1. Reject malformed events before persistence so invalid runtime payloads never enter the authority.
	if (!command.runId.trim() || !Number.isSafeInteger(command.sequence) || command.sequence < 1 || !Number.isFinite(Date.parse(command.occurredAt)))
	{
		return { outcome: "denied", reason: "invalid_command" };
	}

	// 2. Delegate sequence and terminal fencing to one atomic database operation.
	const result = await repository.appendRunEventAtomically(command);

	// 3. Preserve stable denials so callers cannot mistake replay or terminal fencing for a retryable append.
	if (result.status === "appended") return { outcome: "appended", event: result.event };
	if (result.status === "sequence_conflict") return { outcome: "denied", reason: "sequence_conflict", nextSequence: result.nextSequence };
	return { outcome: "denied", reason: result.status };
}
