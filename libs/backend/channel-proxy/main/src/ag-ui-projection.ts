import type { AgUiProjectionEvent, AgUiProjectionSourceEvent, AgUiSseRecord } from "@opencrane/contracts";

/** Project one server-authorized canonical event into the small, display-safe AG-UI subset. */
export function __ProjectAgUiEvent(source: AgUiProjectionSourceEvent): AgUiSseRecord
{
	return { id: source.cursor, event: "ag-ui", data: _Project(source) };
}

/** Encode one projected event as an SSE record without interpreting an upstream event stream. */
export function __EncodeAgUiSseRecord(record: AgUiSseRecord): string
{
	return `id: ${_SseIdentifier(record.id)}\nevent: ${record.event}\ndata: ${JSON.stringify(record.data)}\n\n`;
}

/** Select the narrowest standard event whose required display-safe fields are available. */
function _Project(source: AgUiProjectionSourceEvent): AgUiProjectionEvent
{
	switch (source.eventType)
	{
		case "run.accepted":
		case "run.started":
			return { type: "RUN_STARTED", threadId: source.threadId, runId: source.runId };
		case "run.completed":
		case "run.cancelled":
			return { type: "RUN_FINISHED", threadId: source.threadId, runId: source.runId };
		case "message.started":
			return typeof source.payload.messageId === "string"
				? { type: "TEXT_MESSAGE_START", messageId: source.payload.messageId, role: "assistant" }
				: _Custom(source);
		case "message.delta":
			return typeof source.payload.messageId === "string" && typeof source.payload.delta === "string"
				? { type: "TEXT_MESSAGE_CONTENT", messageId: source.payload.messageId, delta: source.payload.delta }
				: _Custom(source);
		case "message.completed":
			return typeof source.payload.messageId === "string"
				? { type: "TEXT_MESSAGE_END", messageId: source.payload.messageId }
				: _Custom(source);
		case "tool.requested":
			return typeof source.payload.toolCallId === "string" && typeof source.payload.toolCallName === "string"
				? { type: "TOOL_CALL_START", toolCallId: source.payload.toolCallId, toolCallName: source.payload.toolCallName }
				: _Custom(source);
		case "tool.completed":
			if (typeof source.payload.toolCallId !== "string") return _Custom(source);
			return typeof source.payload.toolResult === "string"
				? { type: "TOOL_CALL_RESULT", toolCallId: source.payload.toolCallId, content: source.payload.toolResult }
				: { type: "TOOL_CALL_END", toolCallId: source.payload.toolCallId };
		default:
			return _Custom(source);
	}
}

/** Keep unsupported, incomplete, and future source events observable without forwarding their payload. */
function _Custom(source: AgUiProjectionSourceEvent): AgUiProjectionEvent
{
	return { type: "CUSTOM", name: `opencrane.${source.eventType.replaceAll(".", "_")}`, value: { eventType: source.eventType } };
}

/** Refuse control characters so a corrupted cursor cannot inject a second SSE field. */
function _SseIdentifier(cursor: string): string
{
	if (/[\r\n]/.test(cursor))
	{
		throw new TypeError("invalid SSE cursor");
	}
	return cursor;
}
