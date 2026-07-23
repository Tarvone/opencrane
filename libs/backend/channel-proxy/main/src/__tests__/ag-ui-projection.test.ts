import { AG_UI_PROJECTION_VERSION, type AgUiProjectionSourceEvent } from "@opencrane/contracts";
import { describe, expect, it } from "vitest";

import { __EncodeAgUiSseRecord, __ProjectAgUiEvent } from "../ag-ui-projection.js";

/** Construct one server-authorized safe source event for projection tests. */
function _Source(eventType: AgUiProjectionSourceEvent["eventType"], payload: AgUiProjectionSourceEvent["payload"] = {}): AgUiProjectionSourceEvent
{
	return { cursor: "event-4", threadId: "thread-2", runId: "run-3", sequence: 4, eventType, occurredAt: "2026-07-23T00:00:00.000Z", payload };
}

describe("AG-UI projection", () =>
{
	it("projects run lifecycle events with their authorized thread and run coordinates", () =>
	{
		expect(__ProjectAgUiEvent(_Source("run.accepted")).data).toEqual({ type: "RUN_STARTED", threadId: "thread-2", runId: "run-3" });
		expect(__ProjectAgUiEvent(_Source("run.started")).data).toEqual({ type: "RUN_STARTED", threadId: "thread-2", runId: "run-3" });
		expect(__ProjectAgUiEvent(_Source("run.completed")).data).toEqual({ type: "RUN_FINISHED", threadId: "thread-2", runId: "run-3" });
		expect(__ProjectAgUiEvent(_Source("run.cancelled")).data).toEqual({ type: "RUN_FINISHED", threadId: "thread-2", runId: "run-3" });
	});

	it("projects safe message and tool fields into standard protocol records", () =>
	{
		expect(__ProjectAgUiEvent(_Source("message.started", { messageId: "message-1" })).data).toEqual({ type: "TEXT_MESSAGE_START", messageId: "message-1", role: "assistant" });
		expect(__ProjectAgUiEvent(_Source("message.delta", { messageId: "message-1", delta: "hello" })).data).toEqual({ type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "hello" });
		expect(__ProjectAgUiEvent(_Source("message.completed", { messageId: "message-1" })).data).toEqual({ type: "TEXT_MESSAGE_END", messageId: "message-1" });
		expect(__ProjectAgUiEvent(_Source("tool.requested", { toolCallId: "tool-1", toolCallName: "search" })).data).toEqual({ type: "TOOL_CALL_START", toolCallId: "tool-1", toolCallName: "search" });
		expect(__ProjectAgUiEvent(_Source("tool.completed", { toolCallId: "tool-1", toolResult: "done" })).data).toEqual({ type: "TOOL_CALL_RESULT", toolCallId: "tool-1", content: "done" });
		expect(__ProjectAgUiEvent(_Source("tool.completed", { toolCallId: "tool-1" })).data).toEqual({ type: "TOOL_CALL_END", toolCallId: "tool-1" });
	});

	it("retains every unsupported or incomplete canonical event as a payload-free custom signal", () =>
	{
		const eventTypes: readonly AgUiProjectionSourceEvent["eventType"][] = ["tool.started", "tool.progress", "tool.approval_required", "context.compaction_started", "context.compaction_completed", "run.usage", "run.failed", "future.event"];
		for (const eventType of eventTypes)
		{
			expect(__ProjectAgUiEvent(_Source(eventType, { delta: "do-not-forward" })).data).toEqual({ type: "CUSTOM", name: `opencrane.${eventType.replaceAll(".", "_")}`, value: { eventType } });
		}
		expect(__ProjectAgUiEvent(_Source("message.delta")).data).toEqual({ type: "CUSTOM", name: "opencrane.message_delta", value: { eventType: "message.delta" } });
	});

	it("encodes a versioned projection as one bounded SSE record", () =>
	{
		const record = __ProjectAgUiEvent(_Source("run.started"));
		expect(AG_UI_PROJECTION_VERSION).toBe("opencrane.ag-ui.v1");
		expect(__EncodeAgUiSseRecord(record)).toBe("id: event-4\nevent: ag-ui\ndata: {\"type\":\"RUN_STARTED\",\"threadId\":\"thread-2\",\"runId\":\"run-3\"}\n\n");
	});

	it("refuses a cursor that could inject a second SSE field", () =>
	{
		const record = __ProjectAgUiEvent({ ..._Source("run.started"), cursor: "event-4\nevent: forged" });
		expect(() => __EncodeAgUiSseRecord(record)).toThrow("invalid SSE cursor");
	});
});
